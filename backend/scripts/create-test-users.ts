import bcrypt from 'bcrypt';
import pg from 'pg';
import dotenv from 'dotenv';

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

// Helper function to get a client from the pool
const getClient = async () => {
  const client = await pool.connect();
  return client;
};

// Add role to user (using existing client)
const addRoleWithClient = async (client: pg.PoolClient, userId: string, role: 'admin' | 'organizer' | 'runner') => {
  const result = await client.query(
    `INSERT INTO user_roles (user_id, role)
     VALUES ($1, $2)
     ON CONFLICT (user_id, role) DO NOTHING
     RETURNING *`,
    [userId, role]
  );
  return result.rows[0];
};

interface TestUser {
  email: string;
  password: string;
  full_name: string;
  cpf: string;
  phone: string;
  birth_date: string;
  role: 'admin' | 'organizer' | 'runner';
}

const testUsers: TestUser[] = [
  {
    email: 'admin@test.com',
    password: 'admin123',
    full_name: 'Administrador Teste',
    cpf: '00000000001',
    phone: '11999999999',
    birth_date: '1990-01-01',
    role: 'admin',
  },
  {
    email: 'organizador@test.com',
    password: 'organizador123',
    full_name: 'Organizador Teste',
    cpf: '00000000002',
    phone: '11999999998',
    birth_date: '1990-01-02',
    role: 'organizer',
  },
  {
    email: 'runner@test.com',
    password: 'runner123',
    full_name: 'Corredor Teste',
    cpf: '00000000003',
    phone: '11999999997',
    birth_date: '1990-01-03',
    role: 'runner',
  },
];

async function createTestUsers() {
  console.log('🚀 Iniciando criação de usuários de teste...\n');

  for (const userData of testUsers) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if email already exists
      const emailCheck = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [userData.email]
      );

      if (emailCheck.rows.length > 0) {
        console.log(`⚠️  Usuário ${userData.email} já existe. Atualizando role...`);
        const userId = emailCheck.rows[0].id;

        // Remove all existing roles
        await client.query(
          'DELETE FROM user_roles WHERE user_id = $1',
          [userId]
        );

        // Add the correct role
        await addRoleWithClient(client, userId, userData.role);

        await client.query('COMMIT');
        console.log(`✅ Usuário ${userData.email} atualizado com role: ${userData.role}`);
        continue;
      }

      // Check if CPF already exists
      const cpfCheck = await client.query(
        'SELECT id FROM profiles WHERE cpf = $1',
        [userData.cpf]
      );

      if (cpfCheck.rows.length > 0) {
        console.log(`⚠️  CPF ${userData.cpf} já existe. Pulando...`);
        await client.query('ROLLBACK');
        continue;
      }

      // Hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(userData.password, saltRounds);

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, email_verified)
         VALUES ($1, $2, true)
         RETURNING id, email`,
        [userData.email, passwordHash]
      );

      const user = userResult.rows[0];

      // Create profile
      await client.query(
        `INSERT INTO profiles (id, full_name, cpf, phone, gender, birth_date, lgpd_consent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          user.id,
          userData.full_name,
          userData.cpf,
          userData.phone,
          null,
          userData.birth_date,
          true,
        ]
      );

      // Remove default 'runner' role if exists (from trigger)
      await client.query(
        'DELETE FROM user_roles WHERE user_id = $1',
        [user.id]
      );

      // Add the correct role
      await addRoleWithClient(client, user.id, userData.role);

      await client.query('COMMIT');

      console.log(`✅ Usuário criado: ${userData.email}`);
      console.log(`   Nome: ${userData.full_name}`);
      console.log(`   Role: ${userData.role}`);
      console.log(`   Senha: ${userData.password}\n`);
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error(`❌ Erro ao criar usuário ${userData.email}:`, error.message);
    } finally {
      client.release();
    }
  }

  console.log('\n📋 Resumo dos usuários de teste:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👤 ADMIN:');
  console.log('   Email: admin@test.com');
  console.log('   Senha: admin123');
  console.log('');
  console.log('👤 ORGANIZADOR:');
  console.log('   Email: organizador@test.com');
  console.log('   Senha: organizador123');
  console.log('');
  console.log('👤 CORREDOR:');
  console.log('   Email: runner@test.com');
  console.log('   Senha: runner123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n✨ Usuários de teste criados com sucesso!');
}

// Run the script
createTestUsers()
  .then(() => {
    console.log('\n✅ Script finalizado.');
    pool.end();
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    pool.end();
    process.exit(1);
  });

