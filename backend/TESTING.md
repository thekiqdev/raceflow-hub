# Guia de Testes - RaceFlow Hub API

## Visão Geral

Este documento descreve como testar todas as funcionalidades da API após a migração do Supabase.

## Pré-requisitos

1. Banco de dados PostgreSQL rodando (via Docker Compose)
2. Backend rodando (`npm run dev`)
3. Variáveis de ambiente configuradas

## Ferramentas de Teste

Você pode usar qualquer uma das seguintes ferramentas:
- **Postman** (recomendado)
- **Thunder Client** (VS Code extension)
- **curl** (linha de comando)
- **Insomnia**
- **httpie**

## Variáveis de Ambiente para Testes

Certifique-se de ter estas variáveis configuradas no `.env`:

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=raceflow_db
POSTGRES_USER=raceflow_user
POSTGRES_PASSWORD=raceflow_password
JWT_SECRET=your-secret-key-here
API_PORT=3001
CORS_ORIGIN=http://localhost:5173
```

## 1. Testes de Autenticação

### 1.1 Registro de Usuário

**Endpoint:** `POST /api/auth/register`

**Body:**
```json
{
  "email": "test@example.com",
  "password": "password123",
  "full_name": "Test User",
  "cpf": "12345678900",
  "phone": "85999999999",
  "birth_date": "1990-01-01",
  "gender": "M",
  "lgpd_consent": true
}
```

**Resposta esperada:**
- Status: `201 Created`
- Body contém `user` e `token`

**Validações:**
- ✅ Usuário criado no banco
- ✅ Perfil criado automaticamente
- ✅ Token JWT retornado
- ✅ Senha não está em texto plano

### 1.2 Login

**Endpoint:** `POST /api/auth/login`

**Body:**
```json
{
  "email": "test@example.com",
  "password": "password123"
}
```

**Resposta esperada:**
- Status: `200 OK`
- Body contém `user` e `token`

**Validações:**
- ✅ Token JWT válido
- ✅ Usuário retornado com perfil
- ✅ Senha incorreta retorna erro 401

### 1.3 Obter Usuário Atual

**Endpoint:** `GET /api/auth/me`

**Headers:**
```
Authorization: Bearer <token>
```

**Resposta esperada:**
- Status: `200 OK`
- Body contém dados do usuário e roles

**Validações:**
- ✅ Token válido retorna usuário
- ✅ Token inválido retorna 401
- ✅ Token expirado retorna 401

### 1.4 Logout

**Endpoint:** `POST /api/auth/logout`

**Headers:**
```
Authorization: Bearer <token>
```

**Resposta esperada:**
- Status: `200 OK`

## 2. Testes de Eventos

### 2.1 Listar Eventos (Público)

**Endpoint:** `GET /api/events`

**Resposta esperada:**
- Status: `200 OK`
- Array de eventos publicados

**Validações:**
- ✅ Apenas eventos com status `published` são retornados
- ✅ Eventos `draft` não aparecem para usuários não autenticados

### 2.2 Obter Evento por ID (Público)

**Endpoint:** `GET /api/events/:id`

**Resposta esperada:**
- Status: `200 OK` para eventos publicados
- Status: `403 Forbidden` para eventos não publicados (sem auth)

**Validações:**
- ✅ Evento publicado acessível sem autenticação
- ✅ Evento não publicado requer autenticação
- ✅ Organizador do evento pode ver evento não publicado

### 2.3 Criar Evento

**Endpoint:** `POST /api/events`

**Headers:**
```
Authorization: Bearer <token_organizer>
```

**Body:**
```json
{
  "title": "Corrida de Teste",
  "description": "Descrição do evento",
  "event_date": "2024-12-31T07:00:00Z",
  "location": "Parque Central",
  "city": "Fortaleza",
  "state": "CE",
  "status": "draft"
}
```

**Resposta esperada:**
- Status: `201 Created`
- Evento criado com `organizer_id` do usuário autenticado

**Validações:**
- ✅ Apenas organizers e admins podem criar
- ✅ Runner comum retorna 403
- ✅ `organizer_id` é definido automaticamente

### 2.4 Atualizar Evento

**Endpoint:** `PUT /api/events/:id`

**Headers:**
```
Authorization: Bearer <token_organizer>
```

**Body:**
```json
{
  "title": "Corrida de Teste Atualizada",
  "status": "published"
}
```

**Resposta esperada:**
- Status: `200 OK`
- Evento atualizado

**Validações:**
- ✅ Apenas organizador do evento pode atualizar
- ✅ Admin pode atualizar qualquer evento
- ✅ Outro organizador retorna 403

### 2.5 Deletar Evento

**Endpoint:** `DELETE /api/events/:id`

**Headers:**
```
Authorization: Bearer <token_admin>
```

**Resposta esperada:**
- Status: `200 OK`

**Validações:**
- ✅ Apenas admin pode deletar
- ✅ Organizador retorna 403

## 3. Testes de Perfis

### 3.1 Obter Próprio Perfil

**Endpoint:** `GET /api/profiles/me`

**Headers:**
```
Authorization: Bearer <token>
```

**Resposta esperada:**
- Status: `200 OK`
- Dados do perfil do usuário

**Validações:**
- ✅ Retorna apenas perfil do usuário autenticado
- ✅ Sem autenticação retorna 401

### 3.2 Atualizar Próprio Perfil

**Endpoint:** `PUT /api/profiles/me`

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "full_name": "Nome Atualizado",
  "phone": "85988888888"
}
```

**Resposta esperada:**
- Status: `200 OK`
- Perfil atualizado

**Validações:**
- ✅ Apenas próprio perfil pode ser atualizado
- ✅ CPF não pode ser alterado

## 4. Testes de Inscrições

### 4.1 Listar Inscrições

**Endpoint:** `GET /api/registrations`

**Headers:**
```
Authorization: Bearer <token>
```

**Resposta esperada:**
- Status: `200 OK`
- Array de inscrições

**Validações:**
- ✅ Runner vê apenas suas próprias inscrições
- ✅ Organizer vê inscrições de seus eventos
- ✅ Admin vê todas as inscrições

### 4.2 Obter Inscrição por ID

**Endpoint:** `GET /api/registrations/:id`

**Headers:**
```
Authorization: Bearer <token>
```

**Resposta esperada:**
- Status: `200 OK` se autorizado
- Status: `403 Forbidden` se não autorizado

**Validações:**
- ✅ Runner pode ver apenas suas inscrições
- ✅ Organizer pode ver inscrições de seus eventos
- ✅ Admin pode ver qualquer inscrição

### 4.3 Criar Inscrição

**Endpoint:** `POST /api/registrations`

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "event_id": "<event_id>",
  "category_id": "<category_id>",
  "total_amount": 50.00,
  "payment_method": "pix"
}
```

**Resposta esperada:**
- Status: `201 Created`
- Inscrição criada

**Validações:**
- ✅ `runner_id` é definido automaticamente
- ✅ `registered_by` é o usuário autenticado
- ✅ Código de confirmação gerado automaticamente

### 4.4 Atualizar Inscrição

**Endpoint:** `PUT /api/registrations/:id`

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "status": "confirmed",
  "payment_status": "paid"
}
```

**Resposta esperada:**
- Status: `200 OK`

**Validações:**
- ✅ Runner pode atualizar apenas suas inscrições
- ✅ Organizer pode atualizar inscrições de seus eventos
- ✅ Admin pode atualizar qualquer inscrição

## 5. Testes de Configurações da Home

### 5.1 Obter Configurações (Público)

**Endpoint:** `GET /api/home-page-settings`

**Resposta esperada:**
- Status: `200 OK`
- Configurações da home page

**Validações:**
- ✅ Acessível sem autenticação
- ✅ Retorna configurações padrão se não existir

### 5.2 Atualizar Configurações (Admin)

**Endpoint:** `PUT /api/home-page-settings`

**Headers:**
```
Authorization: Bearer <token_admin>
```

**Body:**
```json
{
  "hero_title": "Novo Título",
  "hero_subtitle": "Novo Subtítulo"
}
```

**Resposta esperada:**
- Status: `200 OK`

**Validações:**
- ✅ Apenas admin pode atualizar
- ✅ Runner/Organizer retorna 403

## 6. Testes de Segurança

### 6.1 Rate Limiting

**Teste:**
- Fazer 101 requisições em 15 minutos
- Esperado: 429 Too Many Requests na 101ª requisição

**Validações:**
- ✅ Rate limiting funciona
- ✅ Limite de autenticação é mais restritivo (5 req/15min)

### 6.2 Acesso Não Autorizado

**Testes:**
1. Acessar rota protegida sem token
2. Acessar rota protegida com token inválido
3. Acessar rota admin com token de runner

**Respostas esperadas:**
- Status: `401 Unauthorized` (sem token/token inválido)
- Status: `403 Forbidden` (sem permissão)

### 6.3 Validação de Ownership

**Testes:**
1. Organizador tenta editar evento de outro organizador
2. Runner tenta ver inscrição de outro runner

**Respostas esperadas:**
- Status: `403 Forbidden`

## 7. Testes de Performance

### 7.1 Tempo de Resposta

**Métricas esperadas:**
- Health check: < 50ms
- GET /api/events: < 200ms
- GET /api/auth/me: < 100ms
- POST /api/auth/login: < 300ms

### 7.2 Queries Otimizadas

**Validações:**
- ✅ Queries usam índices apropriados
- ✅ N+1 queries evitadas
- ✅ JOINs otimizados

## 8. Checklist de Validação

### Autenticação
- [ ] Registro de usuário funciona
- [ ] Login funciona
- [ ] Token JWT válido
- [ ] Token expirado rejeitado
- [ ] Logout funciona

### Eventos
- [ ] Listar eventos públicos funciona
- [ ] Criar evento (organizer/admin)
- [ ] Atualizar evento (ownership)
- [ ] Deletar evento (admin only)
- [ ] Permissões corretas

### Perfis
- [ ] Obter próprio perfil
- [ ] Atualizar próprio perfil
- [ ] Não pode acessar perfil de outros

### Inscrições
- [ ] Runner vê apenas suas inscrições
- [ ] Organizer vê inscrições de seus eventos
- [ ] Admin vê todas as inscrições
- [ ] Criar inscrição funciona
- [ ] Atualizar inscrição (permissões)

### Segurança
- [ ] Rate limiting funciona
- [ ] Acesso não autorizado bloqueado
- [ ] Ownership validado
- [ ] Logs de segurança funcionando

### Performance
- [ ] Tempos de resposta aceitáveis
- [ ] Queries otimizadas
- [ ] Sem memory leaks

## 9. Scripts de Teste Automatizado

### Usando curl

```bash
# Health check
curl http://localhost:3001/api/health

# Registrar usuário
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","full_name":"Test","cpf":"12345678900","phone":"85999999999","birth_date":"1990-01-01","lgpd_consent":true}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Obter usuário (substituir TOKEN)
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer TOKEN"
```

## 10. Problemas Comuns

### Erro de Conexão com Banco
- Verificar se PostgreSQL está rodando
- Verificar variáveis de ambiente
- Verificar credenciais

### Token Inválido
- Verificar se JWT_SECRET está configurado
- Verificar se token não expirou
- Verificar formato do header (Bearer <token>)

### Permissão Negada
- Verificar role do usuário
- Verificar ownership do recurso
- Verificar se middleware de autorização está aplicado

## 11. Próximos Passos

Após validar todos os testes:
1. Documentar qualquer problema encontrado
2. Corrigir bugs identificados
3. Otimizar queries lentas
4. Preparar para produção





