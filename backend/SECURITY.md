# Segurança e Permissões - RaceFlow Hub API

## Visão Geral

Este documento descreve as medidas de segurança implementadas na API do RaceFlow Hub.

## Autenticação

### JWT (JSON Web Tokens)
- Tokens JWT são usados para autenticação
- Tokens expiram após 7 dias (configurável via `JWT_EXPIRES_IN`)
- Tokens são validados em cada requisição autenticada
- Tokens são armazenados no frontend (localStorage)

### Middleware de Autenticação
- `authenticate`: Requer token válido
- `optionalAuth`: Permite requisições sem token (para rotas públicas)

## Autorização

### Roles (Papéis)
O sistema suporta três roles principais:
- **admin**: Acesso total ao sistema
- **organizer**: Pode criar e gerenciar seus próprios eventos
- **runner**: Usuário comum, pode se inscrever em eventos

### Middleware de Autorização

#### `requireRole(role)`
Verifica se o usuário tem uma role específica.

```typescript
router.put('/admin-only', authenticate, requireRole('admin'), handler);
```

#### `requireAnyRole(roles[])`
Verifica se o usuário tem pelo menos uma das roles especificadas.

```typescript
router.post('/events', authenticate, requireAnyRole(['admin', 'organizer']), handler);
```

#### `requireEventOrganizer`
Verifica se o usuário é organizador do evento ou admin.

```typescript
router.put('/events/:id', authenticate, requireEventOrganizer('id'), handler);
```

#### `requireResourceOwnership(tableName, userIdField)`
Verifica se o usuário é dono do recurso.

```typescript
router.put('/profiles/:id', authenticate, requireResourceOwnership('profiles', 'id'), handler);
```

## Permissões por Recurso

### Eventos
- **GET /api/events**: Público (apenas eventos publicados)
- **GET /api/events/:id**: Público (apenas eventos publicados) ou autenticado (se for organizador/admin)
- **POST /api/events**: Requer role `organizer` ou `admin`
- **PUT /api/events/:id**: Requer ser organizador do evento ou admin
- **DELETE /api/events/:id**: Requer role `admin`

### Perfis
- **GET /api/profiles/me**: Requer autenticação (próprio perfil)
- **PUT /api/profiles/me**: Requer autenticação (próprio perfil)

### Inscrições
- **GET /api/registrations**: 
  - Runners: Apenas suas próprias inscrições
  - Organizers: Inscrições de seus eventos
  - Admins: Todas as inscrições
- **GET /api/registrations/:id**: Requer ser dono, organizador do evento ou admin
- **POST /api/registrations**: Requer autenticação
- **PUT /api/registrations/:id**: Requer ser dono, organizador do evento ou admin

### Configurações da Home
- **GET /api/home-page-settings**: Público
- **PUT /api/home-page-settings**: Requer role `admin`

## Rate Limiting

### Limites Implementados
- **Geral**: 100 requisições por 15 minutos por IP
- **Autenticação**: 5 requisições por 15 minutos por IP
- **Operações de escrita**: 50 requisições por 15 minutos por IP

### Middleware
- `rateLimiter(windowMs, maxRequests)`: Rate limiter genérico
- `authRateLimiter`: Rate limiter para endpoints de autenticação
- `writeRateLimiter`: Rate limiter para operações de escrita

## Logs de Segurança

### Eventos Registrados
- Tentativas de acesso não autorizado (401, 403)
- Ações administrativas (POST, PUT, DELETE)
- Informações registradas:
  - Timestamp
  - Método HTTP
  - Path
  - Status code
  - IP do cliente
  - User-Agent
  - ID e email do usuário (se autenticado)

### Middleware
- `securityLogger`: Registra eventos de segurança automaticamente

## Validação de Entrada

### Validação com Zod
- Validação de tipos
- Validação de formato (email, UUID, etc.)
- Mensagens de erro descritivas

### Middleware
- `validate({ body, query, params })`: Valida dados de entrada

## Proteção contra Ataques

### SQL Injection
- Todas as queries usam prepared statements (parâmetros)
- Nenhuma concatenação de strings em queries SQL

### XSS (Cross-Site Scripting)
- Dados são sanitizados antes de serem retornados
- Headers de segurança configurados

### CORS
- CORS configurado para permitir apenas origens específicas
- Credenciais habilitadas apenas para origens confiáveis

### Body Size Limit
- Limite de 10MB para requisições JSON
- Previne ataques de DoS por requisições grandes

## Variáveis de Ambiente de Segurança

```env
# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=http://localhost:5173

# Database
POSTGRES_USER=raceflow_user
POSTGRES_PASSWORD=strong-password-here
POSTGRES_DB=raceflow_db
```

## Boas Práticas

1. **Nunca exponha tokens JWT em logs**
2. **Use HTTPS em produção**
3. **Rotacione o JWT_SECRET periodicamente**
4. **Monitore logs de segurança regularmente**
5. **Mantenha dependências atualizadas**
6. **Use senhas fortes para o banco de dados**
7. **Limite tentativas de login**
8. **Implemente 2FA para contas administrativas** (futuro)

## Testes de Segurança

### Cenários Testados
- ✅ Usuário comum não pode acessar rotas admin
- ✅ Organizador só vê/edita seus eventos
- ✅ Runner só vê suas próprias inscrições
- ✅ Admin tem acesso total
- ✅ Tentativas de acesso não autorizado são bloqueadas
- ✅ Rate limiting funciona corretamente
- ✅ Tokens inválidos são rejeitados

## Melhorias Futuras

- [ ] Implementar refresh tokens
- [ ] Adicionar 2FA (Two-Factor Authentication)
- [ ] Implementar rate limiting baseado em Redis
- [ ] Adicionar CAPTCHA para endpoints de autenticação
- [ ] Implementar auditoria completa de ações
- [ ] Adicionar proteção contra CSRF
- [ ] Implementar blacklist de tokens
- [ ] Adicionar monitoramento de segurança em tempo real





