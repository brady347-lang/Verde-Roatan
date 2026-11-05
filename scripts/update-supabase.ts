import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const TARGET_PROJECT_REF = 'moaqgqbqfeckeabigfha';
const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
const migrationPath = path.join(projectRoot, 'supabase', 'migrations', '20261102_verde_master_migration.sql');

function requireValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function verifyTarget(supabaseUrl: string, databaseUrl: string): void {
  const expectedUrl = `https://${TARGET_PROJECT_REF}.supabase.co`;
  if (supabaseUrl.replace(/\/$/, '') !== expectedUrl) {
    throw new Error(`Target mismatch: SUPABASE_URL must be exactly ${expectedUrl}`);
  }
  if (!databaseUrl.includes(TARGET_PROJECT_REF)) {
    throw new Error('Target mismatch: DATABASE_URL does not contain the approved Supabase project reference.');
  }
  if (process.env.CONFIRM_SUPABASE_PROJECT_REF !== TARGET_PROJECT_REF) {
    throw new Error('Safety confirmation missing. Set CONFIRM_SUPABASE_PROJECT_REF to the approved project reference.');
  }
}

async function main(): Promise<void> {
  if (!fs.existsSync(migrationPath)) throw new Error(`Migration file not found: ${migrationPath}`);

  const sql = fs.readFileSync(migrationPath, 'utf8');
  const supabaseUrl = requireValue('SUPABASE_URL');
  const databaseUrl = requireValue('DATABASE_URL');
  verifyTarget(supabaseUrl, databaseUrl);

  console.log('Verde Roatán database migration preflight');
  console.log(`Approved Supabase project: ${TARGET_PROJECT_REF}`);
  console.log(`Migration file: ${path.relative(projectRoot, migrationPath)}`);
  console.log(`SQL size: ${(sql.length / 1024).toFixed(1)} KB`);
  console.log('No REST fallback or automatic seed synchronization is available.');

  if (!process.argv.includes('--apply')) {
    console.log('DRY RUN ONLY. No database connection was opened and no data was changed.');
    console.log('After reviewing the migration and backing up the target project, pass --apply to execute it.');
    return;
  }

  if (process.env.ALLOW_SUPABASE_MIGRATION !== 'true') {
    throw new Error('Execution blocked. Set ALLOW_SUPABASE_MIGRATION=true only after reviewing the SQL and confirming a backup.');
  }

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000
  });

  try {
    await client.connect();
    const identity = await client.query('select current_database() as database_name, current_user as database_user');
    console.log(`Connected to database "${identity.rows[0].database_name}" as "${identity.rows[0].database_user}".`);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration SQL committed. Verify schema, RLS policies, and application flows before production use.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Migration stopped safely: ${message}`);
  process.exitCode = 1;
});
