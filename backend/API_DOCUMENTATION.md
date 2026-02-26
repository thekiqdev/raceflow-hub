# Documentação da API - RaceFlow Hub

## Base URL

```
http://localhost:3001/api
```

## Autenticação

A maioria dos endpoints requer autenticação via JWT token. Inclua o token no header:

```
Authorization: Bearer <token>
```

## Endpoints

### Health Check

#### GET /health

Verifica a saúde da API e conexão com o banco de dados.

**Resposta:**
```json
{
  "success": true,
  "message": "API is healthy",
  "database": "connected",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### Autenticação

#### POST /auth/register

Registra um novo usuário.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "full_name": "Nome Completo",
  "cpf": "12345678900",
  "phone": "85999999999",
  "birth_date": "1990-01-01",
  "gender": "M",
  "lgpd_consent": true
}
```

**Resposta:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "profile": { ... },
    "roles": []
  },
  "token": "jwt-token"
}
```

#### POST /auth/login

Faz login do usuário.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Resposta:**
```json
{
  "success": true,
  "user": { ... },
  "token": "jwt-token"
}
```

#### GET /auth/me

Obtém informações do usuário autenticado.

**Headers:** `Authorization: Bearer <token>`

**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "email_verified": false,
    "profile": { ... },
    "roles": ["runner"]
  }
}
```

#### POST /auth/logout

Faz logout do usuário.

**Headers:** `Authorization: Bearer <token>`

---

### Eventos

#### GET /events

Lista eventos publicados (público).

**Query Parameters:**
- `status` (opcional): Filtrar por status
- `city` (opcional): Filtrar por cidade
- `state` (opcional): Filtrar por estado
- `organizer_id` (opcional): Filtrar por organizador

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Corrida de Teste",
      "description": "...",
      "event_date": "2024-12-31T07:00:00Z",
      "location": "Parque Central",
      "city": "Fortaleza",
      "state": "CE",
      "status": "published",
      "registration_status": "open",
      "registration_start_date": "2024-12-01T00:00:00Z",
      "registration_end_date": "2024-12-30T23:59:59Z",
      "registration_auto_mode": false,
      "organizer_id": "uuid",
      "registration_count": 10
    }
  ]
}
```

#### GET /events/:id

Obtém um evento por ID.

**Resposta:**
```json
{
  "success": true,
  "data": { ... }
}
```

#### POST /events

Cria um novo evento (requer role `organizer` ou `admin`).

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "title": "Corrida de Teste",
  "description": "Descrição do evento",
  "event_date": "2024-12-31T07:00:00Z",
  "location": "Parque Central",
  "city": "Fortaleza",
  "state": "CE",
  "banner_url": "https://...",
  "regulation_url": "https://...",
  "status": "draft",
  "registration_status": "open",
  "registration_start_date": "2024-12-01T00:00:00Z",
  "registration_end_date": "2024-12-30T23:59:59Z",
  "registration_auto_mode": false
}
```

**Campos de Status de Inscrições (opcionais):**
- `registration_status` (string, opcional): Status manual das inscrições. Valores possíveis:
  - `"not_open"`: Inscrições em breve
  - `"open"`: Inscrições abertas
  - `"closed"`: Inscrições encerradas
  - `null`: Usa lógica padrão baseada no `status` do evento
- `registration_start_date` (string ISO datetime, opcional): Data/hora de abertura das inscrições (usado quando `registration_auto_mode = true`)
- `registration_end_date` (string ISO datetime, opcional): Data/hora de encerramento das inscrições (usado quando `registration_auto_mode = true`)
- `registration_auto_mode` (boolean, opcional, padrão: `false`): Se `true`, o status é calculado automaticamente baseado nas datas. Se `false`, usa o valor manual de `registration_status`.

**Nota:** Quando `registration_auto_mode = true`, `registration_start_date` e `registration_end_date` são obrigatórios.

#### PUT /events/:id

Atualiza um evento (requer ser organizador do evento ou admin).

**Headers:** `Authorization: Bearer <token>`

**Body:** (todos os campos são opcionais)
```json
{
  "title": "Título Atualizado",
  "status": "published",
  "registration_status": "open",
  "registration_start_date": "2024-12-01T00:00:00Z",
  "registration_end_date": "2024-12-30T23:59:59Z",
  "registration_auto_mode": false
}
```

**Campos de Status de Inscrições:** Ver documentação de POST /events acima para detalhes dos campos.

#### DELETE /events/:id

Deleta um evento (requer role `admin`).

**Headers:** `Authorization: Bearer <token>`

---

### Endpoints Administrativos - Status de Inscrições

#### POST /admin/update-registration-statuses

Atualiza manualmente o status de inscrições de todos os eventos com modo automático ativado.

**Headers:** `Authorization: Bearer <token>` (requer role `admin`)

**Resposta:**
```json
{
  "success": true,
  "message": "Status de inscrições atualizado com sucesso",
  "data": {
    "updatedCount": 5
  }
}
```

#### POST /admin/events/:eventId/update-registration-status

Atualiza manualmente o status de inscrições de um evento específico.

**Headers:** `Authorization: Bearer <token>` (requer role `admin`)

**Parâmetros:**
- `eventId` (path): ID do evento

**Resposta:**
```json
{
  "success": true,
  "message": "Status de inscrições do evento atualizado com sucesso",
  "data": {
    "eventId": "uuid",
    "registrationStatus": "open"
  }
}
```

**Nota:** Estes endpoints são úteis para execução manual da atualização de status. A atualização automática ocorre a cada 5 minutos (configurável via `REGISTRATION_STATUS_UPDATE_INTERVAL_MS`).

---

### Perfis

#### GET /profiles/me

Obtém o próprio perfil.

**Headers:** `Authorization: Bearer <token>`

**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "full_name": "Nome Completo",
    "cpf": "12345678900",
    "phone": "85999999999",
    "gender": "M",
    "birth_date": "1990-01-01",
    "lgpd_consent": true
  }
}
```

#### PUT /profiles/me

Atualiza o próprio perfil.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "full_name": "Novo Nome",
  "phone": "85988888888"
}
```

---

### Inscrições

#### GET /registrations

Lista inscrições (requer autenticação).

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `event_id` (opcional): Filtrar por evento
- `runner_id` (opcional): Filtrar por corredor
- `status` (opcional): Filtrar por status

**Resposta:**
- Runner: Apenas suas próprias inscrições
- Organizer: Inscrições de seus eventos
- Admin: Todas as inscrições

#### GET /registrations/:id

Obtém uma inscrição por ID.

**Headers:** `Authorization: Bearer <token>`

#### POST /registrations

Cria uma nova inscrição.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "event_id": "uuid",
  "category_id": "uuid",
  "kit_id": "uuid",
  "total_amount": 50.00,
  "payment_method": "pix"
}
```

#### PUT /registrations/:id

Atualiza uma inscrição.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "status": "confirmed",
  "payment_status": "paid"
}
```

---

### Configurações da Home

#### GET /home-page-settings

Obtém configurações da home page (público).

**Resposta:**
```json
{
  "success": true,
  "data": {
    "hero_title": "Título",
    "hero_subtitle": "Subtítulo",
    "whatsapp_number": "+5511999999999",
    ...
  }
}
```

#### PUT /home-page-settings

Atualiza configurações da home page (requer role `admin`).

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "hero_title": "Novo Título",
  "hero_subtitle": "Novo Subtítulo"
}
```

---

## Códigos de Status HTTP

- `200 OK`: Requisição bem-sucedida
- `201 Created`: Recurso criado com sucesso
- `400 Bad Request`: Dados inválidos
- `401 Unauthorized`: Não autenticado
- `403 Forbidden`: Sem permissão
- `404 Not Found`: Recurso não encontrado
- `429 Too Many Requests`: Rate limit excedido
- `500 Internal Server Error`: Erro no servidor

## Formato de Erro

```json
{
  "success": false,
  "error": "Error type",
  "message": "Error message",
  "details": { ... }
}
```

## Rate Limiting

- **Geral**: 100 requisições por 15 minutos por IP
- **Autenticação**: 5 requisições por 15 minutos por IP
- **Operações de escrita**: 50 requisições por 15 minutos por IP

## Variáveis de Ambiente

Veja `.env.example` para todas as variáveis necessárias.

## Suporte

Para problemas ou dúvidas, consulte:
- `TESTING.md` - Guia de testes
- `SECURITY.md` - Documentação de segurança
- `README.md` - Documentação geral





