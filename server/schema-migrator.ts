import { getPostgresPool } from './postgres';
import { getServerSupabase, isServerSupabaseReady } from './supabase';
import { config } from './config';
import fs from 'fs';
import path from 'path';

export interface DbTestResult {
  supabaseJsReady: boolean;
  supabaseJsError?: string;
  postgresPoolReady: boolean;
  postgresPoolError?: string;
  tablesFound: string[];
  tablesCreated: string[];
  latencyMs: number;
  connectionType: 'SUPABASE_URL' | 'DATABASE_URL' | 'HOST_PARAMS' | 'NONE';
  timestamp: string;
}

export async function testAndMigrateDatabase(): Promise<DbTestResult> {
  const startTime = Date.now();
  const result: DbTestResult = {
    supabaseJsReady: false,
    postgresPoolReady: false,
    tablesFound: [],
    tablesCreated: [],
    latencyMs: 0,
    connectionType: 'NONE',
    timestamp: new Date().toISOString(),
  };

  // 1. Determine connection type
  if (config.databaseUrl) {
    result.connectionType = 'DATABASE_URL';
  } else if (config.sqlHost) {
    result.connectionType = 'HOST_PARAMS';
  } else if (config.supabaseUrl) {
    result.connectionType = 'SUPABASE_URL';
  }

  // 2. Test Supabase JS Client
  if (isServerSupabaseReady()) {
    try {
      const supabase = getServerSupabase();
      const testTables = [
        'users',
        'deposits',
        'withdrawals',
        'daily_performances',
        'earnings',
        'ledger',
        'audit_logs',
        'system_settings',
      ];
      
      const found: string[] = [];
      for (const tableName of testTables) {
        const { error } = await supabase.from(tableName).select('id').limit(1);
        if (!error) {
          found.push(tableName);
        } else if (
          !error.message.includes('does not exist') &&
          !error.message.includes('relation')
        ) {
          result.supabaseJsError = error.message;
        }
      }

      result.supabaseJsReady = true;
      if (found.length > 0) {
        result.tablesFound = Array.from(new Set([...result.tablesFound, ...found]));
      }
    } catch (err) {
      result.supabaseJsError = (err as Error).message;
    }
  } else {
    result.supabaseJsError = 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured in environment.';
  }

  // 3. Test Direct Postgres Pool Connection & Run Schema Migrations
  const hasPostgresCredentials = Boolean(
    config.databaseUrl ||
    (config.sqlHost && config.sqlUser)
  );

  if (hasPostgresCredentials) {
    try {
      const pool = getPostgresPool();
      const client = await pool.connect();

      try {
        // Read the schema SQL
        const schemaPath = path.join(process.cwd(), 'supabase_schema.sql');
        let sqlContent = '';
        if (fs.existsSync(schemaPath)) {
          sqlContent = fs.readFileSync(schemaPath, 'utf-8');
        }

        if (sqlContent) {
          // Clean comments and execute individual statements to handle each gracefully
          const statements = sqlContent
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && !s.startsWith('--'));

          for (const stmt of statements) {
            try {
              if (stmt.toUpperCase().includes('CREATE EXTENSION')) {
                continue; // Skip extensions to avoid permission errors on managed DBs
              }
              await client.query(stmt);
            } catch (stmtErr: any) {
              // Ignore non-fatal warnings or already existing indexes/tables
              const msg = stmtErr?.message || '';
              if (
                !msg.includes('already exists') &&
                !msg.includes('duplicate key') &&
                !msg.includes('permission denied to create extension')
              ) {
                console.warn('SQL statement execution notice:', msg);
              }
            }
          }
        }

        // Query existing tables in public schema
        const tablesQuery = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name;
        `);

        result.tablesFound = tablesQuery.rows.map((r: any) => r.table_name);
        result.postgresPoolReady = true;
        result.tablesCreated = result.tablesFound;
      } finally {
        client.release();
      }
    } catch (err) {
      result.postgresPoolError = (err as Error).message;
    }
  } else {
    result.postgresPoolError = 'No DATABASE_URL, SUPABASE_DB_URL, or SQL_HOST provided in environment variables.';
  }

  result.latencyMs = Date.now() - startTime;
  return result;
}
