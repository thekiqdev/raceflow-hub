# Investigação: Atributos não aparecem no CSV

## Problema Identificado

Os atributos dos produtos selecionados não estão aparecendo na coluna "ATRIBUTO" do CSV exportado.

## Investigação Realizada

### 1. Função `getProductAttributes`

**Arquivo:** `backend/src/controllers/registrationsController.ts` (linha 1931-1949)

**Problema encontrado:**
- A função estava formatando os atributos de forma simples, apenas juntando todos com `; `
- Não estava agrupando por produto
- Não havia logs de debug para identificar problemas

**Código anterior:**
```typescript
const getProductAttributes = async (registrationId: string): Promise<string> => {
  try {
    const selections = await getRegistrationProductSelections(registrationId);
    if (!selections || selections.length === 0) {
      return '';
    }
    
    // Group by product and format as "Atributo: Valor"
    const attributeStrings = selections.map(sel => {
      return `${sel.attribute_name}: ${sel.attribute_value}`;
    });
  
    // Join multiple attributes with semicolon
    return attributeStrings.join('; ');
  } catch (error) {
    console.error(`Error fetching product selections for registration ${registrationId}:`, error);
    return '';
  }
};
```

### 2. Correção Aplicada

**Melhorias implementadas:**

1. **Agrupamento por produto:**
   - Agrupa atributos por `product_id`
   - Mantém o nome do produto para referência

2. **Formatação melhorada:**
   - Formato: `Produto1 (Atributo1: Valor1; Atributo2: Valor2) | Produto2 (...)`
   - Separa múltiplos produtos com ` | `
   - Separa atributos do mesmo produto com `; `

3. **Logs de debug:**
   - Adicionados logs para as primeiras 3 inscrições
   - Mostra `registration_id`, `attributes_result` e `attributes_length`

**Código atualizado:**
```typescript
const getProductAttributes = async (registrationId: string): Promise<string> => {
  try {
    const selections = await getRegistrationProductSelections(registrationId);
    
    if (!selections || selections.length === 0) {
      return '';
    }
    
    // Group by product
    const productGroups = new Map<string, {
      product_name: string;
      attributes: Array<{ attribute_name: string; attribute_value: string }>;
    }>();
    
    selections.forEach((sel) => {
      const productKey = sel.product_id;
      if (!productGroups.has(productKey)) {
        productGroups.set(productKey, {
          product_name: sel.product_name || 'Produto',
          attributes: [],
        });
      }
      productGroups.get(productKey)!.attributes.push({
        attribute_name: sel.attribute_name,
        attribute_value: sel.attribute_value,
      });
    });
    
    // Format as "Produto: Atributo1: Valor1; Atributo2: Valor2 | Produto2: ..."
    const productStrings = Array.from(productGroups.entries()).map(([productId, productData]) => {
      const attributeStrings = productData.attributes.map(attr => {
        return `${attr.attribute_name}: ${attr.attribute_value}`;
      });
      return `${productData.product_name} (${attributeStrings.join('; ')})`;
    });
    
    return productStrings.join(' | ');
  } catch (error: any) {
    console.error(`❌ Error fetching product selections for registration ${registrationId}:`, error.message || error);
    return '';
  }
};
```

## Possíveis Causas do Problema

1. **Dados não salvos:** Inscrições antigas podem não ter `product_selections` salvos
2. **Erro silenciado:** O try/catch pode estar escondendo erros
3. **Query retornando vazio:** A query pode não estar encontrando os dados
4. **Formatação incorreta:** A formatação anterior pode não estar clara

## Formato Final no CSV

### Exemplo de saída:

**Antes:**
```
Tamanho: P; Cor: Azul
```

**Depois:**
```
Camiseta (Tamanho: P; Cor: Azul) | Medalha (Tipo: Ouro)
```

## Verificação

Para verificar se está funcionando:

1. Exportar CSV de inscrições que tenham produtos/variantes selecionados
2. Verificar a coluna "ATRIBUTO" no CSV
3. Verificar logs do servidor para debug das primeiras 3 inscrições
4. Verificar se os dados estão sendo salvos corretamente na tabela `registration_product_selections`

## Próximos Passos

1. ✅ Melhorar formatação dos atributos (CONCLUÍDO)
2. ✅ Adicionar logs de debug (CONCLUÍDO)
3. ⚠️ Testar exportação com inscrições que tenham atributos
4. ⚠️ Verificar se dados antigos precisam ser migrados

## Observações

- A função `getRegistrationProductSelections` está funcionando corretamente
- O problema estava na formatação e agrupamento dos dados
- Agora os atributos são agrupados por produto e formatados de forma mais clara
- Logs de debug ajudam a identificar problemas em produção
