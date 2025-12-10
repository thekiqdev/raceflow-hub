import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const { Pool } = pg;

// Get current directory (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database connection configuration
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'raceflow_db',
  user: process.env.POSTGRES_USER || 'raceflow_user',
  password: process.env.POSTGRES_PASSWORD || 'raceflow_password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// List of migrations in order
const migrations = [
  '001_initial_schema.sql',
  '002_add_indexes.sql',
  '003_optimize_queries.sql',
  '004_admin_dashboard_views.sql',
  '005_add_user_status.sql',
  '006_financial_tables.sql',
  '007_knowledge_base_tables.sql',
  '008_system_settings.sql',
  '009_reports_views.sql',
  '010_support_tables.sql',
  '011_organizer_dashboard_views.sql',
  '012_organizer_settings.sql',
  '013_add_variant_group_name.sql',
  '014_add_variant_quantity.sql',
  '015_add_variant_sku_price.sql',
  '016_add_variant_attributes.sql',
  '017_add_profile_is_public.sql',
  '018_allow_null_valid_from.sql',
  '020_create_asaas_customers.sql',
  '021_create_asaas_payments.sql',
  '022_create_asaas_webhook_events.sql',
  '023_add_asaas_payment_id_to_registrations.sql',
];

// Create migrations tracking table
async function createMigrationsTable(client: pg.PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
}

// Check if migration was already executed
async function isMigrationExecuted(client: pg.PoolClient, migrationName: string): Promise<boolean> {
  const result = await client.query(
    'SELECT 1 FROM schema_migrations WHERE migration_name = $1',
    [migrationName]
  );
  return result.rows.length > 0;
}

// Mark migration as executed
async function markMigrationExecuted(client: pg.PoolClient, migrationName: string) {
  await client.query(
    'INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT (migration_name) DO NOTHING',
    [migrationName]
  );
}

// Execute a single migration
async function executeMigration(client: pg.PoolClient, migrationName: string) {
  const migrationPath = join(__dirname, '..', 'migrations', migrationName);
  
  console.log(`📄 Lendo arquivo: ${migrationPath}`);
  
  try {
    const sql = readFileSync(migrationPath, 'utf-8');
    
    console.log(`🔄 Executando migração: ${migrationName}`);
    
    await client.query('BEGIN');
    
    try {
      await client.query(sql);
      await markMigrationExecuted(client, migrationName);
      await client.query('COMMIT');
      
      console.log(`✅ Migração ${migrationName} executada com sucesso!`);
      return true;
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.error(`❌ Arquivo de migração não encontrado: ${migrationPath}`);
      return false;
    }
    throw error;
  }
}

// Main function
async function runMigrations() {
  console.log('🚀 Iniciando execução de migrações...\n');
  console.log('📊 Configuração do banco:');
  console.log(`   Host: ${process.env.POSTGRES_HOST || 'localhost'}`);
  console.log(`   Database: ${process.env.POSTGRES_DB || 'raceflow_db'}`);
  console.log(`   User: ${process.env.POSTGRES_USER || 'raceflow_user'}\n`);

  const client = await pool.connect();

  try {
    // Create migrations tracking table
    await createMigrationsTable(client);

    let executed = 0;
    let skipped = 0;
    let failed = 0;

    for (const migration of migrations) {
      const isExecuted = await isMigrationExecuted(client, migration);

      if (isExecuted) {
        console.log(`⏭️  Migração ${migration} já foi executada. Pulando...`);
        skipped++;
        continue;
      }

      try {
        const success = await executeMigration(client, migration);
        if (success) {
          executed++;
        } else {
          failed++;
        }
      } catch (error: any) {
        console.error(`❌ Erro ao executar migração ${migration}:`, error.message);
        failed++;
        // Continue with next migration even if one fails
        // You can change this behavior if needed
      }

      console.log(''); // Empty line for readability
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Resumo:');
    console.log(`   ✅ Executadas: ${executed}`);
    console.log(`   ⏭️  Puladas: ${skipped}`);
    console.log(`   ❌ Falhas: ${failed}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (failed > 0) {
      console.log('\n⚠️  Algumas migrações falharam. Verifique os erros acima.');
      process.exit(1);
    } else {
      console.log('\n✨ Todas as migrações foram executadas com sucesso!');
    }
  } catch (error: any) {
    console.error('\n❌ Erro fatal ao executar migrações:', error);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

// Run migrations
runMigrations()
  .then(() => {
    console.log('\n✅ Script finalizado.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });

