import pg from 'pg';
import { config } from '../config.js';
const { Pool } = pg;
export const createDatabasePool = (options = config.database) => new Pool({ connectionString: options.url, max: options.max, connectionTimeoutMillis: options.connectionTimeoutMillis, query_timeout: options.queryTimeout, ssl: options.ssl });
export const pool = createDatabasePool();
export async function verifyDatabase(db = pool) { await db.query('SELECT 1'); }
export async function closeDatabase(db = pool) { await db.end(); }
