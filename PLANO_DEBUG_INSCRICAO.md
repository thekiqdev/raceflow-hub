# Plano de Debug e Correção - Modal de Inscrição

## Problema Identificado
Ao clicar em "Fazer Inscrição", o popup abre mas não está mostrando nenhuma informação nas etapas (categorias não aparecem).

## Análise do Problema

### Possíveis Causas:
1. **Categorias não estão sendo carregadas** - O evento pode não ter categorias cadastradas
2. **Problema no estado** - As categorias podem não estar sendo passadas corretamente para o componente
3. **Timing issue** - O modal pode estar abrindo antes das categorias serem carregadas
4. **Erro silencioso** - Pode haver um erro na API que não está sendo exibido

## Implementações Realizadas

### ✅ 1. Logs de Debug
- Adicionado `console.log` no `RegistrationFlow` quando o modal abre
- Adicionado `console.log` no `EventDetails` quando categorias são carregadas
- Logs mostram:
  - ID e título do evento
  - Quantidade de categorias e kits
  - Dados completos das categorias e kits

### ✅ 2. Mensagem de Estado Vazio
- Adicionada mensagem quando não há categorias disponíveis
- Mensagem informativa: "Nenhuma categoria disponível para este evento"
- Sugestão para entrar em contato com o organizador

### ✅ 3. Verificação de Evento
- Adicionada verificação `{event && ...}` antes de renderizar o `RegistrationFlow`
- Garante que o evento está carregado antes de passar as props

### ✅ 4. Reset de Estado
- Adicionado `useEffect` para resetar o estado quando o modal fecha
- Garante que o fluxo comece do início a cada abertura

## Próximos Passos para Investigação

### 🔍 Verificação 1: Console do Navegador
1. Abrir o console do navegador (F12)
2. Clicar em "Fazer Inscrição"
3. Verificar os logs:
   - `🔍 RegistrationFlow opened:` - Deve mostrar as categorias
   - `📋 Categories loaded:` - Deve mostrar as categorias carregadas
   - `⚠️ No categories found` - Se aparecer, o evento não tem categorias

### 🔍 Verificação 2: Network Tab
1. Abrir a aba Network no DevTools
2. Filtrar por "categories"
3. Verificar se a requisição `/api/events/:id/categories` está sendo feita
4. Verificar o status da resposta (200, 404, 500)
5. Verificar o conteúdo da resposta

### 🔍 Verificação 3: Banco de Dados
1. Verificar se o evento tem categorias cadastradas na tabela `event_categories`
2. Query: `SELECT * FROM event_categories WHERE event_id = '<event_id>'`

### 🔍 Verificação 4: Backend
1. Verificar se o endpoint `/api/events/:eventId/categories` está funcionando
2. Testar diretamente: `GET /api/events/{eventId}/categories`
3. Verificar logs do backend para erros

## Correções Adicionais Necessárias

### ⏳ Pendente: Loading State
- Adicionar indicador de carregamento enquanto as categorias são buscadas
- Mostrar skeleton ou spinner durante o carregamento

### ⏳ Pendente: Tratamento de Erro Melhorado
- Exibir mensagem de erro mais clara se houver falha no carregamento
- Permitir retry se a requisição falhar

### ⏳ Pendente: Validação de Dados
- Verificar se as categorias têm todos os campos necessários
- Validar formato dos dados antes de renderizar

## Como Testar

1. **Cenário 1: Evento com categorias**
   - Abrir um evento que tem categorias cadastradas
   - Clicar em "Fazer Inscrição"
   - Verificar se as categorias aparecem no modal

2. **Cenário 2: Evento sem categorias**
   - Abrir um evento sem categorias
   - Clicar em "Fazer Inscrição"
   - Verificar se a mensagem "Nenhuma categoria disponível" aparece

3. **Cenário 3: Erro na API**
   - Simular erro na API (desligar backend)
   - Clicar em "Fazer Inscrição"
   - Verificar se a mensagem de erro aparece

## Arquivos Modificados

- `src/components/event/RegistrationFlow.tsx`
  - Adicionado `useEffect` para logs de debug
  - Adicionada mensagem quando não há categorias
  - Adicionado reset de estado quando modal fecha

- `src/pages/EventDetails.tsx`
  - Adicionados logs de debug no carregamento de categorias
  - Adicionada verificação `{event && ...}` antes de renderizar RegistrationFlow

## Comandos Úteis

```sql
-- Verificar categorias de um evento
SELECT ec.*, 
       COUNT(r.id) as current_registrations,
       ec.max_participants - COUNT(r.id) as available_spots
FROM event_categories ec
LEFT JOIN registrations r ON r.category_id = ec.id 
  AND r.status IN ('pending', 'confirmed')
  AND r.payment_status IN ('pending', 'paid')
WHERE ec.event_id = '<event_id>'
GROUP BY ec.id;
```

```bash
# Testar endpoint diretamente
curl http://localhost:3000/api/events/{eventId}/categories
```



