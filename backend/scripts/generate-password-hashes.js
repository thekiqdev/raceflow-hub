// Script para gerar hashes bcrypt das senhas de teste
import bcrypt from 'bcrypt';

const passwords = [
  { password: 'admin123', user: 'admin' },
  { password: 'organizador123', user: 'organizador' },
  { password: 'runner123', user: 'runner' }
];

async function generateHashes() {
  console.log('🔐 Gerando hashes bcrypt para senhas de teste...\n');
  
  for (const { password, user } of passwords) {
    const hash = await bcrypt.hash(password, 10);
    console.log(`${user}: ${hash}`);
  }
}

generateHashes()
  .then(() => {
    console.log('\n✅ Hashes gerados com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro:', error);
    process.exit(1);
  });

