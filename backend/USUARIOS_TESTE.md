# 👥 Usuários de Teste

Este documento contém as credenciais dos usuários de teste criados para desenvolvimento e testes.

## 📋 Credenciais

### 👤 Administrador
- **Email:** `admin@test.com`
- **Senha:** `admin123`
- **Role:** `admin`
- **Permissões:** Acesso total ao sistema, pode gerenciar eventos, usuários e configurações

### 👤 Organizador
- **Email:** `organizador@test.com`
- **Senha:** `organizador123`
- **Role:** `organizer`
- **Permissões:** Pode criar e gerenciar seus próprios eventos, visualizar relatórios e inscrições

### 👤 Corredor
- **Email:** `runner@test.com`
- **Senha:** `runner123`
- **Role:** `runner`
- **Permissões:** Pode se inscrever em eventos, visualizar suas inscrições e perfil

## 🚀 Como Recriar os Usuários

Para recriar os usuários de teste (útil se você precisar resetar ou recriar):

```bash
cd backend
npm run create-test-users
```

O script irá:
- Verificar se os usuários já existem
- Se existirem, atualizará apenas o role
- Se não existirem, criará novos usuários com os dados acima

## ⚠️ Importante

- **NÃO use essas credenciais em produção!**
- Essas são credenciais de teste apenas para desenvolvimento
- As senhas são simples e não devem ser usadas em ambientes reais
- Os CPFs são fictícios (00000000001, 00000000002, 00000000003)

## 🔐 Segurança

Em produção, você deve:
1. Criar usuários reais através do endpoint de registro
2. Usar senhas fortes
3. Implementar políticas de senha adequadas
4. Usar CPFs válidos e únicos





