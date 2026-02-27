# Plano B – Kit obrigatório, variação obrigatória e opção "Escolher kit" para inscrições sem kit

**Objetivo:** Garantir que **novas** inscrições e **edições** não permitam "sem kit" quando o evento tiver kits, e que kit com variação exija seleção. Corrigir bug do cartão (product_selections no CreditCardForm). Inscrições **antigas** sem kit continuam existindo; oferecer **opção de escolher kit** (preferência a definir com produto).

**Pré-requisito:** Plano A implantado e testado (cupom com opções do convite; corredor pode completar inscrição do convite).

**Contexto:** Ver `docs/CLARIFICACOES_E_FASES_IMPLANTACAO_KIT_CONVITE.md`. Ordem: Plano A → Plano B → Plano C.

**Princípio:** Sistema em produção com inscrições antigas e novas. Inscrições antigas sem kit não são alteradas em massa; ganham caminho na UI para "Escolher kit".

---

## Pré-requisitos

- Plano A em produção (migration leader_event_commissions com invite_*_ids; endpoints do corredor; EventCommissionDialog com opções; fluxo "completar inscrição do convite").
- **Concessão de bônus:** Se no Plano A não foi implementado "preencher kit quando 1 opção", implementar **no início do Plano B** (em leaderBonusService) antes de ativar a validação "kit obrigatório" em createRegistration, para não quebrar concessão de bônus.

---

## 1. Migrations

- Nenhuma (usa estrutura já existente).

---

## 2. Backend

### 2.1 createRegistration – kit obrigatório e variação obrigatória

| # | Tarefa | Detalhe |
|---|--------|---------|
| B1 | Evento tem kits → exige kit_id | Em `registrationsService.createRegistration`: antes do INSERT, verificar se o evento tem ≥ 1 kit (query em event_kits). Se sim e `data.kit_id` estiver ausente/null, lançar erro ("Selecione um kit"). **Exceção:** evento com 0 kits não exige kit_id. |
| B2 | Kit variável → exige product_selections | Quando `data.kit_id` preenchido: buscar produtos do kit com type = 'variable' e variant_attributes não nulo. Se existir ao menos um, exigir que `data.product_selections` exista e cubra todos; senão lançar erro (ex.: "Selecione a variação do kit antes de finalizar."). Produto com variant_attributes NULL = produto simples (não exigir seleção). |
| B3 | Função auxiliar | Extrair validação reutilizável (ex.: `validateKitRequired`, `requireProductSelectionsForVariableKit`) para usar também no update. |

### 2.2 updateRegistration – não aceitar kit null quando evento tem kits

| # | Tarefa | Detalhe |
|---|--------|---------|
| B4 | kit_id null + evento com kits → 400 | Em `registrationsController.updateRegistrationController`: quando `updatePayload.kit_id === null` e o evento da inscrição tiver ≥ 1 kit, retornar 400 com mensagem clara ("Selecione um kit"). |
| B5 | Kit variável na edição | Quando o kit (novo ou atual) tiver produtos variáveis, exigir que a inscrição tenha seleção completa (product_selections no body ou já em registration_product_selections); caso contrário, 400. |

### 2.3 Garantir que fluxos que chamam createRegistration enviem kit quando aplicável

| # | Tarefa | Detalhe |
|---|--------|---------|
| B6 | leaderBonusService | Já deve estar preenchendo kit_id (e category_id, modality_id) quando comissão tiver 1 opção (Plano A ou início do B). Evento com 0 kits: não enviar kit_id. |
| B7 | createRegistrationByOrganizer / ByLeader | Esses controllers chamam createRegistration; após B1/B2, passarão a receber 400 se evento tiver kits e não enviarem kit_id. Frontend (este plano) passará a enviar kit obrigatório. |

---

## 3. Frontend

### 3.1 Correção do cartão (product_selections)

| # | Tarefa | Detalhe |
|---|--------|---------|
| F1 | CreditCardForm onSubmit | Em `RegistrationFlow.tsx`, no callback que chama `createRegistration` ao submeter o formulário de cartão: montar `product_selections` igual ao handleSubmit (usar selectedProducts e variantSelections). Incluir em registrationData antes de createRegistration. |

### 3.2 Remover "Sem kit" quando evento tem kits

| # | Tarefa | Detalhe |
|---|--------|---------|
| F2 | AdminRegistrations | No select de kit na edição: quando evento tiver ≥ 1 kit, remover ou ocultar opção "Sem kit". |
| F3 | OrganizerRegistrations | No formulário "Inscrever atleta": quando evento tiver kits, tornar kit obrigatório (label "Kit *", validação). Na edição: não permitir salvar com kit vazio quando evento tiver kits. |
| F4 | LeaderDashboard (envio convite) | Quando evento tiver kits, exigir kit (e variação se houver) antes de enviar; não exibir "Sem kit". (Se no Plano A o líder já enviava opções, reforçar que sempre envie category_id, modality_id, kit_id quando inscrição estiver incompleta.) |
| F5 | LeaderDashboard (inscrever atleta) | Quando evento tiver kits, exigir seleção de kit (e variação se aplicável) antes de enviar. |
| F6 | RegistrationFlow | Garantir que não exista caminho que permita enviar inscrição sem kit quando evento tiver ≥ 1 kit (step de kit já exige; revisar exceções). |

### 3.3 Inscrições "sem kit" existentes – opção de escolher kit

| # | Tarefa | Detalhe |
|---|--------|---------|
| F7 | Identificar inscrições sem kit | Em Minhas Inscrições (ou fluxo "completar inscrição"), para inscrições com `kit_id` null e evento com ≥ 1 kit, exibir **opção "Escolher kit"** (ou CTA equivalente). |
| F8 | Lista de kits | Ao clicar, exibir kits disponíveis do evento (respeitando categoria da inscrição se aplicável). Preferência: [a definir com produto – ex. primeiro kit, kit padrão]. |
| F9 | Atualizar e pagar diferença | Ao escolher kit: chamar updateRegistration (ou endpoint dedicado) com kit_id (e product_selections se kit variável). Se houver valor a pagar, disparar fluxo "pagar diferença". |

---

## 4. Validações

- createRegistration: evento com kits e sem kit_id → erro; kit variável sem product_selections completo → erro.
- updateRegistration: kit_id null em evento com kits → 400; kit variável sem seleção completa → 400.
- Frontend: em todos os fluxos acima, não permitir envio sem kit (e sem variação quando kit variável) quando evento tiver kits.

---

## 5. Testes obrigatórios (porta de saída do Plano B)

- [ ] Inscrição nova por corredor (PIX e cartão) em evento com kits: sem kit_id → 400; com kit variável sem product_selections → 400. Com cartão, product_selections enviado e salvo.
- [ ] Inscrição nova por organizador/líder sem kit (evento com kits): 400.
- [ ] Edição de inscrição com "Sem kit" (evento com kits): opção não aparece ou 400 ao enviar kit_id null.
- [ ] Inscrição **antiga** sem kit: continua visível; aparece opção "Escolher kit"; ao escolher, atualiza e pode gerar cobrança de diferença.
- [ ] Inscrições antigas com kit (com e sem variação) continuam editáveis e exibidas sem erro.

---

## 6. Impacto em código existente

- **createRegistration:** Passa a rejeitar payloads que antes eram aceitos (sem kit quando evento tem kits; kit variável sem product_selections). Clientes que não enviam kit/product_selections passarão a receber 400 até atualizarem (frontend deste plano já envia).
- **updateRegistration:** Passa a rejeitar kit_id null quando evento tem kits.
- **Inscrições antigas sem kit:** Continuam no banco; ganham caminho na UI para escolher kit (sem migração em massa).

---

## 7. Checklist "sistema em produção" (antes de fechar o Plano B)

- [ ] Inscrições antigas (com e sem kit) continuam listando e abrindo sem erro.
- [ ] Edição de inscrições antigas **sem alterar kit** continua funcionando.
- [ ] Inscrições antigas sem kit exibem opção "Escolher kit" e conseguem atualizar.
- [ ] Comissões antigas continuam sendo lidas e usadas.
- [ ] Mensagens de erro (400) são claras e não quebram o frontend.
