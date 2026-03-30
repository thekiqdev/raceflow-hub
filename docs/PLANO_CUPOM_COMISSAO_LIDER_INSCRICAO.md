# Plano: Cupom e Comissão na Inscrição do Líder

## Objetivo
Garantir que quando o líder inscreve um atleta através do botão "Inscrever Atleta" no painel do líder:
1. O cupom correto (associado à comissão do evento) seja usado automaticamente
2. A comissão seja calculada corretamente baseada na configuração do organizador
3. O sistema reconheça o cupom e aplique a comissão adequada

## Problema Atual
Atualmente, quando o líder inscreve um atleta:
- ✅ Verifica se o líder tem comissão configurada para o evento
- ✅ Cria referência do atleta ao líder
- ❌ **NÃO usa o cupom** associado à comissão do evento
- ❌ A comissão é gerada baseada apenas na referência, não no cupom
- ❌ Pode não usar a configuração correta do organizador (commission_percentage, bonus_type)

## Investigação Necessária

### Passo 1: Entender a Estrutura de Dados ✅ CONCLUÍDO
**Objetivo:** Mapear como cupons são associados a comissões de eventos

**Tarefas:**
- [x] Verificar estrutura da tabela `leader_event_commissions`
- [x] Verificar estrutura da tabela `coupons`
- [x] Entender como o cupom é vinculado à comissão (campo `coupon_id` ou busca por código)
- [x] Verificar como o código do cupom é gerado (contém commission_id?)
- [x] Mapear o fluxo de criação de cupom quando uma comissão é criada

**Arquivos investigados:**
- `backend/src/services/leaderEventCommissionsService.ts`
- `backend/src/services/couponsService.ts`
- `backend/src/controllers/leaderEventCommissionsController.ts`
- Schema do banco de dados (migrations 031, 033, 039, 040)

**Resultado:** Documento criado em `docs/PASSO1_ESTRUTURA_DADOS_CUPOM_COMISSAO.md`

**Principais descobertas:**
- Não há FK direta entre `leader_event_commissions` e `coupons`
- A relação é feita através do código do cupom que contém o ID da comissão (primeiros 8 chars)
- Formato do código: `REFERRAL_CODE + COMMISSION_ID_SHORT + TIMESTAMP + RANDOM`
- Cada comissão gera um cupom único automaticamente
- É possível fazer busca reversa (encontrar comissão pelo código do cupom)

---

### Passo 2: Identificar Como Buscar o Cupom Correto ✅ CONCLUÍDO
**Objetivo:** Criar função para buscar o cupom associado à comissão do evento

**Tarefas:**
- [x] Criar função `getCouponByEventCommission(leaderId, eventId)` 
- [x] Verificar se existe múltiplos cupons para o mesmo evento
- [x] Definir estratégia de seleção (primeiro, mais recente, por nome)
- [x] Testar a função com diferentes cenários

**Arquivos modificados:**
- `backend/src/services/couponsService.ts` (função `getCouponByEventCommission` criada)

**Resultado:** Função criada que:
- Busca a comissão do líder para o evento
- Busca todos os cupons do líder
- Encontra o cupom que corresponde à comissão (por ID no código ou por nome)
- Retorna o cupom ou null se não encontrado
- Inclui logs detalhados para debug
- Trata casos de múltiplos cupons (usa o único ou o primeiro se múltiplos)

---

### Passo 3: Modificar createRegistrationByLeader para Usar Cupom ✅ CONCLUÍDO
**Objetivo:** Incluir o cupom_code na criação da inscrição

**Tarefas:**
- [x] Buscar o cupom associado à comissão do evento antes de criar a inscrição
- [x] Validar se o cupom existe e está ativo
- [x] Adicionar `coupon_code` no objeto `registrationData`
- [x] Garantir que o cupom seja aplicado (desconto, se houver)
- [x] Adicionar logs para debug

**Arquivos modificados:**
- `backend/src/controllers/registrationsController.ts` (função `createRegistrationByLeaderController`)

**Resultado:** 
- Função `getCouponByEventCommission` é chamada para buscar o cupom
- Desconto é calculado e aplicado ao `total_amount` (percentage ou fixed)
- `coupon_code` é adicionado ao `registrationData`
- Logs detalhados adicionados para debug
- Sistema continua funcionando mesmo se cupom não for encontrado (fallback)

---

### Passo 4: Verificar Cálculo de Comissão com Cupom ✅ CONCLUÍDO
**Objetivo:** Garantir que a comissão seja calculada usando a configuração correta

**Tarefas:**
- [x] Verificar como `createCommission` identifica a comissão pelo cupom
- [x] Verificar se `calculateCommissionAmount` usa a configuração do organizador
- [x] Corrigir bug: `calculateCommissionAmount` não usava a comissão encontrada pelo cupom
- [x] Modificar para usar `commissionConfig.commission_percentage` diretamente
- [x] Adicionar logs detalhados para debug

**Arquivos modificados:**
- `backend/src/services/commissionsService.ts` (função `createCommission`)

**Resultado:** 
- Bug corrigido: agora usa a comissão específica encontrada pelo cupom
- Se cupom não encontrar comissão, usa fallback (primeira comissão do tipo 'commission' ou 'both')
- Logs detalhados mostram qual comissão foi usada e se foi encontrada pelo cupom
- Percentual correto (`commission_percentage`) da `leader_event_commission` é usado

---

### Passo 5: Ajustar Frontend para Mostrar Cupom Usado ✅ CONCLUÍDO
**Objetivo:** (Opcional) Mostrar qual cupom foi usado na inscrição

**Tarefas:**
- [x] Verificar se o frontend precisa mostrar o cupom usado
- [x] Adicionar campo no dialog de inscrição (readonly) mostrando o cupom
- [x] Atualizar interface TypeScript para incluir tipo do cupom
- [x] Adicionar cálculo e exibição do desconto no preview do total
- [x] Suportar cupons percentuais e fixos

**Arquivos modificados:**
- `src/components/runner/leader/LeaderDashboard.tsx` (dialog de inscrição)
- `src/lib/api/leaderEventCommissions.ts` (interface TypeScript)
- `backend/src/services/leaderEventCommissionsService.ts` (incluir tipo do cupom na resposta)

**Resultado:** 
- Dialog mostra o cupom que será aplicado quando evento é selecionado
- Exibe desconto (percentual ou fixo) do cupom
- Preview do total mostra subtotal, desconto e total final com desconto aplicado
- Suporta cupons do tipo 'percentage' e 'fixed'

---

### Passo 6: Testar Fluxo Completo ✅ DOCUMENTAÇÃO CRIADA
**Objetivo:** Validar todo o fluxo end-to-end

**Cenários de teste:**
1. **Líder inscreve atleta com comissão tipo 'commission'**
   - Verificar se cupom é usado
   - Verificar se comissão é criada com percentual correto
   - Verificar se valor da comissão está correto

2. **Líder inscreve atleta com comissão tipo 'invitation'**
   - Verificar se cupom é usado
   - Verificar se convite é contabilizado
   - Verificar se bônus de convite é aplicado quando atingir required_purchases

3. **Líder inscreve atleta com comissão tipo 'both'**
   - Verificar se cupom é usado
   - Verificar se comissão é criada
   - Verificar se convite é contabilizado

4. **Líder inscreve atleta sem cupom disponível**
   - Verificar comportamento (erro? fallback para referência?)

5. **Líder inscreve atleta que já tem referência de outro líder**
   - Verificar se cupom tem prioridade sobre referência
   - Verificar qual comissão é gerada

**Arquivos criados:**
- `docs/PASSO6_TESTAR_FLUXO_COMPLETO.md` - Guia completo de testes com 6 cenários detalhados

**Resultado:** 
- Documentação detalhada de todos os cenários de teste
- Checklist de validação (Frontend, Backend, Integração)
- Queries SQL para validação
- Logs para monitorar
- Problemas conhecidos e soluções
- Pronto para execução dos testes

---

### Passo 7: Adicionar Validações e Tratamento de Erros
**Objetivo:** Garantir robustez do sistema

**Tarefas:**
- [ ] Validar se cupom existe antes de usar
- [ ] Validar se cupom está ativo
- [ ] Validar se cupom pertence ao líder
- [ ] Validar se cupom é válido para o evento
- [ ] Tratar erro se cupom não for encontrado (fallback para referência?)
- [ ] Adicionar logs detalhados para debug
- [ ] Adicionar mensagens de erro claras

**Arquivos a modificar:**
- `backend/src/controllers/registrationsController.ts`
- `backend/src/services/couponsService.ts`

**Resultado esperado:** Sistema robusto com tratamento de erros adequado

---

### Passo 8: Documentação e Deploy
**Objetivo:** Documentar mudanças e preparar para deploy

**Tarefas:**
- [ ] Atualizar documentação da API
- [ ] Adicionar comentários no código
- [ ] Criar testes unitários (se aplicável)
- [ ] Preparar changelog
- [ ] Revisar código
- [ ] Deploy em ambiente de teste
- [ ] Validação em produção

**Resultado esperado:** Código documentado e deployado

---

## Estrutura de Dados Relevante

### leader_event_commissions
- `id`: UUID da comissão
- `leader_id`: ID do líder
- `event_id`: ID do evento
- `commission_percentage`: Percentual de comissão
- `bonus_type`: Tipo de bônus ('commission', 'invitation', 'both')
- `required_purchases`: Número de compras necessárias para ganhar convite
- `name`: Nome da comissão (opcional)

### coupons
- `id`: UUID do cupom
- `code`: Código do cupom
- `leader_id`: ID do líder dono do cupom
- `discount_value`: Valor do desconto (se houver)
- `event_id` ou `event_ids`: Evento(s) associado(s)
- Relação com `leader_event_commissions` (precisa investigar)

### registrations
- `id`: UUID da inscrição
- `coupon_code`: Código do cupom usado (se houver)
- `runner_id`: ID do atleta
- `event_id`: ID do evento
- `total_amount`: Valor total da inscrição

---

## Fluxo Esperado (Após Implementação)

1. Líder clica em "Inscrever Atleta" no card do evento
2. Sistema identifica qual comissão está configurada para aquele evento e líder
3. Sistema busca o cupom associado àquela comissão
4. Líder preenche dados do atleta (email, categoria, kit)
5. Sistema cria inscrição com `coupon_code` preenchido
6. Quando pagamento for confirmado:
   - Sistema identifica o cupom na inscrição
   - Sistema identifica a comissão pelo cupom
   - Sistema calcula comissão usando `commission_percentage` da comissão
   - Sistema cria registro de comissão
   - Sistema verifica bônus de convite (se aplicável)

---

## Notas Importantes

1. **Prioridade do Cupom:** O cupom tem prioridade sobre a referência na geração de comissão
2. **Múltiplos Cupons:** Pode haver múltiplos cupons para o mesmo evento - precisa definir estratégia
3. **Validação:** Cupom deve ser validado antes de usar (ativo, válido para evento, pertence ao líder)
4. **Fallback:** Se cupom não for encontrado, considerar usar referência como fallback
5. **Logs:** Adicionar logs detalhados para facilitar debug

---

## Próximos Passos

Para iniciar a implementação, diga: **"ok passo 1"** e seguiremos sequencialmente.

Cada passo será implementado, testado e validado antes de passar para o próximo.

