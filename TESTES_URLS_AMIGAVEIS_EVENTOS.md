# Testes: URLs Amigáveis para Eventos

**Data:** 2025-01-20  
**Status:** 🟡 Em Testes

---

## 📋 Checklist de Testes

### ✅ ETAPA 1: Função de Geração de Slug
- [x] Função `generateSlug()` gera slugs corretamente
- [x] Remove acentos corretamente
- [x] Converte para minúsculas
- [x] Substitui espaços por hífens
- [x] Remove caracteres especiais
- [x] Limita tamanho a 100 caracteres
- [x] Função `isValidSlug()` valida formato corretamente
- [x] Todos os 19 testes passaram

### ✅ ETAPA 2: Banco de Dados
- [ ] Migration 078 executada (adiciona coluna slug)
- [ ] Script `generate-slugs-for-existing-events.ts` executado
- [ ] Migration 079 executada (torna slug NOT NULL)
- [ ] Todos os eventos têm slug gerado
- [ ] Slugs são únicos
- [ ] Índices criados corretamente

### ✅ ETAPA 3-6: Backend e Frontend - Tipos
- [x] Interface `Event` inclui `slug` no backend
- [x] Interface `Event` inclui `slug` no frontend
- [x] Tipos de criação/atualização incluem `slug` (opcional)
- [x] Validações Zod funcionando
- [x] Código compila sem erros

### ✅ ETAPA 4: Geração Automática de Slug
- [ ] Criar novo evento sem fornecer slug → slug é gerado automaticamente
- [ ] Criar novo evento com slug fornecido → slug é validado e garantido único
- [ ] Atualizar título de evento → novo slug é gerado
- [ ] Atualizar evento sem mudar título → slug não muda
- [ ] Títulos duplicados geram slugs únicos (com sufixo numérico)

### ✅ ETAPA 5: Rotas e Controllers
- [ ] Acessar `/events/{uuid}` → evento é encontrado
- [ ] Acessar `/events/{slug}` → evento é encontrado
- [ ] Acessar `/evento/{slug}` → evento é encontrado
- [ ] Acessar URL inválida → retorna 404
- [ ] Middleware `requireEventOwnership` funciona com slug
- [ ] Middleware `requireEventOwnership` funciona com UUID

### ✅ ETAPA 7-9: Frontend - Rotas e Links
- [ ] Rota `/evento/:slug` funciona
- [ ] Rota `/events/:id` funciona (compatibilidade)
- [ ] Componente `EventDetails` carrega com slug
- [ ] Componente `EventDetails` carrega com UUID
- [ ] Links em `Events.tsx` usam slug
- [ ] Links em `Index.tsx` usam slug
- [ ] Links em `ExploreEvents.tsx` usam slug
- [ ] Links em `OrganizerEvents.tsx` usam slug
- [ ] Links em `EventManagement.tsx` usam slug
- [ ] Links em `Results.tsx` usam slug

### ✅ ETAPA 10: Respostas da API
- [ ] `GET /events` retorna `slug` em todos os eventos
- [ ] `GET /events/:id` retorna `slug` no evento
- [ ] `GET /events/:slug` retorna `slug` no evento
- [ ] Frontend recebe `slug` corretamente

---

## 🧪 Testes Manuais

### Teste 1: Criação de Evento com Geração Automática de Slug

**Passos:**
1. Criar novo evento com título "Corrida de Rua Fortaleza 2024"
2. Não fornecer slug no request
3. Verificar se slug foi gerado: "corrida-de-rua-fortaleza-2024"
4. Verificar se slug está na resposta da API
5. Acessar `/evento/corrida-de-rua-fortaleza-2024` → deve carregar o evento

**Resultado Esperado:**
- ✅ Slug gerado automaticamente
- ✅ Slug na resposta da API
- ✅ URL amigável funciona

---

### Teste 2: Criação de Evento com Slug Fornecido

**Passos:**
1. Criar novo evento com título "Maratona São Paulo"
2. Fornecer slug: "maratona-sp-2024"
3. Verificar se slug foi usado: "maratona-sp-2024"
4. Verificar se slug está na resposta da API
5. Acessar `/evento/maratona-sp-2024` → deve carregar o evento

**Resultado Esperado:**
- ✅ Slug fornecido foi usado
- ✅ Slug na resposta da API
- ✅ URL amigável funciona

---

### Teste 3: Títulos Duplicados (Unicidade)

**Passos:**
1. Criar evento com título "Corrida 2024"
2. Criar outro evento com mesmo título "Corrida 2024"
3. Verificar se slugs são diferentes:
   - Primeiro: "corrida-2024"
   - Segundo: "corrida-2024-2"
4. Acessar ambas as URLs → devem funcionar

**Resultado Esperado:**
- ✅ Slugs são únicos
- ✅ Sufixo numérico adicionado automaticamente
- ✅ Ambas as URLs funcionam

---

### Teste 4: Atualização de Título (Geração de Novo Slug)

**Passos:**
1. Criar evento com título "Corrida Teste"
2. Verificar slug gerado: "corrida-teste"
3. Acessar `/evento/corrida-teste` → deve funcionar
4. Atualizar título para "Maratona Teste"
5. Verificar se novo slug foi gerado: "maratona-teste"
6. Acessar `/evento/maratona-teste` → deve funcionar
7. Acessar `/evento/corrida-teste` → deve retornar 404 (slug antigo não funciona mais)

**Resultado Esperado:**
- ✅ Novo slug gerado quando título muda
- ✅ Nova URL funciona
- ✅ URL antiga não funciona (slug mudou)

---

### Teste 5: Atualização sem Mudar Título (Slug Não Muda)

**Passos:**
1. Criar evento com título "Corrida Teste"
2. Verificar slug: "corrida-teste"
3. Atualizar apenas descrição (sem mudar título)
4. Verificar se slug permanece: "corrida-teste"
5. Acessar `/evento/corrida-teste` → deve continuar funcionando

**Resultado Esperado:**
- ✅ Slug não muda quando título não muda
- ✅ URL continua funcionando

---

### Teste 6: Navegação com Slug

**Passos:**
1. Acessar página de eventos (`/events`)
2. Clicar em "Ver Detalhes" em um evento
3. Verificar URL no navegador → deve ser `/evento/{slug}`
4. Verificar se página carrega corretamente
5. Verificar se dados do evento são exibidos

**Resultado Esperado:**
- ✅ URL é amigável (`/evento/{slug}`)
- ✅ Página carrega corretamente
- ✅ Dados do evento são exibidos

---

### Teste 7: Compatibilidade com UUID (URLs Antigas)

**Passos:**
1. Obter UUID de um evento existente
2. Acessar `/events/{uuid}` diretamente
3. Verificar se página carrega corretamente
4. Verificar se dados do evento são exibidos

**Resultado Esperado:**
- ✅ URLs antigas (UUID) continuam funcionando
- ✅ Página carrega corretamente
- ✅ Dados do evento são exibidos

---

### Teste 8: Busca por Slug no Backend

**Passos:**
1. Criar evento com slug conhecido: "teste-slug-123"
2. Fazer requisição `GET /api/events/teste-slug-123`
3. Verificar se evento é retornado
4. Verificar se slug está na resposta

**Resultado Esperado:**
- ✅ Backend encontra evento por slug
- ✅ Slug está na resposta
- ✅ Dados completos do evento são retornados

---

### Teste 9: Busca por UUID no Backend

**Passos:**
1. Obter UUID de um evento existente
2. Fazer requisição `GET /api/events/{uuid}`
3. Verificar se evento é retornado
4. Verificar se slug está na resposta

**Resultado Esperado:**
- ✅ Backend encontra evento por UUID
- ✅ Slug está na resposta
- ✅ Dados completos do evento são retornados

---

### Teste 10: Edge Cases - Caracteres Especiais

**Passos:**
1. Criar evento com título: "Evento com @#$ Caracteres Especiais!"
2. Verificar slug gerado → deve remover caracteres especiais
3. Criar evento com título muito longo (mais de 100 caracteres)
4. Verificar se slug é truncado a 100 caracteres
5. Criar evento com título apenas com espaços
6. Verificar se slug padrão é gerado

**Resultado Esperado:**
- ✅ Caracteres especiais removidos
- ✅ Slug truncado se muito longo
- ✅ Slug padrão gerado se título inválido

---

### Teste 11: Listagem de Eventos

**Passos:**
1. Fazer requisição `GET /api/events`
2. Verificar se todos os eventos na resposta têm campo `slug`
3. Verificar se slugs são válidos (formato correto)
4. Verificar se não há eventos sem slug

**Resultado Esperado:**
- ✅ Todos os eventos têm campo `slug`
- ✅ Slugs são válidos
- ✅ Nenhum evento sem slug

---

### Teste 12: Middleware de Ownership com Slug

**Passos:**
1. Criar evento como organizador
2. Obter slug do evento
3. Tentar atualizar evento usando slug: `PUT /api/events/{slug}`
4. Verificar se middleware permite (organizador do evento)
5. Tentar atualizar evento de outro organizador → deve retornar 403

**Resultado Esperado:**
- ✅ Middleware funciona com slug
- ✅ Permite acesso ao organizador do evento
- ✅ Bloqueia acesso de outros organizadores

---

### Teste 13: Links em Todas as Páginas

**Passos:**
1. Acessar `/events` → clicar em evento → verificar URL
2. Acessar `/` (home) → clicar em evento → verificar URL
3. Acessar `/results` → clicar em evento → verificar URL
4. Acessar painel organizador → clicar em "Visualizar Evento" → verificar URL
5. Acessar painel admin → clicar em "Visualizar Evento" → verificar URL
6. Acessar painel corredor → explorar eventos → clicar em evento → verificar URL

**Resultado Esperado:**
- ✅ Todos os links usam `/evento/{slug}`
- ✅ URLs são amigáveis
- ✅ Navegação funciona corretamente

---

### Teste 14: Validação de Slug no Backend

**Passos:**
1. Tentar criar evento com slug inválido: "slug_com_underscore"
2. Verificar se validação retorna erro
3. Tentar criar evento com slug válido: "slug-valido-123"
4. Verificar se criação é bem-sucedida

**Resultado Esperado:**
- ✅ Slug inválido é rejeitado
- ✅ Slug válido é aceito
- ✅ Mensagens de erro são claras

---

### Teste 15: Performance

**Passos:**
1. Listar eventos (deve ser rápido mesmo com muitos eventos)
2. Buscar evento por slug (deve usar índice)
3. Buscar evento por UUID (deve usar índice)
4. Verificar logs de performance

**Resultado Esperado:**
- ✅ Queries são rápidas
- ✅ Índices estão sendo usados
- ✅ Performance aceitável

---

## 🐛 Problemas Conhecidos

Nenhum problema conhecido no momento.

---

## 📝 Notas de Teste

### Ambiente de Teste
- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173`
- Banco de Dados: PostgreSQL local

### Dados de Teste
- Evento 1: "Corrida de Rua Fortaleza 2024"
- Evento 2: "Maratona São Paulo"
- Evento 3: "Corrida 2024" (duplicado)

---

## ✅ Resultados dos Testes

**Data do Teste:** [A preencher]  
**Testador:** [A preencher]  
**Ambiente:** [A preencher]

### Resumo
- Total de Testes: 15
- Testes Passando: [A preencher]
- Testes Falhando: [A preencher]
- Testes Pendentes: [A preencher]

---

## 🔄 Próximos Passos Após Testes

1. Corrigir bugs encontrados
2. Executar testes novamente
3. Documentar problemas e soluções
4. Preparar para deploy (ETAPA 12)

---

**Última Atualização:** 2025-01-20
