# Solução - Modalidades não aparecem no popup

## Problema Identificado
As modalidades estão cadastradas no evento "Corrida Teste", mas não aparecem no popup de inscrição.

## Confirmação
- **Tabela no banco**: `event_categories` (armazena as modalidades)
- **Endpoint correto**: `/api/events/:eventId/categories`
- **Query SQL**: Está buscando corretamente da tabela `event_categories`

## Possíveis Causas

### 1. Modalidades não cadastradas para este evento
- Verificar se as modalidades foram cadastradas com o `event_id` correto
- Executar o script `verificar_modalidades.sql` para confirmar

### 2. Problema na query SQL
- A query pode estar retornando 0 linhas
- Verificar logs do backend para ver o que a query retorna

### 3. Problema no mapeamento dos dados
- Os dados podem estar sendo retornados mas não mapeados corretamente

## Correções Implementadas

### 1. Verificação Simples Adicionada
- Adicionada query simples antes da query complexa
- Verifica se existem modalidades básicas (sem JOIN)
- Loga o resultado para debug

### 2. Logs Melhorados
- Log mostra quantas modalidades foram encontradas na verificação simples
- Log mostra a primeira modalidade encontrada (se houver)
- Warning se nenhuma modalidade for encontrada

## Como Verificar

### 1. Verificar no Banco de Dados
Execute o script `verificar_modalidades.sql`:

```sql
-- Verificar modalidades do evento
SELECT 
  ec.id,
  ec.event_id,
  ec.name as modalidade,
  ec.distance,
  ec.price,
  ec.max_participants
FROM event_categories ec
WHERE ec.event_id = 'df940e97-0376-4f7b-ad18-107fd3d61e3b';
```

### 2. Verificar Logs do Backend
Quando abrir o popup, verifique os logs do backend:

```
🔍 getEventCategories called with eventId: df940e97-0376-4f7b-ad18-107fd3d61e3b
📋 Simple check - Modalidades encontradas (sem JOIN): X
📋 SQL query returned X rows
```

### 3. Se Nenhuma Modalidade for Encontrada
- Verifique se as modalidades foram cadastradas no painel do organizador
- Verifique se o `event_id` está correto
- Verifique se há algum problema ao salvar as modalidades

## Próximos Passos

1. **Reinicie o backend** para aplicar as mudanças
2. **Teste novamente** abrindo o popup de inscrição
3. **Verifique os logs** do backend para ver quantas modalidades foram encontradas
4. **Se ainda não aparecer**, execute o script SQL para verificar diretamente no banco

## Arquivos Modificados

- `backend/src/services/eventCategoriesService.ts`
  - Adicionada verificação simples antes da query complexa
  - Logs melhorados para debug



