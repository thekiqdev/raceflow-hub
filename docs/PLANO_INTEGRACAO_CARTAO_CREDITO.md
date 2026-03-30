# Plano de Implementação - Pagamento via Cartão de Crédito (Asaas)

## 📋 Visão Geral

Este documento descreve o plano de implementação para adicionar a opção de pagamento via cartão de crédito utilizando o gateway Asaas no fluxo de inscrição de eventos.

### Fluxo Atual
1. Seleção de modalidade
2. Seleção de categoria
3. Seleção de kit
4. Resumo
5. Processamento de pagamento PIX

### Novo Fluxo
1. Seleção de modalidade
2. Seleção de categoria
3. Seleção de kit
4. Resumo
5. **Seleção de método de pagamento** (NOVO)
6. Processamento de método de pagamento (PIX ou Cartão de Crédito)

## 📚 Referências

- [Documentação Asaas - Criar cobrança com cartão de crédito](https://docs.asaas.com/reference/criar-cobranca-com-cartao-de-credito)
- [Guia de cobranças via cartão de crédito](https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito)

## 🎯 Objetivos

1. Adicionar etapa de seleção de método de pagamento (PIX ou Cartão de Crédito)
2. Implementar processamento de pagamento via cartão de crédito no Asaas
3. Coletar dados do cartão de crédito de forma segura
4. Processar pagamento imediato ou redirecionar para interface do Asaas
5. Tratar respostas de pagamento (aprovado, negado, pendente)
6. Manter compatibilidade com o fluxo PIX existente

## 📦 Componentes a Modificar/Criar

### Frontend
- `src/components/event/RegistrationFlow.tsx` - Adicionar etapa de seleção de método de pagamento
- `src/components/payment/CreditCardForm.tsx` - Novo componente para formulário de cartão de crédito
- `src/lib/api/registrations.ts` - Adicionar suporte para payment_method no createRegistration

### Backend
- `backend/src/controllers/registrationsController.ts` - Modificar para aceitar payment_method e dados de cartão
- `backend/src/services/asaasService.ts` - Adicionar função para criar pagamento com cartão de crédito
- `backend/src/services/registrationsService.ts` - Atualizar interface para incluir payment_method

## 📝 Etapas de Implementação

### ETAPA 1: Preparação e Estrutura de Dados
**Objetivo:** Preparar a estrutura de dados e interfaces para suportar cartão de crédito

**Tarefas:**
1. Atualizar interface `CreateRegistrationData` no frontend para incluir:
   - `payment_method: 'pix' | 'credit_card'`
   - `credit_card_data?: { ... }` (opcional, apenas se payment_method for credit_card)

2. Atualizar interface no backend para aceitar:
   - `payment_method` no body da requisição
   - `credit_card` e `credit_card_holder_info` (conforme documentação Asaas)

3. Atualizar schema de validação Zod no backend para validar dados de cartão quando necessário

4. Adicionar tipos TypeScript para dados de cartão de crédito:
   ```typescript
   interface CreditCardData {
     holderName: string;
     number: string;
     expiryMonth: string;
     expiryYear: string;
     ccv: string;
   }
   
   interface CreditCardHolderInfo {
     name: string;
     email: string;
     cpfCnpj: string;
     postalCode: string;
     addressNumber: string;
     addressComplement?: string;
     phone: string;
     mobilePhone?: string;
   }
   ```

**Arquivos a modificar:**
- `src/lib/api/registrations.ts`
- `backend/src/controllers/registrationsController.ts`
- `backend/src/services/registrationsService.ts`

---

### ETAPA 2: Componente de Seleção de Método de Pagamento
**Objetivo:** Criar interface para o usuário escolher entre PIX e Cartão de Crédito

**Tarefas:**
1. Adicionar novo step no `RegistrationFlow.tsx` (step 5 - antes do processamento)
2. Criar componente de seleção de método de pagamento:
   - Radio buttons ou cards para escolher PIX ou Cartão de Crédito
   - Design consistente com o restante do fluxo
   - Validação para garantir que um método foi selecionado

3. Atualizar lógica de navegação entre steps:
   - Após resumo (step 4), ir para seleção de método (step 5)
   - Após seleção de método, ir para processamento (step 6)

4. Adicionar estado para armazenar método selecionado:
   ```typescript
   const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'pix' | 'credit_card' | null>(null);
   ```

**Arquivos a modificar:**
- `src/components/event/RegistrationFlow.tsx`

---

### ETAPA 3: Componente de Formulário de Cartão de Crédito
**Objetivo:** Criar formulário seguro para coleta de dados do cartão

**Tarefas:**
1. Criar componente `CreditCardForm.tsx`:
   - Campos para número do cartão (com máscara e validação)
   - Campos para nome do titular (exatamente como no cartão)
   - Campos para validade (mês/ano)
   - Campo para CVV
   - Campos para dados do titular (CPF, CEP, endereço, telefone)
   - Validações em tempo real
   - Máscaras de input apropriadas

2. Implementar validações:
   - Número do cartão (Luhn algorithm)
   - Validade (não pode ser no passado)
   - CVV (3 ou 4 dígitos)
   - CPF válido
   - CEP válido

3. Adicionar feedback visual:
   - Ícone da bandeira do cartão (Visa, Mastercard, etc.)
   - Mensagens de erro claras
   - Estados de loading durante processamento

4. Considerações de segurança:
   - Não armazenar dados do cartão no estado após processamento
   - Limpar dados sensíveis após uso
   - Usar HTTPS obrigatório (já implementado)

**Arquivos a criar:**
- `src/components/payment/CreditCardForm.tsx`

**Dependências:**
- Biblioteca para validação de cartão (opcional, pode ser implementado manualmente)
- Biblioteca para máscaras de input (já existe no projeto)

---

### ETAPA 4: Integração Backend - Serviço Asaas
**Objetivo:** Implementar função para criar pagamento com cartão de crédito no Asaas

**Tarefas:**
1. Atualizar `asaasService.ts`:
   - Adicionar função `createCreditCardPayment`:
     ```typescript
     export const createCreditCardPayment = async (
       registrationId: string,
       customerId: string,
       paymentData: {
         value: number;
         dueDate: string;
         description: string;
         creditCard: CreditCardData;
         creditCardHolderInfo: CreditCardHolderInfo;
         installmentCount?: number; // Para parcelamento futuro
       }
     ): Promise<CreatePaymentResult>
     ```

2. Implementar chamada à API Asaas:
   - Endpoint: `POST /v3/payments`
   - Incluir objetos `creditCard` e `creditCardHolderInfo` no body
   - Tratar respostas de sucesso e erro
   - Retornar status do pagamento (CONFIRMED, PENDING, REFUSED)

3. Tratar diferentes cenários:
   - Pagamento aprovado imediatamente
   - Pagamento pendente (análise)
   - Pagamento negado (retornar motivo)

4. Adicionar logs detalhados para debugging

**Arquivos a modificar:**
- `backend/src/services/asaasService.ts`

**Referências:**
- [Documentação Asaas - Criar cobrança com cartão de crédito](https://docs.asaas.com/reference/criar-cobranca-com-cartao-de-credito)

---

### ETAPA 5: Atualizar Controller de Registrations
**Objetivo:** Modificar controller para processar pagamento via cartão de crédito

**Tarefas:**
1. Atualizar `createRegistrationController`:
   - Aceitar `payment_method` no body
   - Aceitar `credit_card` e `credit_card_holder_info` quando payment_method for 'credit_card'
   - Validar dados de cartão antes de processar
   - Chamar `createCreditCardPayment` quando método for cartão de crédito
   - Manter lógica PIX existente para quando método for 'pix'

2. Atualizar validação Zod:
   - Adicionar schema condicional baseado em `payment_method`
   - Validar dados de cartão apenas se necessário

3. Tratar respostas de pagamento:
   - Se aprovado: atualizar `payment_status` para 'paid' e `status` para 'confirmed'
   - Se negado: manter 'pending' e retornar erro ao usuário
   - Se pendente: manter 'pending' e informar que está em análise

4. Atualizar outros controllers relacionados:
   - `createRegistrationByOrganizerController`
   - `createRegistrationByLeaderController`
   - `generatePaymentController` (adicionar suporte a cartão)

**Arquivos a modificar:**
- `backend/src/controllers/registrationsController.ts`

---

### ETAPA 6: Atualizar Frontend - Integração do Formulário
**Objetivo:** Integrar formulário de cartão no fluxo de inscrição

**Tarefas:**
1. Atualizar `RegistrationFlow.tsx`:
   - Adicionar renderização condicional do formulário de cartão
   - Mostrar `CreditCardForm` quando método selecionado for 'credit_card'
   - Mostrar componente PIX quando método for 'pix'

2. Atualizar função `handleSubmit`:
   - Incluir `payment_method` nos dados de inscrição
   - Incluir dados do cartão quando método for cartão de crédito
   - Tratar diferentes respostas de pagamento:
     - Aprovado: mostrar confirmação
     - Negado: mostrar erro e permitir tentar novamente
     - Pendente: informar que está em análise

3. Adicionar estados de loading:
   - Loading durante processamento do cartão
   - Feedback visual durante validação

4. Tratamento de erros:
   - Exibir mensagens de erro claras
   - Permitir retry em caso de falha
   - Opção de voltar e escolher outro método

**Arquivos a modificar:**
- `src/components/event/RegistrationFlow.tsx`

---

### ETAPA 7: Tratamento de Webhooks e Status
**Objetivo:** Garantir que webhooks do Asaas atualizem status corretamente

**Tarefas:**
1. Verificar `asaasWebhookController.ts`:
   - Confirmar que webhooks de cartão de crédito são tratados
   - Verificar se eventos de pagamento aprovado funcionam para cartão
   - Adicionar logs específicos para pagamentos via cartão

2. Testar cenários:
   - Pagamento aprovado imediatamente
   - Pagamento aprovado após análise
   - Pagamento negado
   - Estorno

3. Atualizar status da inscrição:
   - Garantir que `payment_status` seja atualizado corretamente
   - Garantir que `status` seja atualizado para 'confirmed' quando pago

**Arquivos a verificar/modificar:**
- `backend/src/controllers/asaasWebhookController.ts`

---

### ETAPA 8: Melhorias e Validações Finais
**Objetivo:** Adicionar validações, melhorias de UX e tratamento de edge cases

**Tarefas:**
1. Validações adicionais:
   - Verificar se dados do titular correspondem ao perfil do usuário
   - Validar CEP e endereço
   - Verificar se CPF do titular corresponde ao CPF do usuário

2. Melhorias de UX:
   - Adicionar tooltips explicativos
   - Melhorar mensagens de erro
   - Adicionar animações de transição
   - Feedback visual durante processamento

3. Tratamento de edge cases:
   - Timeout na requisição (recomendado 60s mínimo)
   - Falha de conexão
   - Dados inválidos do cartão
   - Cartão expirado
   - Limite insuficiente

4. Documentação:
   - Atualizar documentação da API
   - Adicionar comentários no código
   - Documentar fluxo de pagamento

**Arquivos a modificar:**
- Todos os arquivos relacionados
- Documentação do projeto

---

### ETAPA 9: Testes e Validação
**Objetivo:** Testar todos os cenários e garantir funcionamento correto

**Tarefas:**
1. Testes no Sandbox Asaas:
   - Testar cartões de teste fornecidos pela documentação
   - Testar cenários de aprovação
   - Testar cenários de negação
   - Testar timeout e erros de conexão

2. Testes de integração:
   - Fluxo completo de inscrição com cartão
   - Verificar atualização de status
   - Verificar webhooks
   - Verificar notificações

3. Testes de validação:
   - Dados inválidos
   - Campos obrigatórios
   - Formatação de dados

4. Testes de segurança:
   - Verificar que dados não são armazenados
   - Verificar HTTPS
   - Verificar limpeza de dados sensíveis

**Cenários de teste:**
- ✅ Inscrição com cartão aprovado
- ✅ Inscrição com cartão negado
- ✅ Inscrição com cartão pendente
- ✅ Alternar entre PIX e cartão
- ✅ Voltar e escolher outro método
- ✅ Validações de formulário
- ✅ Tratamento de erros
- ✅ Webhooks funcionando

---

## 🔒 Considerações de Segurança

1. **SSL/HTTPS obrigatório**: Já implementado, mas verificar
2. **Não armazenar dados do cartão**: Limpar após processamento
3. **Validação no backend**: Sempre validar dados antes de enviar ao Asaas
4. **Logs**: Não logar dados sensíveis (número completo, CVV)
5. **Tokenização**: Considerar usar tokenização do Asaas para transações futuras

## 📊 Estrutura de Dados

### Request Body (Frontend → Backend)
```typescript
{
  event_id: string;
  runner_id: string;
  category_id: string;
  kit_id?: string;
  payment_method: 'pix' | 'credit_card';
  total_amount: number;
  coupon_code?: string;
  // Apenas se payment_method === 'credit_card'
  credit_card?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  credit_card_holder_info?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    addressComplement?: string;
    phone: string;
    mobilePhone?: string;
  };
}
```

### Response (Backend → Frontend)
```typescript
{
  success: boolean;
  data: {
    id: string;
    confirmation_code: string;
    payment?: {
      asaas_payment_id: string;
      status: 'CONFIRMED' | 'PENDING' | 'REFUSED';
      payment_date?: string;
      // Para PIX
      pix_qr_code?: string;
      pix_qr_code_id?: string;
      // Para cartão
      credit_card_token?: string; // Para futuras transações
    };
  };
}
```

## 🚀 Próximos Passos (Futuro)

1. **Parcelamento**: Implementar opção de parcelamento em até 12x (ou 21x para Visa/Master)
2. **Tokenização**: Salvar token do cartão para transações futuras
3. **Pré-autorização**: Implementar pré-autorização para reservas
4. **Múltiplos cartões**: Permitir salvar múltiplos cartões
5. **Interface do Asaas**: Opção de redirecionar para interface do Asaas ao invés de coletar dados

## ✅ Checklist de Implementação

- [ ] ETAPA 1: Preparação e Estrutura de Dados
- [ ] ETAPA 2: Componente de Seleção de Método de Pagamento
- [ ] ETAPA 3: Componente de Formulário de Cartão de Crédito
- [ ] ETAPA 4: Integração Backend - Serviço Asaas
- [ ] ETAPA 5: Atualizar Controller de Registrations
- [ ] ETAPA 6: Atualizar Frontend - Integração do Formulário
- [ ] ETAPA 7: Tratamento de Webhooks e Status
- [ ] ETAPA 8: Melhorias e Validações Finais
- [ ] ETAPA 9: Testes e Validação

---

**Data de Criação:** 2024
**Última Atualização:** 2024
**Versão:** 1.0

