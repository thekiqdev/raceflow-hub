# Recuperação de Atributos de Inscrições Antigas

## Problema

Inscrições feitas antes da correção do sistema não tiveram os atributos (ex: Tamanho: P) salvos na tabela `registration_product_selections`. Isso faz com que esses atributos não apareçam na exportação CSV.

## Limitações

**⚠️ IMPORTANTE: Não é possível recuperar dados que não foram salvos originalmente.**

Se os atributos não foram salvos no momento da inscrição, não há como recuperá-los retroativamente, pois:

1. Os dados não existem no banco de dados
2. Não há histórico ou log que armazene essas informações
3. Não há como saber qual variante foi escolhida para cada inscrição antiga

## Solução Parcial

Foi criado um script (`backend/scripts/recover-product-selections.ts`) que tenta uma recuperação **parcial** quando possível:

### Quando o script pode recuperar dados:

- ✅ Se o produto ainda existe e tem `variant_attributes` configurado
- ✅ Se as variantes ainda existem e seguem o formato "Value1 - Value2 - ..."
- ✅ Se o número de valores na variante corresponde ao número de atributos

### Quando o script NÃO pode recuperar:

- ❌ Se os dados não foram salvos originalmente
- ❌ Se a variante foi deletada ou modificada
- ❌ Se o formato da variante mudou
- ❌ Se não há como identificar qual variante foi usada

## Como Usar o Script

### Opção 1: Executar diretamente

```bash
cd backend
npx ts-node scripts/recover-product-selections.ts
```

### Opção 2: Adicionar ao package.json

Adicione ao `package.json` do backend:

```json
{
  "scripts": {
    "recover-selections": "ts-node scripts/recover-product-selections.ts"
  }
}
```

Depois execute:

```bash
npm run recover-selections
```

## O que o Script Faz

1. Identifica inscrições sem seleções de produtos
2. Para cada inscrição, busca produtos variáveis do kit
3. Tenta encontrar variantes que correspondam aos atributos
4. Se encontrar correspondência, salva os atributos recuperados

## Resultado Esperado

O script mostrará:
- ✅ Quantas inscrições foram recuperadas com sucesso
- ⏭️ Quantas foram ignoradas (sem dados para recuperar)
- ❌ Quantos erros ocorreram

## Recomendações

1. **Execute o script** para verificar se há dados recuperáveis
2. **Documente** quais inscrições não puderam ser recuperadas
3. **Informe os organizadores** que inscrições antigas podem não ter atributos no CSV
4. **Garanta** que novas inscrições serão salvas corretamente (já corrigido)

## Status da Correção

- ✅ **Corrigido**: Novas inscrições agora salvam atributos corretamente
- ⚠️ **Parcial**: Script de recuperação disponível para tentar recuperar dados antigos
- ❌ **Não recuperável**: Dados que não foram salvos originalmente não podem ser recuperados
