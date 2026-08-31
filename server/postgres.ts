import pg, { Pool, PoolConfig } from 'pg';
import { config } from './config';

declare global {
  var _serverPgPool: Pool | undefined;
}

/**
 * Direct PostgreSQL connection pool for Node.js server.
 * Connects directly using the native 'pg' driver without Drizzle or ORM bloat.
 */
export function getPostgresPool(): Pool {
  if (!global._serverPgPool) {
    const connectionString = config.databaseUrl;
    const sslEnabled = config.sqlSsl;

    let poolConfig: PoolConfig;

    if (connectionString) {
      poolConfig = {
        connectionString,
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
        max: 10,
        connectionTimeoutMillis: 15000,
      };
    } else {
      poolConfig = {
        host: config.sqlHost || '127.0.0.1',
        port: config.sqlPort || 5432,
        user: config.sqlUser || 'postgres',
        password: config.sqlPassword || '',
        database: config.sqlDbName || 'postgres',
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
        max: 10,
        connectionTimeoutMillis: 15000,
      };
    }

    global._serverPgPool = new Pool(poolConfig);

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
