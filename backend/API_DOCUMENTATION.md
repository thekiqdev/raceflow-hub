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
  "status": "draft"
}
```

#### PUT /events/:id

Atualiza um evento (requer ser organizador do evento ou admin).

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "title": "Título Atualizado",
  "status": "published"
}
```

#### DELETE /events/:id

Deleta um evento (requer role `admin`).

**Headers:** `Authorization: Bearer <token>`

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





