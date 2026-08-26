import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load environment variables from .env file.
dotenv.config();

const connectionString = process.env.DATABASE_URL;
const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;
const sslEnabled = process.env.SQL_SSL === "true";

if (!connectionString && (!sqlHost || !sqlDbName || !user || !password)) {
  throw new Error(
    "Database credentials missing. Set DATABASE_URL or SQL_HOST, SQL_DB_NAME, SQL_ADMIN_USER, and SQL_ADMIN_PASSWORD."
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: connectionString
    ? {
        url: connectionString,
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
      }
    : {
        host: sqlHost!,
        port: process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 5432,
        user: user!,
        password: password!,
        database: sqlDbName!,
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
      },
  verbose: true,
});

