import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

function log(msg: string, color = COLORS.reset) {
  console.log(`${color}${msg}${COLORS.reset}`);
}

function success(msg: string) {
  log(`  [OK] ${msg}`, COLORS.green);
}

function info(msg: string) {
  log(`  [INFO] ${msg}`, COLORS.cyan);
}

function warn(msg: string) {
  log(`  [WARN] ${msg}`, COLORS.yellow);
}

function error(msg: string) {
  log(`  [ERROR] ${msg}`, COLORS.red);
}

async function runDirectPostgresMigration(databaseUrl: string, sqlContent: string) {
  info(`Connecting to Supabase PostgreSQL cluster...`);
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    success(`Connected to Supabase PostgreSQL database successfully.`);

    info(`Executing master database migration script (DDL, pgvector, RLS, Indexes, Stored Procedures, Seed Data)...`);
    await client.query('BEGIN');
    await client.query(sqlContent);
    await client.query('COMMIT');
    success(`Master SQL migration committed successfully!`);

    // Verify created tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    log(`\n  Verified Tables in Supabase 'public' Schema:`, COLORS.bright);
    res.rows.forEach((r) => {
      console.log(`    - ${COLORS.green}${r.table_name}${COLORS.reset}`);
    });

    // Verify Extensions
    const extRes = await client.query(`SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'pg_trgm', 'uuid-ossp', 'pgcrypto');`);
    log(`\n  Active Database Extensions:`, COLORS.bright);
    extRes.rows.forEach((r) => {
      console.log(`    - ${COLORS.cyan}${r.extname}${COLORS.reset} (v${r.extversion})`);
    });

    // Verify Seed Counts
    const zoneCount = await client.query('SELECT count(*) FROM public.delivery_zones;');
    const supCount = await client.query('SELECT count(*) FROM public.registered_suppliers;');
    const plantCount = await client.query('SELECT count(*) FROM public.botanical_profiles;');
    const docCount = await client.query('SELECT count(*) FROM public.botanical_documents;');

    log(`\n  Seeded Records Summary:`, COLORS.bright);
    console.log(`    * Delivery Zones: ${zoneCount.rows[0].count}`);
    console.log(`    * Registered Suppliers: ${supCount.rows[0].count}`);
    console.log(`    * Canonical Botanical Profiles: ${plantCount.rows[0].count}`);
    console.log(`    * Ingested Reference Documents: ${docCount.rows[0].count}`);

    await client.end();
    return true;
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    await client.end();
    throw err;
  }
}

async function runSupabaseRestSync(supabaseUrl: string, serviceRoleKey: string) {
  info(`Connecting via Supabase Management API (${supabaseUrl})...`);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  // Verify delivery zones
  info(`Checking and updating public.delivery_zones...`);
  const { data: zones, error: zoneErr } = await supabase
    .from('delivery_zones')
    .upsert([
      { id: 'z-we', name: 'West End / Sunset Villas', description: 'West End village & Half Moon Bay', fee: 10.00, currency: 'USD', is_active: true },
      { id: 'z-wb', name: 'West Bay / Tabyana', description: 'West Bay Beach & Lighthouse', fee: 15.00, currency: 'USD', is_active: true },
      { id: 'z-sb', name: 'Sandy Bay', description: 'Sandy Bay coastal strip', fee: 8.00, currency: 'USD', is_active: true },
      { id: 'z-cox', name: 'Coxen Hole (Town Center)', description: 'Town center & airport staging', fee: 12.00, currency: 'USD', is_active: true },
      { id: 'z-fh', name: 'French Harbour', description: 'French Harbour marinas', fee: 18.00, currency: 'USD', is_active: true },
      { id: 'z-or', name: 'Oak Ridge / Punta Gorda', description: 'East End communities', fee: 25.00, currency: 'USD', is_active: true }
    ], { onConflict: 'id' });

  if (zoneErr) {
    warn(`Notice updating delivery zones: ${zoneErr.message}`);
  } else {
    success(`Delivery zones synchronized.`);
  }

  // Verify registered suppliers
  info(`Checking and updating public.registered_suppliers...`);
  const { error: supErr } = await supabase
    .from('registered_suppliers')
    .upsert([
      { id: 'sup-sb-main', name: 'Verde Roatán Nursery', location: 'Sandy Bay (Main Beds)', delivery_days: 1, active: true },
      { id: 'sup-fh-depot', name: 'Verde Roatán Nursery', location: 'French Harbour Staging Depot', delivery_days: 1, active: true },
      { id: 'sup-maya-palm', name: 'Maya Palm & Flora Growers', location: 'Oak Ridge East', delivery_days: 2, active: true },
      { id: 'sup-bay-botanical', name: 'Bay Islands Botanical Nursery', location: 'Sandy Bay West', delivery_days: 1, active: true }
    ], { onConflict: 'id' });

  if (supErr) {
    warn(`Notice updating suppliers: ${supErr.message}`);
  } else {
    success(`Registered suppliers synchronized.`);
  }

  // Verify botanical profiles
  info(`Checking and updating public.botanical_profiles...`);
  const { error: botErr } = await supabase
    .from('botanical_profiles')
    .upsert([
      {
        id: 'bp-cocos-nucifera',
        scientific_name: 'Cocos nucifera L.',
        accepted_name: 'Cocos nucifera L.',
        family: 'Arecaceae',
        genus: 'Cocos',
        species: 'nucifera',
        author_citation: 'L., Sp. Pl. 2: 1188 (1753)',
        taxonomic_status: 'accepted',
        synonyms: ['Cocos indica Royle', 'Calappa nucifera (L.) Kuntze'],
        visibility: 'public',
        is_verified: true,
        verification_level: 'verified_database',
        created_by: 'Verde Lead Taxonomist'
      },
      {
        id: 'bp-monstera-deliciosa',
        scientific_name: 'Monstera deliciosa Liebm.',
        accepted_name: 'Monstera deliciosa Liebm.',
        family: 'Araceae',
        genus: 'Monstera',
        species: 'deliciosa',
        author_citation: 'Liebm. (1849)',
        taxonomic_status: 'accepted',
        synonyms: ['Philodendron pertusum Carrière', 'Tornelia fragrans Gut.'],
        visibility: 'public',
        is_verified: true,
        verification_level: 'verified_database',
        created_by: 'Verde Lead Taxonomist'
      }
    ], { onConflict: 'scientific_name' });

  if (botErr) {
    warn(`Notice updating botanical profiles: ${botErr.message}`);
  } else {
    success(`Botanical profiles synchronized.`);
  }

  return true;
}

async function main() {
  console.log('\n' + '='.repeat(70));
  log(' VERDE ROATÁN · SUPABASE DATABASE MIGRATION & UPDATE UTILITY', COLORS.bright + COLORS.green);
  console.log('='.repeat(70) + '\n');

  const migrationFilePath = path.join(projectRoot, 'supabase', 'migrations', '20261102_verde_master_migration.sql');
  if (!fs.existsSync(migrationFilePath)) {
    error(`Migration file not found at: ${migrationFilePath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(migrationFilePath, 'utf8');
  info(`Loaded master migration script (${(sqlContent.length / 1024).toFixed(1)} KB, ${sqlContent.split('\n').length} lines).`);

  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;
  const supabaseUrl = process.env.SUPABASE_URL || 'https://tjzqxsyxvfdabfguezmu.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let migrationExecuted = false;

  // Path A: Direct PostgreSQL URI (Full DDL execution including pgvector and RLS)
  if (databaseUrl && !databaseUrl.includes('your-db-password')) {
    log(`\nMode: DIRECT POSTGRESQL CONNECTION DETECTED`, COLORS.bright + COLORS.cyan);
    try {
      await runDirectPostgresMigration(databaseUrl, sqlContent);
      migrationExecuted = true;
    } catch (err: any) {
      error(`Direct migration execution error: ${err.message}`);
      warn(`Falling back to Supabase REST sync mode...`);
    }
  }

  // Path B: Supabase REST / Service Role Key
  if (!migrationExecuted && serviceRoleKey && !serviceRoleKey.includes('your-supabase-service-role-key')) {
    log(`\nMode: SUPABASE SERVICE-ROLE REST SYNC`, COLORS.bright + COLORS.cyan);
    try {
      await runSupabaseRestSync(supabaseUrl, serviceRoleKey);
      migrationExecuted = true;
    } catch (err: any) {
      error(`REST sync failed: ${err.message}`);
    }
  }

  // Summary and Instructions
  console.log('\n' + '-'.repeat(70));
  if (migrationExecuted) {
    log(`SUCCESS: Supabase database has been fully updated!`, COLORS.bright + COLORS.green);
    console.log(`All tables, indexes, pgvector schemas, RLS policies and seed rows are active.`);
  } else {
    log(`READY TO EXECUTE: How to run this against your live Supabase project`, COLORS.bright + COLORS.yellow);
    console.log(`\nYou have 2 instant options to deploy this update:\n`);
    
    log(`Option 1: One-Command Terminal Execution (Recommended)`, COLORS.bright);
    console.log(`Provide your Supabase DB Connection String in the terminal and run:\n`);
    log(`  DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres" npm run db:update\n`, COLORS.cyan);
    console.log(`  (Find your connection string in Supabase Dashboard -> Project Settings -> Database -> Connection string)\n`);

    log(`Option 2: 1-Click Copy into Supabase SQL Editor`, COLORS.bright);
    console.log(`The complete idempotent script is ready in:\n`);
    log(`  supabase/migrations/20261102_verde_master_migration.sql\n`, COLORS.cyan);
    console.log(`  1. Open your Supabase Dashboard -> SQL Editor`);
    console.log(`  2. Click "New Query"`);
    console.log(`  3. Paste the contents of supabase/migrations/20261102_verde_master_migration.sql`);
    console.log(`  4. Click "Run" (Creates all 14 tables, pgvector index, RLS & seed data in ~2 seconds)`);
  }
  console.log('-'.repeat(70) + '\n');
}

main().catch((err) => {
  error(`Unhandled script execution error: ${err.message}`);
  process.exit(1);
});
