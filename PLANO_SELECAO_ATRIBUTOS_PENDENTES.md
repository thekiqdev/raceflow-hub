# Plano: Seleção de Atributos Pendentes para Inscrições

## Objetivo
Garantir que todas as inscrições com kits/produtos que possuem variações tenham os atributos selecionados, mesmo quando:
1. O organizador adiciona variações depois que já existem inscrições realizadas
2. Atualizações anteriores não colheram dados de variações selecionadas

## Cenários Identificados
- **Cenário 1:** Organizador adiciona variações após inscrições já realizadas
- **Cenário 2:** Inscrições antigas não possuem dados de variações selecionadas

## Solução Proposta
Criar um sistema de alerta e seleção obrigatória de atributos para corredores que possuem inscrições com produtos variáveis sem atributos selecionados.

---

## Etapa 1: Backend - Identificar Inscrições com Atributos Pendentes

**Objetivo:** Criar função/service para identificar inscrições que precisam de seleção de atributos.

**Tarefas:**
1. Criar função `getRegistrationsWithMissingAttributes(userId: string)` no serviço de registrations
2. A função deve:
   - Buscar todas as inscrições do usuário com status 'confirmed' ou 'pending'
   - Para cada inscrição, verificar se o kit possui produtos com variações
   - Verificar se existe registro em `registration_product_selections` para cada produto variável
   - Retornar lista de inscrições que precisam de seleção de atributos
3. Criar endpoint GET `/registrations/missing-attributes` que retorna essas inscrições
4. Retornar dados necessários:
   - `registration_id`
   - `event_title`
   - `event_date`
   - `kit_id`
   - `kit_name`
   - `products_with_missing_attributes`: Array com:
     - `product_id`
     - `product_name`
     - `variant_attributes`: Array de nomes de atributos necessários
     - `available_variants`: Array de variantes disponíveis

**Critérios de Aceite:**
- ✅ Função identifica corretamente inscrições com atributos pendentes
- ✅ Endpoint retorna apenas inscrições do usuário autenticado
- ✅ Retorna informações suficientes para exibir opções de seleção

---

## Etapa 2: Backend - Salvar Seleção de Atributos Pendentes

**Objetivo:** Criar endpoint para salvar seleções de atributos para inscrições existentes.

**Tarefas:**
1. Criar endpoint POST `/registrations/:id/complete-attributes`
2. Validar:
   - Usuário é dono da inscrição (runner_id ou registered_by)
   - Inscrição existe e está ativa (não cancelada)
   - Produtos informados pertencem ao kit da inscrição
   - Todos os atributos obrigatórios foram fornecidos
3. Salvar seleções em `registration_product_selections`:
   - Para cada produto com atributos:
     - Inserir registro com `registration_id`, `product_id`, `variant_id` (se aplicável), `attribute_name`, `attribute_value`
4. Retornar sucesso ou erro apropriado

**Critérios de Aceite:**
- ✅ Endpoint valida permissões corretamente
- ✅ Salva seleções de atributos corretamente
- ✅ Retorna erro se atributos obrigatórios estiverem faltando
- ✅ Não permite sobrescrever seleções já existentes (ou permite atualização?)

---

## Etapa 3: Frontend - Componente de Alerta de Atributos Pendentes

**Objetivo:** Criar componente que exibe alerta para corredores com atributos pendentes.

**Tarefas:**
1. Criar componente `MissingAttributesAlert.tsx`:
   - Exibir banner/alert no topo do dashboard do corredor
   - Mostrar quantidade de inscrições com atributos pendentes
   - Botão "Selecionar Agora" que abre modal/dialog
   - Estilo destacado (warning/alert)
2. Integrar no `RunnerDashboard.tsx`:
   - Carregar lista de inscrições com atributos pendentes ao montar componente
   - Exibir alerta apenas se houver inscrições pendentes
   - Atualizar lista após seleção ser salva

**Critérios de Aceite:**
- ✅ Alerta aparece apenas quando há atributos pendentes
- ✅ Alerta é visível e chama atenção
- ✅ Botão abre modal de seleção

---

## Etapa 4: Frontend - Modal de Seleção de Atributos

**Objetivo:** Criar modal para seleção de atributos pendentes.

**Tarefas:**
1. Criar componente `MissingAttributesModal.tsx`:
   - Listar todas as inscrições com atributos pendentes
   - Para cada inscrição, mostrar:
     - Nome do evento
     - Data do evento
     - Kit selecionado
     - Produtos que precisam de atributos
   - Para cada produto:
     - Exibir nome do produto
     - Exibir dropdown/select para cada atributo necessário
     - Carregar opções disponíveis do produto
   - Botão "Salvar Seleções" que envia dados
   - Feedback visual (loading, sucesso, erro)
2. Integrar com API:
   - Chamar GET `/registrations/missing-attributes` para carregar dados
   - Chamar POST `/registrations/:id/complete-attributes` para salvar
3. Atualizar estado após salvar:
   - Remover inscrição da lista de pendentes
   - Fechar modal se não houver mais pendências
   - Atualizar alerta no dashboard

**Critérios de Aceite:**
- ✅ Modal exibe todas as informações necessárias
- ✅ Dropdowns carregam opções corretas
- ✅ Validação impede envio sem todos os atributos
- ✅ Feedback visual claro (loading, sucesso, erro)
- ✅ Atualiza estado após salvar

---

## Etapa 5: Frontend - API Client para Atributos Pendentes

**Objetivo:** Criar funções no API client para comunicação com endpoints.

**Tarefas:**
1. Adicionar em `src/lib/api/registrations.ts`:
   - `getRegistrationsWithMissingAttributes()`: GET `/registrations/missing-attributes`
   - `completeRegistrationAttributes(registrationId, productSelections)`: POST `/registrations/:id/complete-attributes`
2. Definir interfaces TypeScript:
   - `MissingAttributesRegistration`
   - `ProductWithMissingAttributes`
   - `CompleteAttributesData`

**Critérios de Aceite:**
- ✅ Funções fazem chamadas corretas à API
- ✅ Interfaces TypeScript bem definidas
- ✅ Tratamento de erros adequado

---

## Etapa 6: Backend - Validação e Segurança

**Objetivo:** Garantir validações e segurança nos endpoints.

**Tarefas:**
1. Validar dados de entrada:
   - Schema Zod para validação de `complete-attributes`
   - Verificar se produtos pertencem ao kit da inscrição
   - Verificar se variantes existem e pertencem aos produtos
   - Verificar se valores de atributos são válidos
2. Segurança:
   - Verificar autenticação em ambos endpoints
   - Verificar que usuário é dono da inscrição
   - Prevenir SQL injection
   - Rate limiting (se necessário)

**Critérios de Aceite:**
- ✅ Todas as validações funcionam corretamente
- ✅ Segurança implementada
- ✅ Mensagens de erro claras

---

## Etapa 7: Testes e Validação

**Objetivo:** Testar funcionalidade completa.

**Tarefas:**
1. Testar cenário 1:
   - Criar inscrição sem variações
   - Adicionar variações ao produto
   - Verificar se alerta aparece
   - Selecionar atributos
   - Verificar se salva corretamente
2. Testar cenário 2:
   - Criar inscrição antiga sem atributos
   - Verificar se sistema identifica
   - Selecionar atributos
   - Verificar se salva corretamente
3. Testar edge cases:
   - Múltiplas inscrições pendentes
   - Produtos com múltiplos atributos
   - Inscrições canceladas (não devem aparecer)
   - Inscrições já com atributos (não devem aparecer)

**Critérios de Aceite:**
- ✅ Todos os cenários funcionam corretamente
- ✅ Edge cases tratados adequadamente
- ✅ Performance aceitável

---

## Etapa 8: Documentação e Deploy

**Objetivo:** Documentar e fazer deploy da funcionalidade.

**Tarefas:**
1. Documentar:
   - Como funciona o sistema
   - Como usar (para desenvolvedores)
   - Como funciona para corredores
2. Atualizar README se necessário
3. Fazer deploy e monitorar

**Critérios de Aceite:**
- ✅ Documentação completa
- ✅ Deploy realizado com sucesso
- ✅ Sistema funcionando em produção

---

## Resumo das Etapas

1. ✅ **Etapa 1:** Backend - Identificar Inscrições com Atributos Pendentes
2. ✅ **Etapa 2:** Backend - Salvar Seleção de Atributos Pendentes
3. ✅ **Etapa 3:** Frontend - Componente de Alerta de Atributos Pendentes
4. ✅ **Etapa 4:** Frontend - Modal de Seleção de Atributos
5. ✅ **Etapa 5:** Frontend - API Client para Atributos Pendentes
6. ✅ **Etapa 6:** Backend - Validação e Segurança
7. ✅ **Etapa 7:** Testes e Validação
8. ⏳ **Etapa 8:** Documentação e Deploy

---

## Notas Técnicas

### Estrutura de Dados Esperada

**GET `/registrations/missing-attributes` Response:**
```typescript
{
  success: true,
  data: [
    {
      registration_id: string,
      event_title: string,
      event_date: string,
      kit_id: string,
      kit_name: string,
      products_with_missing_attributes: [
        {
          product_id: string,
          product_name: string,
          variant_attributes: string[], // ['Tamanho', 'Cor']
          available_variants: [
            {
              variant_id: string,
              variant_name: string,
              attribute_values: { [key: string]: string } // { 'Tamanho': 'M', 'Cor': 'Azul' }
            }
          ]
        }
      ]
    }
  ]
}
```

**POST `/registrations/:id/complete-attributes` Request:**
```typescript
{
  product_selections: [
    {
      product_id: string,
      variant_id?: string,
      attribute_selections: {
        [attributeName: string]: string // { 'Tamanho': 'M' }
      }
    }
  ]
}
```

### Considerações

- **Performance:** Se houver muitas inscrições, considerar paginação ou cache
- **UX:** Modal pode ser grande se houver muitas inscrições pendentes - considerar scroll ou paginação
- **Notificações:** Considerar enviar email/notificação quando organizador adiciona variações a produtos de kits já vendidos
- **Histórico:** Manter log de quando atributos foram completados (opcional)
