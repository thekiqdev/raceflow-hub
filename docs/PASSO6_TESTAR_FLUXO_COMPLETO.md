# Passo 6: Testar Fluxo Completo

## ✅ Guia de Testes

## Objetivo
Validar todo o fluxo end-to-end de inscrição de atleta pelo líder, garantindo que:
1. O cupom correto seja usado automaticamente
2. O desconto seja aplicado corretamente
3. A comissão seja calculada usando a configuração correta do organizador
4. Todos os cenários funcionem corretamente

---

## Cenários de Teste

### Cenário 1: Inscrição com Cupom Percentual

**Pré-requisitos:**
- Líder ativo com comissão configurada para o evento
- Cupom do tipo 'percentage' associado à comissão (ex: 10%)
- Evento aberto para inscrições
- Atleta cadastrado no sistema

**Passos:**
1. Acessar painel do líder
2. Ir para aba "Links de Eventos"
3. Clicar em "Inscrever Atleta" no evento desejado
4. Verificar se o cupom aparece no dialog
5. Verificar se o desconto percentual é mostrado corretamente
6. Preencher email do atleta
7. Selecionar categoria e kit (se houver)
8. Verificar preview do total com desconto aplicado
9. Confirmar inscrição

**Resultados Esperados:**
- ✅ Cupom aparece no dialog
- ✅ Desconto percentual é exibido (ex: "Desconto: 10%")
- ✅ Preview mostra: Subtotal → Desconto → Total final
- ✅ Inscrição criada com `coupon_code` preenchido
- ✅ `total_amount` na inscrição já vem com desconto aplicado
- ✅ Quando pagamento for confirmado, comissão é gerada usando o percentual correto da comissão encontrada pelo cupom

**Validações no Backend:**
```sql
-- Verificar inscrição criada
SELECT id, coupon_code, total_amount, payment_status 
FROM registrations 
WHERE registered_by = '<leader_user_id>' 
ORDER BY created_at DESC LIMIT 1;

-- Verificar comissão gerada (após pagamento confirmado)
SELECT lc.*, lec.commission_percentage, lec.bonus_type
FROM leader_commissions lc
JOIN leader_event_commissions lec ON lc.event_id = lec.event_id AND lc.leader_id = lec.leader_id
WHERE lc.registration_id = '<registration_id>';
```

---

### Cenário 2: Inscrição com Cupom Fixo

**Pré-requisitos:**
- Líder ativo com comissão configurada para o evento
- Cupom do tipo 'fixed' associado à comissão (ex: R$ 20,00)
- Evento aberto para inscrições
- Atleta cadastrado no sistema

**Passos:**
1. Acessar painel do líder
2. Ir para aba "Links de Eventos"
3. Clicar em "Inscrever Atleta" no evento desejado
4. Verificar se o cupom aparece no dialog
5. Verificar se o desconto fixo é mostrado corretamente (ex: "Desconto: R$ 20,00")
6. Preencher email do atleta
7. Selecionar categoria e kit (se houver)
8. Verificar preview do total com desconto fixo aplicado
9. Confirmar inscrição

**Resultados Esperados:**
- ✅ Cupom aparece no dialog
- ✅ Desconto fixo é exibido (ex: "Desconto: R$ 20,00")
- ✅ Preview mostra: Subtotal → Desconto (R$ 20,00) → Total final
- ✅ Inscrição criada com `coupon_code` preenchido
- ✅ `total_amount` na inscrição já vem com desconto aplicado
- ✅ Total não fica negativo (Math.max(0, finalAmount))

**Validações no Backend:**
```sql
-- Verificar que total_amount está correto (subtotal - desconto fixo)
SELECT id, coupon_code, total_amount, payment_status 
FROM registrations 
WHERE id = '<registration_id>';
```

---

### Cenário 3: Múltiplas Comissões - Cupom Identifica a Correta

**Pré-requisitos:**
- Líder ativo com múltiplas comissões configuradas para o mesmo evento
  - Comissão 1: ID `abc12345`, percentual 10%
  - Comissão 2: ID `def67890`, percentual 15%
- Cupom associado à Comissão 1 (contém `ABC12345` no código)
- Evento aberto para inscrições
- Atleta cadastrado no sistema

**Passos:**
1. Acessar painel do líder
2. Ir para aba "Links de Eventos"
3. Clicar em "Inscrever Atleta" no evento
4. Verificar se o cupom da Comissão 1 aparece
5. Preencher email do atleta
6. Selecionar categoria
7. Confirmar inscrição
8. Confirmar pagamento manualmente (admin)

**Resultados Esperados:**
- ✅ Cupom da Comissão 1 é usado (não da Comissão 2)
- ✅ Quando pagamento for confirmado, comissão é gerada usando 10% (não 15%)
- ✅ Logs mostram: `found_by_coupon: true`

**Validações no Backend:**
```sql
-- Verificar que comissão foi criada com percentual correto (10%, não 15%)
SELECT lc.*, lec.commission_percentage, lec.id as commission_config_id
FROM leader_commissions lc
JOIN leader_event_commissions lec ON lc.event_id = lec.event_id AND lc.leader_id = lec.leader_id
WHERE lc.registration_id = '<registration_id>'
AND lec.commission_percentage = 10; -- Deve ser 10%, não 15%
```

---

### Cenário 4: Cupom Não Encontrado (Fallback)

**Pré-requisitos:**
- Líder ativo com comissão configurada para o evento
- Cupom não associado à comissão (ou cupom não existe)
- Evento aberto para inscrições
- Atleta cadastrado no sistema

**Passos:**
1. Acessar painel do líder
2. Ir para aba "Links de Eventos"
3. Clicar em "Inscrever Atleta" no evento
4. Verificar que cupom NÃO aparece no dialog (ou aparece mensagem)
5. Preencher email do atleta
6. Selecionar categoria
7. Confirmar inscrição

**Resultados Esperados:**
- ✅ Sistema continua funcionando mesmo sem cupom
- ✅ Inscrição criada sem `coupon_code` (ou com cupom padrão)
- ✅ `total_amount` não tem desconto aplicado
- ✅ Quando pagamento for confirmado, comissão é gerada usando fallback (primeira comissão válida)
- ✅ Logs mostram: `found_by_coupon: false`

**Validações no Backend:**
```sql
-- Verificar inscrição sem cupom
SELECT id, coupon_code, total_amount 
FROM registrations 
WHERE id = '<registration_id>';
-- coupon_code deve ser NULL ou vazio
```

---

### Cenário 5: Cupom Inválido (Inativo, Expirado, etc.)

**Pré-requisitos:**
- Líder ativo com comissão configurada para o evento
- Cupom associado à comissão, mas inválido (inativo, expirado, ou atingiu limite)
- Evento aberto para inscrições
- Atleta cadastrado no sistema

**Passos:**
1. Acessar painel do líder
2. Ir para aba "Links de Eventos"
3. Clicar em "Inscrever Atleta" no evento
4. Verificar comportamento do sistema

**Resultados Esperados:**
- ✅ Sistema detecta que cupom é inválido
- ✅ Continua sem cupom (não falha a inscrição)
- ✅ Inscrição criada sem desconto
- ✅ Logs mostram aviso: "Cupom encontrado mas inválido"

**Validações no Backend:**
- Verificar logs do backend para mensagem de aviso
- Verificar que inscrição foi criada mesmo com cupom inválido

---

### Cenário 6: Verificação de Comissão Após Pagamento

**Pré-requisitos:**
- Inscrição criada com cupom (Cenário 1 ou 2)
- Pagamento pendente

**Passos:**
1. Confirmar pagamento manualmente (admin) ou aguardar confirmação automática
2. Verificar se comissão foi gerada
3. Verificar se percentual usado é o correto (da comissão encontrada pelo cupom)

**Resultados Esperados:**
- ✅ Comissão é criada quando pagamento é confirmado
- ✅ Percentual usado é o da comissão encontrada pelo cupom (não fallback)
- ✅ Valor da comissão está correto: `registration_amount * (commission_percentage / 100)`
- ✅ Status da comissão é 'pending'

**Validações no Backend:**
```sql
-- Verificar comissão criada
SELECT 
  lc.id,
  lc.commission_amount,
  lc.commission_percentage,
  lc.registration_amount,
  lc.status,
  r.coupon_code,
  lec.id as commission_config_id,
  lec.commission_percentage as config_percentage
FROM leader_commissions lc
JOIN registrations r ON lc.registration_id = r.id
JOIN leader_event_commissions lec ON lc.event_id = lec.event_id AND lc.leader_id = lec.leader_id
WHERE lc.registration_id = '<registration_id>';

-- Verificar que commission_percentage corresponde ao config_percentage
-- Verificar que commission_amount = registration_amount * (commission_percentage / 100)
```

---

## Checklist de Validação

### Frontend
- [ ] Cupom aparece no dialog quando evento é selecionado
- [ ] Desconto é exibido corretamente (percentual ou fixo)
- [ ] Preview do total mostra cálculo completo
- [ ] Total final está correto (subtotal - desconto)
- [ ] Inscrição é criada com sucesso
- [ ] Mensagens de erro são exibidas quando necessário

### Backend - Inscrição
- [ ] Cupom é buscado usando `getCouponByEventCommission`
- [ ] Cupom é validado antes de usar
- [ ] Desconto é aplicado ao `total_amount` (percentual ou fixo)
- [ ] `coupon_code` é adicionado ao `registrationData`
- [ ] Inscrição é criada com `coupon_code` preenchido
- [ ] Logs mostram informações detalhadas

### Backend - Comissão
- [ ] Comissão é encontrada pelo cupom quando pagamento é confirmado
- [ ] Percentual usado é o da comissão encontrada (não fallback)
- [ ] Se cupom não encontrar comissão, usa fallback
- [ ] Valor da comissão está correto
- [ ] Logs mostram `found_by_coupon: true/false`

### Integração
- [ ] Fluxo completo funciona: Inscrição → Pagamento → Comissão
- [ ] Cupom usado na inscrição é o mesmo que identifica a comissão
- [ ] Comissão gerada usa configuração correta do organizador

---

## Logs para Monitorar

### Backend - Inscrição
```
✅ [createRegistrationByLeader] Cupom encontrado e válido: {code}
💰 [createRegistrationByLeader] Desconto de X% aplicado: R$ Y
💰 [createRegistrationByLeader] Valor total após desconto: R$ X
```

### Backend - Comissão
```
✅ [createCommission] Comissão encontrada pelo cupom {code}: {id} (tipo: {type}, percentual: {percentage}%)
💰 [createCommission] Calculando comissão usando configuração encontrada: {
  commission_id: "...",
  commission_percentage: X,
  registration_amount: Y,
  commission_amount: Z,
  found_by_coupon: true/false,
  coupon_code: "..."
}
```

---

## Problemas Conhecidos e Soluções

### Problema 1: Cupom não aparece no frontend
**Causa:** `eventCommissions` não contém o campo `coupon`
**Solução:** Verificar se backend está retornando `coupon` em `getMyEventCommissions`

### Problema 2: Desconto não é aplicado
**Causa:** Cupom não é encontrado ou é inválido
**Solução:** Verificar logs do backend para ver se cupom foi encontrado e validado

### Problema 3: Comissão usa percentual errado
**Causa:** Bug corrigido no Passo 4 - verificar se código está atualizado
**Solução:** Garantir que `createCommission` usa `commissionConfig.commission_percentage` diretamente

### Problema 4: Total fica negativo
**Causa:** Desconto fixo maior que subtotal
**Solução:** Já implementado `Math.max(0, finalAmount)` - verificar se está funcionando

---

## Próximos Passos Após Testes

1. **Se todos os testes passarem:**
   - Documentar resultados
   - Fazer deploy
   - Monitorar logs em produção

2. **Se algum teste falhar:**
   - Documentar o problema
   - Corrigir o bug
   - Re-testar o cenário específico

3. **Melhorias futuras (opcional):**
   - Adicionar testes automatizados
   - Melhorar tratamento de erros
   - Adicionar mais validações

---

## Conclusão

Após executar todos os cenários de teste, o sistema deve:
- ✅ Usar o cupom correto automaticamente
- ✅ Aplicar desconto corretamente (percentual ou fixo)
- ✅ Calcular comissão usando configuração correta do organizador
- ✅ Funcionar mesmo quando cupom não é encontrado (fallback)
- ✅ Gerar logs detalhados para debug

**Status:** Pronto para testes ✅



