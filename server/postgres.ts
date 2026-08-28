import pg, { Pool, PoolConfig } from 'pg';

declare global {
  var _serverPgPool: Pool | undefined;
}

/**
 * Direct PostgreSQL connection pool for Node.js server.
 * Connects directly using the native 'pg' driver without Drizzle or ORM bloat.
 */
export function getPostgresPool(): Pool {
  if (!global._serverPgPool) {
    const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    const sslEnabled = process.env.SQL_SSL === 'true';

    let config: PoolConfig;

    if (connectionString) {
      config = {
        connectionString,
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
        max: 10,
        connectionTimeoutMillis: 15000,
      };
    } else {
      config = {
        host: process.env.SQL_HOST || '127.0.0.1',
        port: process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 5432,
        user: process.env.SQL_USER || process.env.SQL_ADMIN_USER || 'postgres',
        password: process.env.SQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD || '',
        database: process.env.SQL_DB_NAME || 'postgres',
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
        max: 10,
        connectionTimeoutMillis: 15000,
      };
    }

    global._serverPgPool = new Pool(config);

    global._serverPgPool.on('error', (err) => {
      console.error('PostgreSQL idle client notice:', err.message);
    });
  }

  return global._serverPgPool;
}

/**
 * Execute a raw parameterized query on PostgreSQL directly.
 */
export async function queryPostgres<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const pool = getPostgresPool();
  const res = await pool.query(sql, params);
  return res.rows;
}
