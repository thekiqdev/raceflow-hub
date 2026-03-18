/**
 * Script para gerar slugs para eventos existentes que ainda não têm slug
 * Execute com: tsx scripts/generate-slugs-for-existing-events.ts
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { generateSlug } from '../src/utils/slug.js';

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
 * Garante que um slug seja único, adicionando sufixo numérico se necessário
 * Começa com -1, depois -2, -3, etc.
 */
async function ensureUniqueSlug(baseSlug: string, excludeEventId?: string): Promise<string> {
  // Verificar se o slug base já é único
  const exists = await slugExists(baseSlug, excludeEventId);
  
  if (!exists) {
    return baseSlug;
  }

  // Tentar adicionar sufixos numéricos até encontrar um único
  // Começa com 1 (não 2) para seguir o padrão: -1, -2, -3, etc.
  let counter = 1;
  let candidateSlug = `${baseSlug}-${counter}`;
  
  // Limitar tentativas para evitar loop infinito
  const maxAttempts = 1000;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const candidateExists = await slugExists(candidateSlug, excludeEventId);
    
    if (!candidateExists) {
      return candidateSlug;
    }

    counter++;
    candidateSlug = `${baseSlug}-${counter}`;
    attempts++;
  }

  // Se não encontrou um slug único após muitas tentativas, adicionar timestamp
  const timestamp = Date.now();
  return `${baseSlug}-${timestamp}`;
}

/**
 * Gera e atualiza slugs para todos os eventos que não têm slug
 */
async function generateSlugsForExistingEvents() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Iniciando geração de slugs para eventos existentes...\n');

    // Buscar todos os eventos sem slug
    const eventsResult = await client.query(
      'SELECT id, title FROM events WHERE slug IS NULL OR slug = \'\' ORDER BY created_at ASC'
    );

    const events = eventsResult.rows;
    const totalEvents = events.length;

    if (totalEvents === 0) {
      console.log('✅ Todos os eventos já têm slug. Nada a fazer.');
      return;
    }

    console.log(`📊 Encontrados ${totalEvents} eventos sem slug.\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ id: string; title: string; error: string }> = [];

    // Processar cada evento
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const progress = `[${i + 1}/${totalEvents}]`;
      
      try {
        // Gerar slug base
        const baseSlug = generateSlug(event.title);
        
        // Garantir unicidade
        const uniqueSlug = await ensureUniqueSlug(baseSlug, event.id);
        
        // Atualizar evento com o slug
        await client.query(
          'UPDATE events SET slug = $1 WHERE id = $2',
          [uniqueSlug, event.id]
        );

        console.log(`${progress} ✅ "${event.title}" → "${uniqueSlug}"`);
        successCount++;
      } catch (error: any) {
        console.error(`${progress} ❌ Erro ao processar evento "${event.title}":`, error.message);
        errors.push({
          id: event.id,
          title: event.title,
          error: error.message
        });
        errorCount++;
      }
    }

    // Resumo
    console.log('\n📊 Resumo:');
    console.log(`✅ Sucesso: ${successCount}`);
    console.log(`❌ Erros: ${errorCount}`);
    console.log(`📈 Total processado: ${totalEvents}`);

    if (errors.length > 0) {
      console.log('\n⚠️  Eventos com erro:');
      errors.forEach((err) => {
        console.log(`   - ${err.title} (${err.id}): ${err.error}`);
      });
    }

    // Verificar se ainda há eventos sem slug
    const remainingResult = await client.query(
      'SELECT COUNT(*) as count FROM events WHERE slug IS NULL OR slug = \'\''
    );
    const remaining = parseInt(remainingResult.rows[0].count);

    if (remaining === 0) {
      console.log('\n✅ Todos os eventos agora têm slug!');
    } else {
      console.log(`\n⚠️  Ainda há ${remaining} eventos sem slug.`);
    }

  } catch (error: any) {
    console.error('❌ Erro fatal:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar script
generateSlugsForExistingEvents()
  .then(() => {
    console.log('\n🎉 Script concluído com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Erro ao executar script:', error);
    process.exit(1);
  });
