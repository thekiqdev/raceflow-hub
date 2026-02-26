# Testes - Seleção de Atributos Pendentes

## Objetivo
Validar que o sistema identifica e permite completar seleções de atributos pendentes para inscrições com produtos variáveis.

---

## Pré-requisitos

1. Banco de dados com dados de teste
2. Usuário corredor autenticado
3. Evento criado com kit contendo produtos variáveis
4. Inscrição criada (com ou sem atributos selecionados)

---

## Cenário 1: Organizador adiciona variações após inscrições realizadas

### Setup
1. Criar um evento com um kit
2. Adicionar um produto ao kit (sem variações inicialmente)
3. Criar uma inscrição para esse kit (sem selecionar atributos)
4. Adicionar variações ao produto (ex: Tamanho: P, M, G)

### Teste
1. ✅ Fazer login como corredor que tem a inscrição
2. ✅ Acessar o dashboard do corredor
3. ✅ Verificar se o alerta de atributos pendentes aparece
4. ✅ Clicar em "Selecionar Agora"
5. ✅ Verificar se o modal abre mostrando a inscrição
6. ✅ Verificar se o produto aparece com o atributo "Tamanho"
7. ✅ Selecionar um tamanho (ex: M)
8. ✅ Clicar em "Salvar Seleções"
9. ✅ Verificar mensagem de sucesso
10. ✅ Verificar se o alerta desaparece
11. ✅ Verificar se os atributos foram salvos no banco de dados
12. ✅ Exportar CSV e verificar se o atributo aparece na coluna "ATRIBUTO"

### Resultado Esperado
- Alerta aparece corretamente
- Modal permite seleção
- Atributos são salvos
- CSV exporta corretamente

---

## Cenário 2: Inscrições antigas sem dados de variações

### Setup
1. Criar uma inscrição antiga (pode ser manualmente no banco)
2. Garantir que o kit tem produtos com variações
3. Garantir que não há registros em `registration_product_selections` para essa inscrição

### Teste
1. ✅ Fazer login como corredor que tem a inscrição
2. ✅ Acessar o dashboard do corredor
3. ✅ Verificar se o alerta aparece
4. ✅ Clicar em "Selecionar Agora"
5. ✅ Verificar se a inscrição aparece no modal
6. ✅ Selecionar todos os atributos obrigatórios
7. ✅ Salvar
8. ✅ Verificar se foi salvo corretamente

### Resultado Esperado
- Sistema identifica inscrições antigas sem atributos
- Permite completar seleção
- Salva corretamente

---

## Cenário 3: Múltiplas inscrições pendentes

### Setup
1. Criar 3 inscrições diferentes para o mesmo corredor
2. Cada uma com kits diferentes que têm produtos variáveis
3. Nenhuma com atributos selecionados

### Teste
1. ✅ Fazer login como corredor
2. ✅ Verificar se o alerta mostra quantidade correta (3 inscrições)
3. ✅ Abrir modal
4. ✅ Verificar se todas as 3 inscrições aparecem
5. ✅ Completar atributos para a primeira inscrição
6. ✅ Verificar se ainda mostra as outras 2 como pendentes
7. ✅ Completar todas
8. ✅ Verificar se alerta desaparece

### Resultado Esperado
- Alerta mostra quantidade correta
- Modal lista todas as inscrições
- Permite completar uma por vez ou todas de uma vez
- Atualiza corretamente após cada salvamento

---

## Cenário 4: Produtos com múltiplos atributos

### Setup
1. Criar produto com múltiplos atributos (ex: Tamanho e Cor)
2. Criar inscrição com esse produto
3. Não selecionar atributos

### Teste
1. ✅ Abrir modal de seleção
2. ✅ Verificar se aparecem 2 dropdowns (Tamanho e Cor)
3. ✅ Selecionar apenas Tamanho
4. ✅ Tentar salvar
5. ✅ Verificar se mostra erro pedindo Cor
6. ✅ Selecionar Cor também
7. ✅ Salvar
8. ✅ Verificar se ambos foram salvos

### Resultado Esperado
- Todos os atributos obrigatórios aparecem
- Validação impede salvar sem todos
- Todos são salvos corretamente

---

## Cenário 5: Inscrições canceladas

### Setup
1. Criar inscrição com atributos pendentes
2. Cancelar a inscrição

### Teste
1. ✅ Fazer login como corredor
2. ✅ Verificar se o alerta NÃO aparece para inscrição cancelada
3. ✅ Verificar endpoint `/registrations/missing-attributes`
4. ✅ Verificar se não retorna inscrições canceladas

### Resultado Esperado
- Inscrições canceladas não aparecem no alerta
- Endpoint não retorna inscrições canceladas

---

## Cenário 6: Validação de segurança

### Teste de Autenticação
1. ✅ Tentar acessar `/registrations/missing-attributes` sem autenticação
2. ✅ Verificar se retorna 401 Unauthorized

### Teste de Autorização
1. ✅ Fazer login como corredor A
2. ✅ Tentar completar atributos de inscrição do corredor B
3. ✅ Verificar se retorna 403 Forbidden

### Teste de Validação de Dados
1. ✅ Tentar enviar dados inválidos (IDs não UUID)
2. ✅ Verificar se retorna erro de validação
3. ✅ Tentar enviar atributos que não existem
4. ✅ Verificar se retorna erro apropriado
5. ✅ Tentar enviar valores de atributos inválidos
6. ✅ Verificar se retorna erro

### Resultado Esperado
- Todas as validações de segurança funcionam
- Erros apropriados são retornados

---

## Cenário 7: Edge Cases

### Teste: Inscrição sem kit
1. ✅ Criar inscrição sem kit selecionado
2. ✅ Verificar se não aparece no alerta

### Teste: Kit sem produtos variáveis
1. ✅ Criar inscrição com kit que não tem produtos variáveis
2. ✅ Verificar se não aparece no alerta

### Teste: Produto com variações mas todos atributos já selecionados
1. ✅ Criar inscrição e selecionar todos os atributos
2. ✅ Verificar se não aparece no alerta

### Teste: Produto com alguns atributos selecionados
1. ✅ Criar inscrição e selecionar apenas 1 de 2 atributos
2. ✅ Verificar se aparece no alerta
3. ✅ Verificar se mostra apenas o atributo faltante

### Resultado Esperado
- Edge cases são tratados corretamente
- Sistema não mostra falsos positivos

---

## Checklist de Validação Completa

### Backend
- [ ] Endpoint GET `/registrations/missing-attributes` retorna apenas inscrições do usuário
- [ ] Endpoint retorna apenas inscrições confirmadas ou pendentes
- [ ] Endpoint retorna dados completos (evento, kit, produtos, variantes)
- [ ] Endpoint POST `/registrations/:id/complete-attributes` valida autenticação
- [ ] Endpoint valida propriedade da inscrição
- [ ] Endpoint valida que produtos pertencem ao kit
- [ ] Endpoint valida que todos os atributos obrigatórios foram fornecidos
- [ ] Endpoint valida que valores de atributos são válidos
- [ ] Endpoint salva seleções corretamente no banco
- [ ] Endpoint permite atualizar seleções existentes

### Frontend
- [ ] Alerta aparece quando há atributos pendentes
- [ ] Alerta não aparece quando não há pendências
- [ ] Alerta mostra quantidade correta
- [ ] Alerta pode ser descartado
- [ ] Modal abre ao clicar em "Selecionar Agora"
- [ ] Modal lista todas as inscrições pendentes
- [ ] Modal mostra informações do evento e kit
- [ ] Modal mostra produtos e atributos necessários
- [ ] Dropdowns carregam valores corretos
- [ ] Validação impede salvar sem todos os atributos
- [ ] Feedback visual de loading ao salvar
- [ ] Mensagem de sucesso após salvar
- [ ] Alerta desaparece após salvar todas as pendências
- [ ] Página recarrega após salvar (ou atualiza estado)

### Integração
- [ ] Dados salvos aparecem no CSV exportado
- [ ] Dados salvos aparecem na visualização de detalhes da inscrição
- [ ] Dados salvos aparecem no comprovante de inscrição

### Performance
- [ ] Carregamento do alerta é rápido (< 1s)
- [ ] Modal carrega dados rapidamente
- [ ] Salvamento é rápido (< 2s)

---

## Como Executar os Testes

### 1. Preparar Ambiente de Teste

```sql
-- Criar evento de teste
INSERT INTO events (id, title, organizer_id, ...) VALUES (...);

-- Criar kit com produto variável
INSERT INTO event_kits (id, event_id, name, ...) VALUES (...);
INSERT INTO kit_products (id, kit_id, name, type, variant_attributes) 
VALUES (..., 'variable', ARRAY['Tamanho']);

-- Criar variantes
INSERT INTO product_variants (id, product_id, name, price) VALUES
(..., 'P'),
(..., 'M'),
(..., 'G');

-- Criar inscrição sem atributos
INSERT INTO registrations (id, event_id, runner_id, kit_id, status, ...) 
VALUES (...);
```

### 2. Testar via Interface

1. Iniciar servidor backend e frontend
2. Fazer login como corredor
3. Seguir os cenários acima

### 3. Testar via API (Postman/curl)

```bash
# GET missing attributes
curl -X GET http://localhost:3001/api/registrations/missing-attributes \
  -H "Authorization: Bearer TOKEN"

# POST complete attributes
curl -X POST http://localhost:3001/api/registrations/REGISTRATION_ID/complete-attributes \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product_selections": [
      {
        "product_id": "PRODUCT_ID",
        "attribute_selections": {
          "Tamanho": "M"
        }
      }
    ]
  }'
```

---

## Problemas Conhecidos e Soluções

### Problema: Alerta não aparece
**Solução:** Verificar se:
- Inscrição tem status 'confirmed' ou 'pending'
- Kit tem produtos com `variant_attributes` não nulo
- Não há registros em `registration_product_selections` para todos os atributos

### Problema: Valores não aparecem no dropdown
**Solução:** Verificar se:
- Variantes foram criadas corretamente
- Nome da variante está no formato "Valor1 - Valor2"
- `variant_attributes` do produto está correto

### Problema: Erro ao salvar
**Solução:** Verificar logs do backend para:
- Erros de validação
- Erros de permissão
- Erros de banco de dados

---

## Notas Finais

- Todos os testes devem ser executados em ambiente de desenvolvimento primeiro
- Após validação, testar em ambiente de staging
- Documentar quaisquer problemas encontrados
- Atualizar este documento com novos cenários de teste se necessário
