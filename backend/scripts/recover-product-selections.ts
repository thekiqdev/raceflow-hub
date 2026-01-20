/**
 * Script para tentar recuperar seleções de produtos de inscrições antigas
 * 
 * Este script tenta recuperar atributos de inscrições que foram feitas
 * mas não tiveram os atributos salvos na tabela registration_product_selections.
 * 
 * IMPORTANTE: Este script só pode recuperar dados se:
 * 1. A inscrição foi feita com variant_id e o nome da variante ainda existe
 * 2. O produto ainda tem variant_attributes configurado
 * 3. O nome da variante segue o formato "Value1 - Value2 - ..."
 * 
 * Se os dados não foram salvos originalmente, não há como recuperá-los.
 */

import { query } from '../src/config/database.js';

interface RegistrationToRecover {
  registration_id: string;
  kit_id: string;
  created_at: Date;
}

interface ProductVariant {
  product_id: string;
  product_name: string;
  variant_attributes: string[];
}

interface VariantInfo {
  variant_id: string;
  variant_name: string;
  product_id: string;
}

async function recoverProductSelections() {
  console.log('🔍 Iniciando recuperação de seleções de produtos...\n');

  try {
    // Encontrar inscrições que têm kit mas não têm seleções de produtos
    const registrationsResult = await query(`
      SELECT DISTINCT r.id as registration_id, r.kit_id, r.created_at
      FROM registrations r
      WHERE r.kit_id IS NOT NULL
        AND r.status != 'cancelled'
        AND NOT EXISTS (
          SELECT 1 FROM registration_product_selections rps
          WHERE rps.registration_id = r.id
        )
      ORDER BY r.created_at DESC
      LIMIT 1000
    `);

    const registrations: RegistrationToRecover[] = registrationsResult.rows;
    console.log(`📊 Encontradas ${registrations.length} inscrições sem seleções de produtos\n`);

    let recovered = 0;
    let skipped = 0;
    let errors = 0;

    for (const reg of registrations) {
      try {
        // Buscar produtos variáveis do kit
        const productsResult = await query(`
          SELECT kp.id as product_id, kp.name as product_name, kp.variant_attributes
          FROM kit_products kp
          WHERE kp.kit_id = $1
            AND kp.type = 'variable'
            AND kp.variant_attributes IS NOT NULL
            AND array_length(kp.variant_attributes, 1) > 0
        `, [reg.kit_id]);

        if (productsResult.rows.length === 0) {
          skipped++;
          continue;
        }

        const products: ProductVariant[] = productsResult.rows.map(row => ({
          product_id: row.product_id,
          product_name: row.product_name,
          variant_attributes: row.variant_attributes as string[],
        }));

        // Para cada produto, tentar encontrar variantes e recuperar atributos
        let hasRecovered = false;

        for (const product of products) {
          // Buscar todas as variantes deste produto
          const variantsResult = await query(`
            SELECT pv.id as variant_id, pv.name as variant_name, pv.product_id
            FROM product_variants pv
            WHERE pv.product_id = $1
          `, [product.product_id]);

          if (variantsResult.rows.length === 0) {
            continue;
          }

          const variants: VariantInfo[] = variantsResult.rows.map(row => ({
            variant_id: row.variant_id,
            variant_name: row.variant_name,
            product_id: row.product_id,
          }));

          // Tentar recuperar atributos de cada variante
          // Como não sabemos qual variante foi usada, vamos tentar todas
          // e usar a primeira que conseguir parsear corretamente
          for (const variant of variants) {
            try {
              // Parse variant name (format: "Value1 - Value2 - ...")
              const variantValues = variant.variant_name.split(' - ').map(v => v.trim());

              if (variantValues.length === product.variant_attributes.length) {
                // Encontramos uma correspondência! Salvar os atributos
                for (let i = 0; i < product.variant_attributes.length && i < variantValues.length; i++) {
                  await query(`
                    INSERT INTO registration_product_selections 
                    (registration_id, product_id, variant_id, attribute_name, attribute_value)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT DO NOTHING
                  `, [
                    reg.registration_id,
                    product.product_id,
                    variant.variant_id,
                    product.variant_attributes[i],
                    variantValues[i],
                  ]);
                }

                hasRecovered = true;
                console.log(`✅ Recuperado: Inscrição ${reg.registration_id.substring(0, 8)}... - Produto: ${product.product_name} - Variante: ${variant.variant_name}`);
                break; // Usar apenas a primeira variante que funcionar
              }
            } catch (error: any) {
              // Continuar tentando outras variantes
              continue;
            }
          }
        }

        if (hasRecovered) {
          recovered++;
        } else {
          skipped++;
        }
      } catch (error: any) {
        console.error(`❌ Erro ao processar inscrição ${reg.registration_id}:`, error.message);
        errors++;
      }
    }

    console.log(`\n📈 Resumo da recuperação:`);
    console.log(`   ✅ Recuperadas: ${recovered}`);
    console.log(`   ⏭️  Ignoradas: ${skipped}`);
    console.log(`   ❌ Erros: ${errors}`);
    console.log(`\n⚠️  NOTA: Este script só pode recuperar dados se:`);
    console.log(`   1. O nome da variante segue o formato "Value1 - Value2 - ..."`);
    console.log(`   2. O número de valores corresponde ao número de atributos`);
    console.log(`   3. Os dados ainda existem no banco de dados`);
    console.log(`\n   Se os dados não foram salvos originalmente, não há como recuperá-los.`);

  } catch (error: any) {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  }
}

// Executar script
recoverProductSelections()
  .then(() => {
    console.log('\n✅ Script concluído');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro ao executar script:', error);
    process.exit(1);
  });
