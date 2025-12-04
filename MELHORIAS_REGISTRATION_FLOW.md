# Melhorias no Fluxo de Inscrição - RegistrationFlow

## Melhorias Implementadas

### 1. ✅ Efeito Acordeon nos Kits (Passo 2)
- Ao clicar no kit, ele expande mostrando os produtos disponíveis
- Ícone de seta (ChevronDown/ChevronUp) indica se está expandido
- Animação suave de expansão/colapso
- Mostra quantidade de produtos disponíveis no kit

### 2. ✅ Suporte a Lotes (Batches) nas Modalidades (Passo 1)
- Modalidades com lotes mostram botões para selecionar o lote
- Cada lote mostra data de validade e preço
- Lotes são ordenados por data (mais antigo primeiro)
- Preço do lote selecionado é usado no cálculo do total
- Validação: não permite avançar sem selecionar lote (se houver lotes)

### 3. ✅ Seleção de Produtos Variáveis e Variações (Passo 2)
- Produtos variáveis aparecem apenas quando o kit está expandido
- Ao selecionar um produto variável, as variações aparecem abaixo
- Variações ficam desabilitadas (cinzas) até que o produto seja selecionado
- Validação: não permite avançar sem selecionar todas as variações dos produtos variáveis
- Produtos únicos podem ser selecionados diretamente
- Kits sem produtos podem ser selecionados normalmente

## Estrutura de Dados

### Backend
- **`eventCategoriesService.ts`**: Busca batches junto com categorias
- **`eventKitsService.ts`**: Busca produtos e variações junto com kits
- **Interfaces atualizadas**:
  - `EventCategory` com `batches?: CategoryBatch[]`
  - `EventKit` com `products?: KitProduct[]`
  - `KitProduct` com `variants?: ProductVariant[]`

### Frontend
- **`RegistrationFlow.tsx`**: Componente principal atualizado
- **Estados adicionados**:
  - `selectedBatch`: Lote selecionado
  - `expandedKits`: Set de IDs de kits expandidos
  - `selectedProducts`: Map de produtos e variações selecionadas

## Fluxo de Validação

### Passo 1 (Modalidade)
1. Seleciona modalidade
2. Se modalidade tem lotes, seleciona lote
3. Botão "Próximo" desabilitado até:
   - Modalidade selecionada
   - Lote selecionado (se houver lotes)

### Passo 2 (Kit)
1. Expande kit para ver produtos
2. Seleciona produtos variáveis (se houver)
3. Seleciona variações dos produtos variáveis
4. Seleciona tamanho da camisa
5. Botão "Próximo" desabilitado até:
   - Kit selecionado
   - Tamanho da camisa selecionado
   - Todas as variações dos produtos variáveis selecionadas (se houver)

## Componentes Utilizados

- **Collapsible**: Para efeito acordeon nos kits
- **ChevronDown/ChevronUp**: Ícones de expansão
- **CheckCircle2**: Indicador de seleção

## Arquivos Modificados

### Backend
- `backend/src/services/eventCategoriesService.ts`
  - Adicionada interface `CategoryBatch`
  - Atualizada `getEventCategories` para buscar batches
  - `EventCategory` agora inclui `batches`

- `backend/src/services/eventKitsService.ts`
  - Adicionadas interfaces `KitProduct` e `ProductVariant`
  - Atualizada `getEventKits` para buscar produtos e variações
  - `EventKit` agora inclui `products`

### Frontend
- `src/lib/api/eventCategories.ts`
  - Adicionada interface `CategoryBatch`
  - `EventCategory` atualizada

- `src/lib/api/eventKits.ts`
  - Adicionadas interfaces `KitProduct` e `ProductVariant`
  - `EventKit` atualizada

- `src/components/event/RegistrationFlow.tsx`
  - Efeito acordeon nos kits
  - Seleção de lotes nas modalidades
  - Seleção de produtos variáveis e variações
  - Validações atualizadas

- `src/pages/EventDetails.tsx`
  - Interfaces atualizadas para compatibilidade

## Como Testar

1. **Lotes nas Modalidades**:
   - Crie um evento com modalidades que tenham lotes
   - Abra o popup de inscrição
   - Selecione uma modalidade
   - Verifique se os lotes aparecem
   - Selecione um lote
   - Verifique se o preço muda no resumo

2. **Efeito Acordeon nos Kits**:
   - Crie um evento com kits que tenham produtos
   - Abra o popup de inscrição
   - Vá para o passo 2
   - Clique em um kit
   - Verifique se ele expande mostrando os produtos
   - Clique novamente para colapsar

3. **Produtos Variáveis**:
   - Crie um kit com produtos variáveis
   - Abra o popup de inscrição
   - Vá para o passo 2
   - Expanda um kit com produtos variáveis
   - Selecione um produto variável
   - Verifique se as variações aparecem
   - Selecione uma variação
   - Verifique se o botão "Selecionar Kit" fica habilitado
   - Tente avançar sem selecionar variação (deve bloquear)

## Próximos Passos (Opcional)

- [ ] Salvar informações de lote, produto e variação na inscrição
- [ ] Mostrar informações de lote, produto e variação no comprovante
- [ ] Adicionar validação de data para lotes (não permitir selecionar lote futuro)
- [ ] Melhorar UX com animações mais suaves
- [ ] Adicionar tooltips explicativos



