import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const client = await pool.connect(); const schema = `verify_${randomUUID().replaceAll('-', '')}`;
try { await client.query('BEGIN'); await client.query(`CREATE SCHEMA ${schema}`); await client.query(`SET LOCAL search_path TO ${schema}, public`); await client.query(await readFile(join(dirname(fileURLToPath(import.meta.url)), '../../database/db.sql'), 'utf8')); const { rows } = await client.query("SELECT COUNT(*)::int AS total FROM information_schema.tables WHERE table_schema=$1", [schema]); if (rows[0].total < 9) throw new Error(`Schema verification expected at least 9 tables, found ${rows[0].total}`); await client.query('ROLLBACK'); console.log('database/db.sql verified successfully'); }
catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); await pool.end(); }
