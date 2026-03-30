# Compatibilidade Retroativa: Associação de Kits a Categorias

## Visão Geral

A funcionalidade de associação de kits a categorias foi implementada de forma totalmente compatível com kits existentes. Kits criados antes da implementação desta funcionalidade continuam funcionando normalmente.

## Regras de Compatibilidade

### 1. Kits sem Associações
- **Comportamento**: Kits que não possuem registros na tabela `kit_categories` aparecem em **todas as categorias**
- **Implementação**: A query SQL verifica se o kit não está na tabela `kit_categories` usando `NOT IN`
- **Exemplo**: Um kit criado antes da migração aparecerá em todas as categorias automaticamente

### 2. Kits com Associações
- **Comportamento**: Kits que possuem registros na tabela `kit_categories` aparecem **apenas nas categorias associadas**
- **Implementação**: A query SQL filtra kits que estão associados à categoria específica
- **Exemplo**: Um kit associado apenas à categoria "5K Masculino" aparecerá somente nessa categoria

## Implementação Técnica

### Backend - Query SQL

```sql
-- Kits disponíveis para uma categoria são:
-- 1. Kits associados à categoria, OU
-- 2. Kits não associados a nenhuma categoria (disponíveis para todas)
SELECT DISTINCT k.*
FROM event_kits k
WHERE k.event_id = $1
  AND (
    k.id IN (
      SELECT kit_id FROM kit_categories WHERE category_id = $2
    )
    OR k.id NOT IN (
      SELECT DISTINCT kit_id FROM kit_categories
    )
  )
ORDER BY k.display_order ASC
```

### Backend - Lógica de Associação

```typescript
// Se categoryIds é vazio/null, remove todas as associações
// Isso faz o kit aparecer em todas as categorias
if (!categoryIds || categoryIds.length === 0) {
  await query(`DELETE FROM kit_categories WHERE kit_id = $1`, [kitId]);
  return;
}
```

### Frontend - Tratamento de category_ids

```typescript
// category_ids é opcional
interface EventKit {
  category_ids?: string[]; // undefined = aparece em todas as categorias
}

// Ao salvar, se category_ids está vazio, envia undefined
category_ids: kit.category_ids && kit.category_ids.length > 0 
  ? kit.category_ids 
  : undefined
```

## Cenários de Uso

### Cenário 1: Kit Existente (Antes da Migração)
- **Estado**: Kit criado antes da migração, sem registros em `kit_categories`
- **Comportamento**: Aparece em todas as categorias automaticamente
- **Ação do Usuário**: Nenhuma ação necessária

### Cenário 2: Kit Novo sem Seleção de Categorias
- **Estado**: Kit criado após migração, mas nenhuma categoria foi selecionada
- **Comportamento**: Aparece em todas as categorias
- **Ação do Usuário**: Pode selecionar categorias específicas se desejar

### Cenário 3: Kit com Categorias Selecionadas
- **Estado**: Kit criado/atualizado com categorias específicas selecionadas
- **Comportamento**: Aparece apenas nas categorias selecionadas
- **Ação do Usuário**: Pode alterar as categorias a qualquer momento

### Cenário 4: Remover Todas as Associações
- **Estado**: Kit tinha categorias selecionadas, usuário remove todas
- **Comportamento**: Volta a aparecer em todas as categorias
- **Ação do Usuário**: Desmarcar todas as categorias no formulário

## Validações

### Validação de Evento
- Todas as categorias associadas devem pertencer ao mesmo evento do kit
- Validação ocorre no backend antes de salvar associações

### Validação de UUIDs
- Todos os `category_ids` devem ser UUIDs válidos
- Validação ocorre no frontend (Zod) e backend

## Migração

A migração `073_create_kit_categories.sql` cria a tabela sem afetar dados existentes:
- Não modifica tabelas existentes
- Não remove dados existentes
- Kits existentes continuam funcionando normalmente

## Testes de Compatibilidade

### Teste 1: Kit Existente
1. Criar evento com kit antes da migração
2. Criar categorias após migração
3. Verificar que kit aparece em todas as categorias

### Teste 2: Kit Novo sem Categorias
1. Criar kit sem selecionar categorias
2. Verificar que kit aparece em todas as categorias

### Teste 3: Kit com Categorias
1. Criar kit e selecionar categorias específicas
2. Verificar que kit aparece apenas nas categorias selecionadas

### Teste 4: Remover Associações
1. Kit com categorias selecionadas
2. Remover todas as categorias
3. Verificar que kit volta a aparecer em todas as categorias

## Conclusão

A implementação garante 100% de compatibilidade retroativa:
- ✅ Kits existentes continuam funcionando
- ✅ Nenhuma ação manual necessária
- ✅ Comportamento padrão é aparecer em todas as categorias
- ✅ Funcionalidade opcional pode ser usada quando necessário
