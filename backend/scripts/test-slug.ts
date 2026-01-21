/**
 * Script de teste para validar a função de geração de slug
 * Execute com: tsx scripts/test-slug.ts
 */

import { generateSlug, isValidSlug } from '../src/utils/slug.js';

console.log('🧪 Testando função generateSlug...\n');

// Casos de teste
const testCases: Array<{
  input: string;
  expected: string | null;
  description: string;
}> = [
  {
    input: 'Corrida de Rua Fortaleza 2024',
    expected: 'corrida-de-rua-fortaleza-2024',
    description: 'Título básico com espaços'
  },
  {
    input: 'Maratona São Paulo!',
    expected: 'maratona-sao-paulo',
    description: 'Título com acentos e caracteres especiais'
  },
  {
    input: 'Evento com @#$ Caracteres Especiais',
    expected: 'evento-com-caracteres-especiais',
    description: 'Título com caracteres especiais'
  },
  {
    input: 'CORRIDA DE RUA',
    expected: 'corrida-de-rua',
    description: 'Título em maiúsculas'
  },
  {
    input: '  Corrida   com   espaços   múltiplos  ',
    expected: 'corrida-com-espacos-multiplos',
    description: 'Título com múltiplos espaços'
  },
  {
    input: 'Corrida---com---hífens---múltiplos',
    expected: 'corrida-com-hifens-multiplos',
    description: 'Título com múltiplos hífens'
  },
  {
    input: 'Corrida_de_Rua_com_Underscores',
    expected: 'corrida-de-rua-com-underscores',
    description: 'Título com underscores'
  },
  {
    input: 'Corrida 2024 - Evento Principal',
    expected: 'corrida-2024-evento-principal',
    description: 'Título com números e hífens'
  },
  {
    input: 'A',
    expected: 'a',
    description: 'Título muito curto'
  },
  {
    input: 'Corrida de Rua em Fortaleza no Ceará com Muitas Palavras para Testar o Limite de Caracteres do Slug que Deve Ser Limitado a Cem Caracteres',
    expected: null, // Não verificar valor exato, apenas que está dentro do limite
    description: 'Título muito longo (deve ser truncado a 100 caracteres)'
  }
];

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  const result = generateSlug(testCase.input);
  const isValid = isValidSlug(result);
  
  // Se expected é null, apenas verificar que está dentro do limite
  let matches: boolean;
  if (testCase.expected === null) {
    matches = result.length <= 100 && isValid;
  } else {
    matches = result === testCase.expected && isValid;
  }
  
  if (matches) {
    console.log(`✅ Teste ${index + 1}: ${testCase.description}`);
    console.log(`   Input: "${testCase.input}"`);
    console.log(`   Output: "${result}" (${result.length} caracteres)`);
    console.log(`   Válido: ${isValid}\n`);
    passed++;
  } else {
    console.log(`❌ Teste ${index + 1}: ${testCase.description}`);
    console.log(`   Input: "${testCase.input}"`);
    if (testCase.expected !== null) {
      console.log(`   Esperado: "${testCase.expected}"`);
    } else {
      console.log(`   Esperado: slug válido com até 100 caracteres`);
    }
    console.log(`   Obtido: "${result}" (${result.length} caracteres)`);
    console.log(`   Válido: ${isValid}`);
    console.log(`   Match: ${matches}\n`);
    failed++;
  }
});

// Testes de validação
console.log('🧪 Testando função isValidSlug...\n');

const validationTests = [
  { input: 'corrida-2024', expected: true, description: 'Slug válido' },
  { input: 'corrida_2024', expected: false, description: 'Slug com underscore (inválido)' },
  { input: 'Corrida 2024', expected: false, description: 'Slug com espaço e maiúscula (inválido)' },
  { input: 'corrida--2024', expected: false, description: 'Slug com hífens duplos (inválido)' },
  { input: '-corrida-2024', expected: false, description: 'Slug começando com hífen (inválido)' },
  { input: 'corrida-2024-', expected: false, description: 'Slug terminando com hífen (inválido)' },
  { input: 'corrida-2024-abc', expected: true, description: 'Slug válido com letras' },
  { input: '', expected: false, description: 'Slug vazio (inválido)' },
  { input: 'a', expected: true, description: 'Slug de uma letra (válido)' }
];

validationTests.forEach((test, index) => {
  const result = isValidSlug(test.input);
  const matches = result === test.expected;
  
  if (matches) {
    console.log(`✅ Validação ${index + 1}: ${test.description}`);
    console.log(`   Input: "${test.input}"`);
    console.log(`   Resultado: ${result}\n`);
    passed++;
  } else {
    console.log(`❌ Validação ${index + 1}: ${test.description}`);
    console.log(`   Input: "${test.input}"`);
    console.log(`   Esperado: ${test.expected}`);
    console.log(`   Obtido: ${result}\n`);
    failed++;
  }
});

// Resumo
console.log('📊 Resumo dos Testes:');
console.log(`✅ Passou: ${passed}`);
console.log(`❌ Falhou: ${failed}`);
console.log(`📈 Total: ${passed + failed}`);

if (failed === 0) {
  console.log('\n🎉 Todos os testes passaram!');
  process.exit(0);
} else {
  console.log('\n⚠️  Alguns testes falharam. Revise a implementação.');
  process.exit(1);
}
