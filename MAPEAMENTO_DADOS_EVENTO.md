# Mapeamento de Dados do Evento - ETAPA 1

## 📊 Campos Disponíveis no Banco de Dados (tabela `events`)

### Campos Básicos
- ✅ `id` (UUID) - ID único do evento
- ✅ `organizer_id` (UUID) - ID do organizador
- ✅ `title` (TEXT) - Título do evento
- ✅ `description` (TEXT) - Descrição/regulamento
- ✅ `event_date` (TIMESTAMP) - Data e hora do evento
- ✅ `location` (TEXT) - Endereço completo
- ✅ `city` (TEXT) - Cidade
- ✅ `state` (TEXT) - Estado (UF)
- ✅ `banner_url` (TEXT) - URL do banner
- ✅ `regulation_url` (TEXT) - URL do regulamento
- ✅ `result_url` (TEXT) - URL dos resultados
- ✅ `status` (ENUM) - Status: draft, published, ongoing, finished, cancelled
- ✅ `created_at` (TIMESTAMP) - Data de criação
- ✅ `updated_at` (TIMESTAMP) - Data de atualização

### Campos Relacionados (JOIN)
- ✅ `organizer_name` - Nome do organizador (via JOIN com profiles)

---

## 📄 Campos Exibidos na Página EventDetails.tsx

### ✅ Já Exibidos
1. **Banner do Evento**
   - `banner_url` - Exibido no header
   - Fallback para imagem padrão quando não houver

2. **Informações Principais (Header)**
   - `title` - Título do evento
   - `event_date` - Data formatada
   - `location`, `city`, `state` - Localização completa

3. **Descrição**
   - `description` - Exibida em card "Sobre o Evento"

4. **Categorias**
   - Carregadas via `getEventCategories(eventId)`
   - Exibe: nome, distância, preço, max_participants

5. **Kits**
   - Carregados via `getEventKits(eventId)`
   - Exibe: nome, descrição, preço

6. **Regulamento**
   - `regulation_url` - Botão para download (se disponível)

7. **Status**
   - `status` - Usado para mostrar/ocultar botão de inscrição
   - `status === "finished"` - Mostra resultados

8. **Contador Regressivo**
   - `event_date` - Usado no componente FlipCountdown

### ❌ NÃO Exibidos (Faltantes)
1. **Dados do Organizador**
   - `organizer_name` - Nome do organizador
   - Informações de contato do organizador (email, telefone, website)
   - Logo da organização

2. **Links e Documentos**
   - `result_url` - Link de resultados (não exibido quando evento finalizado)

3. **Informações Adicionais**
   - Horário de largada detalhado
   - Informações sobre retirada de kit
   - Informações sobre estacionamento
   - Informações sobre transporte

---

## 🔄 Campos Usados no RegistrationFlow.tsx

### ✅ Já Usados
1. **Dados do Evento**
   - `event.id` - ID do evento para criação da inscrição
   - `event.title` - Título exibido no dialog

2. **Categorias**
   - Carregadas via props `categories`
   - Usadas para seleção: `category.id`, `category.name`, `category.distance`, `category.price`

3. **Kits**
   - Carregados via props `kits`
   - Usados para seleção: `kit.id`, `kit.name`, `kit.description`, `kit.price`

### ❌ NÃO Usados (Faltantes)
1. **Informações do Evento**
   - `event_date` - Para validação (não permitir inscrição em evento passado)
   - `location` - Para exibir local de retirada de kit
   - Informações sobre retirada de kit

2. **Validações**
   - Verificar se evento está aberto para inscrições
   - Verificar limite de participantes por categoria
   - Verificar se categoria ainda tem vagas

---

## 🔍 Verificação de Endpoints da API

### GET /api/events/:id
**Status:** ✅ Funcional
**Retorna:**
- Todos os campos básicos do evento
- `organizer_name` (via JOIN)

**Faltante:**
- ❌ Dados completos do organizador (email, telefone, website, logo)
- ❌ Informações de contato

### GET /api/events/:eventId/categories
**Status:** ✅ Funcional
**Retorna:**
- Todas as categorias do evento com todos os campos

### GET /api/events/:eventId/kits
**Status:** ✅ Funcional
**Retorna:**
- Todos os kits do evento com todos os campos

---

## 📋 Resumo: Campos Faltantes

### Na Página EventDetails
1. **Dados do Organizador**
   - Nome do organizador (`organizer_name` - já vem, mas não exibido)
   - Email de contato
   - Telefone de contato
   - Website
   - Logo da organização

2. **Links**
   - Link de resultados quando evento finalizado

3. **Informações Adicionais**
   - Horário detalhado
   - Informações sobre retirada de kit
   - Informações sobre estacionamento/transporte

### No RegistrationFlow
1. **Validações**
   - Verificar data do evento (não permitir inscrição em evento passado)
   - Verificar status do evento
   - Verificar vagas disponíveis por categoria

2. **Informações**
   - Local de retirada de kit
   - Horário de retirada de kit

---

## 🎯 Próximos Passos (ETAPA 2)

1. **Adicionar dados do organizador ao endpoint**
   - Modificar `getEventById` para incluir dados do perfil do organizador
   - Ou criar endpoint separado para dados do organizador

2. **Exibir dados do organizador na EventDetails**
   - Seção de contato
   - Logo da organização
   - Informações de contato

3. **Adicionar validações no RegistrationFlow**
   - Validar data do evento
   - Validar status
   - Validar vagas disponíveis

4. **Melhorar exibição de informações**
   - Link de resultados quando evento finalizado
   - Informações adicionais sobre o evento

---

## ✅ Status da ETAPA 1

- [x] Verificar schema completo da tabela events
- [x] Mapear campos exibidos na EventDetails
- [x] Mapear campos usados no RegistrationFlow
- [x] Identificar campos faltantes
- [x] Verificar endpoints da API

**ETAPA 1 CONCLUÍDA** ✅



