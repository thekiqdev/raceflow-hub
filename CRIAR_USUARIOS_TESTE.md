# 👥 Como Criar Usuários de Teste

Este guia explica como criar os usuários de teste no sistema.

## 📋 Usuários que Serão Criados

| Email | Senha | Role | Descrição |
|-------|-------|-----|-----------|
| `admin@test.com` | `admin123` | Admin | Administrador do sistema |
| `organizador@test.com` | `organizador123` | Organizer | Organizador de eventos |
| `runner@test.com` | `runner123` | Runner | Corredor/participante |

## 🚀 Métodos para Criar Usuários

### Método 1: Via npm (Recomendado)

No terminal do backend (Easypanel ou local):

```bash
# Instalar dependências de desenvolvimento (se necessário)
npm install --include=dev

# Executar script
npm run create-test-users
```

### Método 2: Via Script Shell

```bash
# Dar permissão de execução (apenas primeira vez)
chmod +x backend/scripts/create-test-users.sh

# Executar
./backend/scripts/create-test-users.sh
```

### Método 3: Via tsx Direto

```bash
# Instalar tsx globalmente (se necessário)
npm install -g tsx

# Executar diretamente
tsx backend/scripts/create-test-users.ts
```

## 📍 No Easypanel

### Passo a Passo

1. **Acesse o serviço Backend** no Easypanel
2. **Abra o Terminal** ou **Executar Comando**
3. **Execute:**

```bash
# Instalar dependências de desenvolvimento
npm install --include=dev

# Criar usuários de teste
npm run create-test-users
```

### O que o Script Faz

- ✅ Verifica se os usuários já existem
- ✅ Se existirem, atualiza apenas o role
- ✅ Se não existirem, cria novos usuários
- ✅ Cria perfil completo (nome, CPF, telefone, etc.)
- ✅ Atribui o role correto (admin, organizer, runner)
- ✅ Mostra resumo ao final

## ✅ Verificar se Funcionou

Após executar o script, você verá:

```
🚀 Iniciando criação de usuários de teste...

✅ Usuário criado: admin@test.com
   Nome: Administrador Teste
   Role: admin
   Senha: admin123

✅ Usuário criado: organizador@test.com
   Nome: Organizador Teste
   Role: organizer
   Senha: organizador123

✅ Usuário criado: runner@test.com
   Nome: Corredor Teste
   Role: runner
   Senha: runner123

📋 Resumo dos usuários de teste:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 ADMIN:
   Email: admin@test.com
   Senha: admin123

👤 ORGANIZADOR:
   Email: organizador@test.com
   Senha: organizador123

👤 CORREDOR:
   Email: runner@test.com
   Senha: runner123
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ Usuários de teste criados com sucesso!
```

## 🔍 Testar os Usuários

Após criar, teste fazendo login no frontend:

1. Acesse: `https://cronoteam-crono-front.e758qe.easypanel.host`
2. Clique em "Login" ou "Entrar"
3. Use uma das credenciais acima
4. Verifique se o login funciona e se as permissões estão corretas

## ⚠️ Importante

- **NÃO use essas credenciais em produção!**
- Essas são credenciais de teste apenas
- As senhas são simples e não devem ser usadas em ambientes reais
- Os CPFs são fictícios (00000000001, 00000000002, 00000000003)

## 🔐 Segurança em Produção

Em produção, você deve:
1. Criar usuários reais através do endpoint de registro (`/api/auth/register`)
2. Usar senhas fortes
3. Implementar políticas de senha adequadas
4. Usar CPFs válidos e únicos
5. **NUNCA** usar os usuários de teste em produção

## 🐛 Troubleshooting

### Erro: "Cannot find module 'tsx'"

**Solução:**
```bash
npm install --include=dev
```

### Erro: "Cannot connect to database"

**Solução:**
1. Verifique se as variáveis de ambiente estão configuradas:
   - `POSTGRES_HOST`
   - `POSTGRES_PORT`
   - `POSTGRES_DB`
   - `POSTGRES_USER`
   - `POSTGRES_PASSWORD`

2. Verifique se o PostgreSQL está rodando

### Erro: "relation does not exist"

**Solução:**
Execute as migrações primeiro:
```bash
npm run migrate
```

### Usuário já existe

O script detecta automaticamente se o usuário já existe e atualiza apenas o role. Isso é normal e não é um erro.

## 📝 Personalizar Usuários

Se quiser criar usuários diferentes, edite o arquivo:
```
backend/scripts/create-test-users.ts
```

Modifique o array `testUsers` com os dados desejados.

