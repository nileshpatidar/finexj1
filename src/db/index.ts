import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema';

// Add global connection pool caching to persist across hot-reloads
declare global {
  var _postgresPool: Pool | undefined;
  var _drizzleDb: NodePgDatabase<typeof schema> | undefined;
}

// Function to create or retrieve the connection pool lazily.
export const createPool = (): Pool | null => {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const hasHostParams = Boolean(process.env.SQL_HOST && (process.env.SQL_USER || process.env.SQL_ADMIN_USER));

  if (!connectionString && !hasHostParams) {
    return null;
  }

  if (!global._postgresPool) {
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
        host: process.env.SQL_HOST,
        port: process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 5432,
        user: process.env.SQL_USER || process.env.SQL_ADMIN_USER,
        password: process.env.SQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD,
        database: process.env.SQL_DB_NAME,
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
        max: 10,
        connectionTimeoutMillis: 15000,
      };
    }

    global._postgresPool = new Pool(config);

    // Prevent unhandled pool-level errors from crashing the application
    global._postgresPool.on('error', (err) => {
      console.warn('Unexpected error on idle SQL pool client:', err.message);
    });
  }
  return global._postgresPool;
};

// Lazy Drizzle Database instance
export const getDb = (): NodePgDatabase<typeof schema> | null => {
  if (global._drizzleDb) {
    return global._drizzleDb;
  }
  const poolInstance = createPool();
  if (!poolInstance) {
    return null;
  }
  global._drizzleDb = drizzle(poolInstance, { schema });
  return global._drizzleDb;
};

// Proxy to allow db.select() syntax with lazy initialization
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(target, prop, receiver) {
    const instance = getDb();
    if (!instance) {
      throw new Error('Database is not initialized. Please configure DATABASE_URL or SQL credentials.');
    }
    const val = (instance as any)[prop];
    if (typeof val === 'function') {
      return val.bind(instance);
    }
    return val;
  },
});

export { schema };


