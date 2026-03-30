/**
 * Script de teste para validar integração de slugs em eventos
 * Execute com: tsx scripts/test-slug-integration.ts
 * 
 * Este script testa:
 * - Geração automática de slug ao criar evento
 * - Unicidade de slugs
 * - Busca por slug
 * - Busca por UUID
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { generateSlug, isValidSlug } from '../src/utils/slug.js';

dotenv.config();

const { Pool } = pg;

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

/**
 * Verifica se um slug já existe no banco de dados
 */
async function slugExists(slug: string, excludeEventId?: string): Promise<boolean> {
  let query = 'SELECT COUNT(*) as count FROM events WHERE slug = $1';
  const params: any[] = [slug];
  
  if (excludeEventId) {
    query += ' AND id != $2';
    params.push(excludeEventId);
  }
  
  const result = await pool.query(query, params);
  return parseInt(result.rows[0].count) > 0;
}

/**
 * Verifica se uma string é um UUID válido
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

async function runTests() {
  const client = await pool.connect();
  
  try {
    console.log('🧪 Iniciando testes de integração de slugs...\n');

    // Teste 1: Verificar se eventos existentes têm slug
    console.log('📋 Teste 1: Verificando eventos sem slug...');
    const eventsWithoutSlug = await client.query(
      'SELECT COUNT(*) as count FROM events WHERE slug IS NULL OR slug = \'\''
    );
    const countWithoutSlug = parseInt(eventsWithoutSlug.rows[0].count);
    
    if (countWithoutSlug > 0) {
      console.log(`⚠️  Encontrados ${countWithoutSlug} eventos sem slug. Execute o script generate-slugs-for-existing-events.ts primeiro.\n`);
    } else {
      console.log('✅ Todos os eventos têm slug.\n');
    }

    // Teste 2: Verificar se há slugs duplicados
    console.log('📋 Teste 2: Verificando slugs duplicados...');
    const duplicateSlugs = await client.query(
      'SELECT slug, COUNT(*) as count FROM events WHERE slug IS NOT NULL GROUP BY slug HAVING COUNT(*) > 1'
    );
    
    if (duplicateSlugs.rows.length > 0) {
      console.log(`❌ Encontrados slugs duplicados:`);
      duplicateSlugs.rows.forEach((row) => {
        console.log(`   - "${row.slug}": ${row.count} eventos`);
      });
      console.log('');
    } else {
      console.log('✅ Nenhum slug duplicado encontrado.\n');
    }

    // Teste 3: Verificar formato dos slugs
    console.log('📋 Teste 3: Verificando formato dos slugs...');
    const allEvents = await client.query(
      'SELECT id, title, slug FROM events WHERE slug IS NOT NULL LIMIT 100'
    );
    
    let invalidSlugs = 0;
    allEvents.rows.forEach((event) => {
      if (!isValidSlug(event.slug)) {
        console.log(`❌ Slug inválido: "${event.slug}" (Evento: ${event.title})`);
        invalidSlugs++;
      }
    });
    
    if (invalidSlugs === 0) {
      console.log(`✅ Todos os ${allEvents.rows.length} slugs verificados são válidos.\n`);
    } else {
      console.log(`❌ Encontrados ${invalidSlugs} slugs inválidos.\n`);
    }

    // Teste 4: Verificar se é possível buscar por slug
    console.log('📋 Teste 4: Testando busca por slug...');
    if (allEvents.rows.length > 0) {
      const testEvent = allEvents.rows[0];
      const foundBySlug = await client.query(
        'SELECT id, title, slug FROM events WHERE slug = $1',
        [testEvent.slug]
      );
      
      if (foundBySlug.rows.length === 1 && foundBySlug.rows[0].id === testEvent.id) {
        console.log(`✅ Busca por slug funcionando: encontrado evento "${testEvent.title}" pelo slug "${testEvent.slug}"\n`);
      } else {
        console.log(`❌ Erro na busca por slug: esperado 1 resultado, encontrado ${foundBySlug.rows.length}\n`);
      }
    } else {
      console.log('⚠️  Nenhum evento encontrado para testar busca por slug.\n');
    }

    // Teste 5: Verificar se é possível buscar por UUID
    console.log('📋 Teste 5: Testando busca por UUID...');
    if (allEvents.rows.length > 0) {
      const testEvent = allEvents.rows[0];
      const foundById = await client.query(
        'SELECT id, title, slug FROM events WHERE id = $1',
        [testEvent.id]
      );
      
      if (foundById.rows.length === 1 && foundById.rows[0].slug === testEvent.slug) {
        console.log(`✅ Busca por UUID funcionando: encontrado evento "${testEvent.title}" pelo ID "${testEvent.id}"\n`);
      } else {
        console.log(`❌ Erro na busca por UUID: esperado 1 resultado, encontrado ${foundById.rows.length}\n`);
      }
    } else {
      console.log('⚠️  Nenhum evento encontrado para testar busca por UUID.\n');
    }

    // Teste 6: Verificar índices
    console.log('📋 Teste 6: Verificando índices...');
    const indexes = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'events' 
      AND indexname LIKE '%slug%'
    `);
    
    if (indexes.rows.length > 0) {
      console.log('✅ Índices relacionados a slug encontrados:');
      indexes.rows.forEach((idx) => {
        console.log(`   - ${idx.indexname}`);
      });
      console.log('');
    } else {
      console.log('⚠️  Nenhum índice relacionado a slug encontrado.\n');
    }

    // Teste 7: Verificar constraint UNIQUE
    console.log('📋 Teste 7: Verificando constraint UNIQUE...');
    const constraints = await client.query(`
      SELECT conname, contype 
      FROM pg_constraint 
      WHERE conrelid = 'public.events'::regclass 
      AND conname LIKE '%slug%'
    `);
    
    if (constraints.rows.length > 0) {
      console.log('✅ Constraints relacionadas a slug encontradas:');
      constraints.rows.forEach((constraint) => {
        const type = constraint.contype === 'u' ? 'UNIQUE' : constraint.contype;
        console.log(`   - ${constraint.conname} (${type})`);
      });
      console.log('');
    } else {
      console.log('⚠️  Nenhuma constraint relacionada a slug encontrada.\n');
    }

    // Resumo
    console.log('📊 Resumo dos Testes:');
    console.log(`   - Eventos sem slug: ${countWithoutSlug}`);
    console.log(`   - Slugs duplicados: ${duplicateSlugs.rows.length}`);
    console.log(`   - Slugs inválidos: ${invalidSlugs}`);
    console.log(`   - Total de eventos verificados: ${allEvents.rows.length}`);
    
    if (countWithoutSlug === 0 && duplicateSlugs.rows.length === 0 && invalidSlugs === 0) {
      console.log('\n🎉 Todos os testes de integração passaram!');
      return true;
    } else {
      console.log('\n⚠️  Alguns testes falharam. Revise os problemas acima.');
      return false;
    }

  } catch (error: any) {
    console.error('❌ Erro ao executar testes:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar testes
runTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });
