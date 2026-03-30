# Plano: Organizar pagamento para organizador vs admin (taxas da plataforma)

**Objetivo:** Separar claramente o que é receita do organizador (só inscrições e diferença) e o que é taxa da plataforma (admin). A taxa inicial não deve ser considerada no “valor já pago” para cálculo da diferença. A taxa de atualização deve constar nos relatórios como taxa da plataforma.

---

## 1. Situação atual (investigação)

### 1.1 Modelo de dados
- **registrations.total_amount:** valor total pago pelo corredor (na criação já inclui categoria + kit + taxa da plataforma; na edição pode incluir também taxa de atualização).
- **asaas_payments:** uma linha por cobrança (valor `value`, status). Não separa “valor organizador” vs “taxa”.
- **system_settings:** `platform_fee`, `platform_fee_type`, `registration_edit_fee`.
- **registration_amount_adjustments:** registra old_total, new_total em edições (refund_pending); não guarda valor da taxa de atualização aplicada.
- Não existe hoje em **registrations** coluna para taxa da plataforma na inscrição inicial nem para taxa de atualização aplicada.

### 1.2 Cálculos atuais
- **getTotalPaidForRegistration:** soma `asaas_payments.value` com status CONFIRMED/RECEIVED/etc. (valor bruto pago).
- **syncRegistrationPaymentStatus:** considera pago quando `totalPaid >= total_amount` (tudo incluindo taxas).
- **Diferença a cobrar (edição):** `differenceToCharge = newTotal - amountPaid` (ambos com taxas).
- **Preview da edição:** usa o mesmo `amountPaid` (soma bruta) e `newTotal` (com taxa de atualização).

### 1.3 Relatórios
- **Organizador (organizerService):** receita = `calculateValueWithoutFee(total_amount, platformFee, platformFeeType)` por inscrição paga. Usa a taxa atual da plataforma; não distingue taxa inicial da taxa de atualização.
- **Eventos (eventsService):** `revenue` = soma do valor sem taxa (função SQL `calculate_value_without_platform_fee(total_amount, get_platform_fee(), get_platform_fee_type())`); `platform_fee_revenue` = soma da parte que é taxa (total - valor sem taxa). Não considera taxa de atualização.
- **Admin (adminService):** dashboard usa `SUM(total_amount)` como receita total; comissões a 5% em cima disso. Não há visão consolidada “só taxas da plataforma (inscrição + atualização)”.

### 1.4 Onde o total é definido
- **Criação da inscrição:** controller chama `createRegistration` com `total_amount` vindo do fluxo (RegistrationFlow/API). Esse total já vem com taxa da plataforma (calculateRegistrationTotal no frontend ou em outro ponto).
- **Edição:** `updateRegistrationController` e `previewRegistrationEditController` usam `calculateRegistrationTotal` + `registration_edit_fee`; o novo total é `calculation.total + appliedUpdateFee`.

---

## 2. Regras desejadas (resumo)

| Conceito | Regra |
|----------|--------|
| Valor já pago (para diferença) | Não deve incluir a taxa inicial da inscrição. Ou seja: “valor já pago para efeito organizador” = total pago - taxa inicial. |
| Taxa de atualização | Deve entrar nos relatórios como taxa da plataforma (admin). |
| Organizador | Recebe apenas: valor das inscrições (sem taxa inicial) + valor da diferença (sem taxa de atualização). Na prática: valor “líquido” por inscrição. |
| Admin | Visualiza valor total das taxas: taxa de inscrição + taxa de atualização (quando houver). |

---

## 3. Plano de implementação

Cada etapa é identificada por **OK Etapa X**. Ao concluir uma etapa, considere-a “OK Etapa X” concluída e siga para a próxima.

---

### OK Etapa 1: Persistir taxas por inscrição (backend + migration)

**Objetivo:** Saber quanto de cada inscrição é taxa da plataforma (inicial) e quanto é taxa de atualização.

- **Migration:** Adicionar em `registrations`:
  - `platform_fee_amount` DECIMAL(10,2) DEFAULT 0 — taxa da plataforma aplicada na inscrição inicial (valor em R$).
  - `registration_edit_fee_amount` DECIMAL(10,2) DEFAULT 0 — taxa de atualização aplicada na edição (valor em R$), quando houver.
- **createRegistration (controller/service):** Ao calcular ou receber o total da inscrição, calcular também o `platform_fee_amount` (ex.: usando `calculateRegistrationTotal` que já retorna `platformFee`, ou recalculando com `calculateValueWithFee`/valor sem taxa). Persistir em `registrations.platform_fee_amount`.
- **updateRegistration (controller):** Quando aplicar `registration_edit_fee`, persistir em `registrations.registration_edit_fee_amount` o valor aplicado (ex.: `appliedUpdateFee`). Em edições que não mudem valor, manter 0 ou o valor anterior.

**Resultado:** Cada inscrição tem, de forma explícita, quanto foi taxa inicial e quanto foi taxa de atualização.

---

### OK Etapa 2: “Valor já pago” sem taxa inicial (diferença a cobrar)

**Objetivo:** Na subtração do valor já pago, não incluir a taxa inicial.

- **Conceito:** “Valor já pago para efeito organizador” = total pago (asaas) - `platform_fee_amount` da inscrição (só o da primeira cobrança; em inscrições com uma única cobrança, é o valor guardado em `registrations.platform_fee_amount`).
- **getAmountPaidForOrganizer(registrationId):** Nova função (ou parâmetro em existente) que retorna: `getTotalPaidForRegistration(id) - registration.platform_fee_amount` (arredondado, com cuidado para não ficar negativo).
- **Uso na edição:**
  - **previewRegistrationEditController:** Em vez de usar só `amountPaid` (total pago), calcular `amountPaidForOrganizer = amountPaid - registration.platform_fee_amount` e usar na diferença: `differenceToPay = newTotal - amountPaidForOrganizer` (e manter `amount_paid` bruto na resposta se necessário para exibição). Ajustar `difference_to_refund` de forma coerente (ex.: `amountPaidForOrganizer - newTotal` quando positivo).
  - **updateRegistrationController (cobrança da diferença):** Usar o mesmo critério: `differenceToCharge = newTotal - amountPaidForOrganizer` (em vez de `newTotal - amountPaid`). Assim a segunda cobrança não “desconta” a taxa inicial.
- **syncRegistrationPaymentStatus:** Manter a regra atual (total pago ≥ total_amount) para marcar como pago; não alterar aqui. O “valor já pago” sem taxa é só para cálculo de diferença e relatórios.

**Resultado:** Diferença a cobrar e valor da segunda cobrança deixam de considerar a taxa inicial como “já paga” para o organizador.

---

### OK Etapa 3: Organizador – receita só valor líquido (inscrição + diferença, sem taxas)

**Objetivo:** Organizador ver apenas valor das inscrições e da diferença, sem nenhuma taxa da plataforma.

- **Definição de “valor líquido” por inscrição:**  
  `valor_liquido = total_amount - platform_fee_amount - registration_edit_fee_amount`
- **organizerService (getOrganizerFinancialSummary, getOrganizerEventRevenues):** Em vez de `calculateValueWithoutFee(total_amount, ...)`, usar para cada inscrição paga:  
  `valor_liquido = total_amount - (platform_fee_amount || 0) - (registration_edit_fee_amount || 0)`.  
  Somar esses valores para totalRevenue, por evento, por método de pagamento, etc.
- **eventsService (getEvents com revenue / platform_fee_revenue):** Ajustar a view/query do evento:
  - **revenue (organizador):** Soma de `(total_amount - COALESCE(platform_fee_amount,0) - COALESCE(registration_edit_fee_amount,0))` para inscrições com `payment_status = 'paid'`.
  - Manter ou criar indicador de “taxa plataforma” do evento apenas para admin, se necessário (ver Etapa 4).

**Resultado:** Organizador recebe em relatórios e dashboards apenas o valor que é “dele” (inscrições + diferença, sem taxa inicial nem taxa de atualização).

---

### OK Etapa 4: Admin – relatório de taxas (inscrição + atualização)

**Objetivo:** Admin visualizar o valor total das taxas da plataforma: taxa de inscrição + taxa de atualização.

- **Consultas / relatórios admin:**
  - **Taxa de inscrição (total):** Soma de `registrations.platform_fee_amount` para `payment_status = 'paid'`.
  - **Taxa de atualização (total):** Soma de `registrations.registration_edit_fee_amount` para `payment_status = 'paid'` (ou onde fizer sentido).
  - **Total taxas plataforma:** soma das duas.
- **adminService (dashboard):** Incluir campos como:
  - `platform_fee_revenue` (taxa de inscrição)
  - `registration_edit_fee_revenue` (taxa de atualização)
  - `total_platform_fees` = soma dos dois
  E, se necessário, manter “receita bruta” (total_amount) separada para outros indicadores.
- **Frontend admin (Configurações > Taxas ou Dashboard):** Exibir “Total taxas da plataforma” com quebra: “Taxa de inscrição” e “Taxa de atualização” (quando houver dados).

**Resultado:** Admin enxerga de forma clara o que é taxa de inscrição e o que é taxa de atualização, e o total de taxas da plataforma.

---

### OK Etapa 5: Exibição “valor já pago” no painel do corredor (opcional)

**Objetivo:** Alinhar o que o corredor vê com o conceito “valor já pago” (para não confundir com valor líquido do organizador).

- **Decisão de produto:** O “valor já pago” no resumo (Pagar diferença) pode continuar sendo o total pago (valor bruto), pois é o que o corredor efetivamente pagou. A mudança “não incluir taxa na subtração” é interna (cálculo da diferença). Se desejado, pode-se exibir também um texto do tipo “Valor já pago (incl. taxas)” para deixar claro. Nenhuma alteração obrigatória aqui.

---

### OK Etapa 6: Inscrições já existentes (dados antigos) — separar valor pago e taxas sem perder informação

**Objetivo:** A plataforma já está em produção. Inscrições criadas antes da migration não terão `platform_fee_amount` nem `registration_edit_fee_amount` preenchidos. Precisamos separar “valor pago (organizador)” e “valor das taxas” para eventos antigos **sem perder nenhuma informação** que já existe (totais, pagamentos, histórico).

---

#### O que não se perde

- **Nenhum dado é apagado nem alterado em valor.**  
  - `registrations.total_amount` continua igual (valor total que o corredor pagou).  
  - `asaas_payments` continua com os valores reais de cada cobrança.  
  - `registration_amount_adjustments` mantém old_total/new_total das edições.  
- Só **adicionamos** duas colunas novas. Para linhas antigas elas começam NULL/0; o sistema deve funcionar com ou sem backfill.

---

#### Estratégia em dois pilares

**1) Fallback no código (obrigatório)**  
Quando `platform_fee_amount` ou `registration_edit_fee_amount` forem NULL ou 0:

- **Organizador (receita):** usar o mesmo cálculo de hoje:  
  `valor_liquido = calculateValueWithoutFee(total_amount, platformFee, platformFeeType)`  
  (usa a taxa **atual** da plataforma; já é o comportamento atual).
- **Diferença a cobrar (edição):** usar `amountPaidForOrganizer = amountPaid` (total pago), ou seja, manter o comportamento atual para inscrições antigas.
- **Admin (totais de taxas):** para linhas sem `platform_fee_amount` preenchido, a “taxa de inscrição” dessas linhas pode ser tratada como “estimada” ou somada via função (ex.: taxa = total_amount - calculate_value_without_platform_fee(...)) só para relatório, sem gravar.

Assim, **nada quebra** e **não perdemos informação**: totais e pagamentos seguem sendo a fonte da verdade.

**2) Backfill para preencher `platform_fee_amount` (recomendado)**  
Para **eventos antigos** terem a mesma separação “valor pago vs taxas” que as inscrições novas:

- **O que temos hoje:** Para cada inscrição antiga temos `total_amount` e a configuração **atual** de taxa (`system_settings.platform_fee`, `platform_fee_type`). Não guardamos qual era a taxa no dia em que a inscrição foi criada.
- **O que fazemos:** Estimar a taxa da inscrição com a **mesma regra que já usamos hoje** para receita do organizador:  
  `platform_fee_amount = total_amount - calculate_value_without_platform_fee(total_amount, platform_fee, platform_fee_type)`  
  usando os valores **atuais** de `platform_fee` e `platform_fee_type`.
- **Por que não perdemos informação:**  
  - Esse é exatamente o critério que hoje já é usado para “valor sem taxa” em relatórios e views. Ao gravar `platform_fee_amount`, apenas **persistimos** esse valor por inscrição, permitindo relatórios e logs consistentes (inscrição vs taxas).  
  - Se no futuro a taxa mudar de novo, inscrições **novas** passarão a guardar a taxa no momento da criação; as antigas continuam com o valor estimado no dia do backfill (coerente com o que a plataforma usa hoje para elas).
- **Regras do script de backfill:**
  - Atualizar apenas registrations onde `platform_fee_amount` IS NULL ou 0 (e, se quiser restringir, `payment_status = 'paid'`).
  - Usar a função SQL existente:  
    `platform_fee_amount = total_amount - calculate_value_without_platform_fee(total_amount, get_platform_fee(), get_platform_fee_type())`.  
  - Arredondar para 2 casas e garantir que `platform_fee_amount >= 0` e que `platform_fee_amount <= total_amount`.
  - Inscrições com `total_amount = 0` (gratuitas): manter `platform_fee_amount = 0`.

**Taxa de atualização em eventos antigos (`registration_edit_fee_amount`):**

- Na base atual, **não** temos guardado quanto de cada edição antiga foi “taxa de atualização” vs “diferença de categoria/kit”. A tabela `registration_amount_adjustments` tem só `old_total` e `new_total`.
- **Recomendação:** No backfill, **não** preencher `registration_edit_fee_amount` para inscrições antigas (deixar 0). Assim:
  - Não inventamos um valor que não temos como validar.
  - O organizador continua recebendo, para essas inscrições, o valor líquido calculado como hoje (total - taxa de inscrição estimada); a “taxa de atualização” em relatórios de admin será apenas para edições **novas** (a partir da Etapa 1), onde passamos a persistir o valor.

Se no futuro houver necessidade de estimar também a taxa de atualização em ajustes antigos (ex.: quando `new_total - old_total` for exatamente igual ao `registration_edit_fee` configurado), pode-se adicionar uma regra heurística em um segundo backfill; por ora, manter 0 preserva a integridade.

---

#### Marcar linhas backfilladas (opcional)

- Se quiser deixar explícito no sistema quais inscrições tiveram taxa **estimada** (eventos antigos) vs **real** (inscrições novas após a migration), pode-se adicionar uma coluna, por exemplo:  
  `platform_fee_backfilled BOOLEAN DEFAULT FALSE`.  
  O script de backfill seta `TRUE` nas linhas que atualizar; no create/update normais, mantém FALSE.
- Relatórios ou a aba de log (Etapa 7) podem exibir um indicador “taxa estimada (eventos antigos)” quando `platform_fee_backfilled = TRUE`, sem alterar valores nem perder informação.

---

#### Ordem recomendada (dentro da Etapa 6)

1. Rodar a **migration** que adiciona `platform_fee_amount` e `registration_edit_fee_amount` (e opcionalmente `platform_fee_backfilled`).  
2. Garantir o **fallback** em todo código que lê essas colunas (organizador, diferença a cobrar, admin).  
3. **Implementar e rodar o script de backfill** (ver abaixo) uma vez, em horário de baixo uso.  
4. A partir daí, relatórios e log de pagamentos (Etapa 7) passam a separar valor pago e taxas também para eventos antigos.

---

#### Implementação do script para atualizar inscrições antigas

**Objetivo:** Entregar um script versionado e executável que preencha `platform_fee_amount` (e opcionalmente `platform_fee_backfilled`) em todas as inscrições antigas, para que a separação “valor pago vs taxas” valha também para o histórico.

**Onde o script pode ser iniciado:**

- **Configurações > Avançado (recomendado para uso em produção):** Na mesma tela em que já existem os scripts “Corrigir inscrições do organizador” e “Desabilitar notificações Asaas”, adicionar um novo bloco: **“Atualizar taxa da plataforma em inscrições antigas”**, com botão para executar o backfill. O admin vê logs em tempo real e resumo (quantas linhas atualizadas), igual aos outros scripts. Assim o script pode ser rodado sob demanda, sem deploy nem acesso ao servidor.
- **Opção alternativa:** Migration SQL (roda no deploy) ou script Node/TS via linha de comando (`npm run backfill:platform-fee`), para quem preferir automação ou ambiente sem UI admin.

**Implementação via Configurações > Avançado:**

| Camada | Ação |
|--------|------|
| **Backend** | Novo endpoint (ex.: `POST /admin/scripts/backfill-platform-fee-amount`) que executa a mesma lógica do backfill (UPDATE em `registrations` usando `calculate_value_without_platform_fee` / `get_platform_fee` / `get_platform_fee_type`). Retornar resumo (ex.: `{ updated, total, errors }`) e, se possível, stream de logs (SSE ou polling) para exibir na UI. |
| **Frontend** | Em `AdvancedSettings.tsx` (aba Avançado), adicionar um Card com título “Atualizar taxa da plataforma em inscrições antigas”, descrição breve, botão “Executar” e área de logs/resumo, no mesmo padrão dos scripts já existentes (fix-organizer-registrations, disable-asaas-notifications). |
| **API (frontend)** | Em `src/lib/api/systemSettings.ts` (ou equivalente), criar função que chama o novo endpoint e repassa callbacks de log e resultado, no mesmo padrão de `executeFixOrganizerRegistrationsScript` e `executeDisableAsaasNotificationsScript`. |

**Outras opções (complementares ou alternativas):**

| Opção | Uso |
|-------|-----|
| **Migration SQL (087)** | Roda uma vez no deploy; idempotente. Útil se quiser backfill automático no primeiro deploy após a migration 086. |
| **Script Node/TS (CLI)** | `backend/scripts/backfill-platform-fee-amount.ts` com `npm run backfill:platform-fee` para ambientes sem UI ou automação. |

Recomendação: implementar o **disparo em Configurações > Avançado** como forma principal de rodar o script em produção; migration 087 ou script CLI podem coexistir para deploy inicial ou homologação.

---

**Escopo do script (obrigatório):**

1. **Alvo:** Atualizar apenas `registrations` onde:
   - `(platform_fee_amount IS NULL OR platform_fee_amount = 0)`  
   - e `total_amount > 0` (inscrições gratuitas permanecem com taxa 0).

2. **Cálculo:**  
   `platform_fee_amount = total_amount - calculate_value_without_platform_fee(total_amount, get_platform_fee(), get_platform_fee_type())`  
   Garantir arredondamento em 2 casas e que `0 <= platform_fee_amount <= total_amount`.

3. **Não alterar:** `registration_edit_fee_amount` em dados antigos (manter 0/NULL).

4. **Opcional:** Se existir coluna `platform_fee_backfilled`, setar `platform_fee_backfilled = TRUE` nas linhas atualizadas.

5. **Idempotência:** O script pode ser rodado mais de uma vez sem duplicar efeito (só atualiza onde taxa ainda está vazia).

---

**Exemplo de migration SQL (Opção A):**

```sql
-- 087_backfill_platform_fee_amount.sql
-- Preenche platform_fee_amount para inscrições antigas (usa taxa atual da plataforma).

UPDATE registrations r
SET
  platform_fee_amount = ROUND(
    r.total_amount - calculate_value_without_platform_fee(
      r.total_amount,
      get_platform_fee(),
      get_platform_fee_type()
    ),
    2
  ),
  platform_fee_backfilled = COALESCE(r.platform_fee_backfilled, TRUE)
WHERE (r.platform_fee_amount IS NULL OR r.platform_fee_amount = 0)
  AND r.total_amount > 0;
```

(Se a coluna `platform_fee_backfilled` não existir, remover a linha que a seta.)

---

**Exemplo de script Node/TS (Opção B) — esqueleto:**

- Conectar ao DB (mesmo pool/config do backend).
- Buscar `platform_fee` e `platform_fee_type` de `system_settings`.
- Query: selecionar ids de `registrations` onde `(platform_fee_amount IS NULL OR platform_fee_amount = 0)` e `total_amount > 0`.
- Para cada registro (ou em batch): calcular `platform_fee_amount` com `calculateValueWithoutFee` (utils) e fazer `UPDATE registrations SET platform_fee_amount = $1, platform_fee_backfilled = TRUE WHERE id = $2`.
- Logar quantidade de linhas atualizadas e encerrar.

---

**Checklist de implantação (OK Etapa 6):**

- [ ] Migration 086 (colunas) já rodou.
- [ ] Fallback implementado em organizerService, eventsService, adminService e no cálculo da diferença a cobrar.
- [ ] Backend: endpoint `POST /admin/scripts/backfill-platform-fee-amount` implementado (controller + rota em `adminRoutes.ts`).
- [ ] Frontend: em **Configurações > Avançado** (`AdvancedSettings.tsx`), novo bloco “Atualizar taxa da plataforma em inscrições antigas” com botão Executar e exibição de logs/resumo.
- [ ] API frontend: função que chama o endpoint de backfill (em `systemSettings.ts` ou equivalente), no padrão dos outros scripts da aba Avançado.
- [ ] (Opcional) Migration 087 ou script CLI para rodar backfill fora da UI.
- [ ] Em homologação: executar o script pela aba Avançado e conferir totais (soma de `platform_fee_amount` vs expectativa).
- [ ] Em produção: rodar em janela de baixo uso (pela aba Avançado); opcionalmente fazer backup da tabela `registrations` antes.

---

### OK Etapa 7: Aba de log de atualizações e pagamentos (admin)

**Objetivo:** Oferecer ao admin uma aba/tela de log que centralize atualizações e pagamentos, separando **pagamento de inscrição** (valor que vai para o organizador / valor da inscrição) e **pagamento de taxas** (taxa da plataforma: inscrição + atualização).

- **Escopo da aba:**
  - **Log de pagamentos:** Listagem cronológica (ou filtrada por período, evento, inscrição) de todos os pagamentos confirmados, com indicação do tipo:
    - **Pagamento de inscrição:** valor líquido da inscrição (total pago − taxas da plataforma), ou quebra explícita por cobrança: “inscrição inicial”, “diferença (edição)”.
    - **Pagamento de taxas:** valor que ficou com a plataforma — taxa de inscrição (`platform_fee_amount`) e, quando houver, taxa de atualização (`registration_edit_fee_amount`).
  - **Log de atualizações:** Eventos de edição de inscrição (já existentes em `registration_amount_adjustments` ou equivalentes): data, inscrição, evento, old_total, new_total, valor da taxa de atualização aplicada, status (ex.: pago/pendente).

- **Separação na interface:**
  - Filtros ou abas/seções: “Pagamento de inscrição” vs “Pagamento de taxas” (e opcionalmente “Atualizações” ou tudo em uma lista com coluna “Tipo”).
  - Colunas sugeridas (ex.): data, inscrição (id/código), evento, valor, tipo (inscrição / taxa inscrição / taxa atualização), status, id pagamento Asaas.

- **Backend:**
  - Endpoint(s) admin para listar:
    - Pagamentos: a partir de `asaas_payments` + `registrations` (e novas colunas `platform_fee_amount`, `registration_edit_fee_amount`), classificar cada pagamento em “inscrição” vs “taxa” (e quando houver edição, quebrar taxa de inscrição vs taxa de atualização por inscrição).
  - Opção: view ou query que una `asaas_payments` com `registrations` e retorne linhas classificadas (ex.: uma linha por pagamento com `payment_type` = 'registration' | 'platform_fee_initial' | 'platform_fee_edit'), ou duas “listas” (inscrição vs taxas) no mesmo response.
  - Log de atualizações: listar `registration_amount_adjustments` (e dados da inscrição/evento), incluindo `registration_edit_fee_amount` quando existir.

- **Frontend (admin):**
  - Nova aba ou página: “Log de atualizações e pagamentos” (ex.: em Configurações, Financeiro ou Dashboard admin).
  - Tabela(s) ou seções com filtros por tipo (pagamento de inscrição / pagamento de taxas), período, evento.
  - Exportação (CSV/Excel) opcional para relatório.

**Resultado:** Admin consegue auditar e acompanhar separadamente o que foi pago a título de inscrição (organizador) e o que foi pago a título de taxas da plataforma (inscrição + atualização), além do histórico de atualizações de valor.

---

## 4. Ordem sugerida e dependências

| Ordem | Etapa | Dependência |
|-------|--------|-------------|
| 1 | OK Etapa 1 – Migration + persistir platform_fee_amount e registration_edit_fee_amount | Nenhuma |
| 2 | OK Etapa 2 – Valor já pago sem taxa inicial (preview + update + diferença) | OK Etapa 1 |
| 3 | OK Etapa 3 – Organizador: receita só valor líquido | OK Etapa 1 |
| 4 | OK Etapa 4 – Admin: relatório taxas inscrição + atualização | OK Etapa 1 |
| 5 | OK Etapa 5 – Ajustes de UX “valor já pago” (se houver) | OK Etapa 2 |
| 6a | OK Etapa 6 – Fallback no código (leitura das novas colunas) | OK Etapa 1–4 |
| 6b | OK Etapa 6 – Script de backfill (endpoint + Configurações > Avançado + opcional migration/CLI) | OK Etapa 1, 6a |
| 7 | OK Etapa 7 – Aba de log de atualizações e pagamentos (inscrição vs taxas) | OK Etapa 1, 4 |

---

## 5. Resumo de arquivos / pontos a tocar

- **Migrations:**  
  - `086_add_platform_fee_amount_to_registrations.sql`: colunas `platform_fee_amount`, `registration_edit_fee_amount` e opcionalmente `platform_fee_backfilled` em `registrations`.  
  - `087_backfill_platform_fee_amount.sql`: (opcional) backfill em SQL; a forma principal de execução é via **Configurações > Avançado**.
- **Backend:**
  - **Script de backfill acionável pela UI:** novo endpoint em `adminRoutes.ts` (ex.: `POST /admin/scripts/backfill-platform-fee-amount`) e controller em `adminScriptsController.ts` (ou equivalente) que executa o UPDATE em `registrations` e retorna resumo/logs.
  - `registrationsController`: createRegistration (calcular e salvar platform_fee_amount); updateRegistration e previewRegistrationEdit (salvar registration_edit_fee_amount e usar amountPaidForOrganizer na diferença).
  - `asaasService` ou `registrationsService`: função getAmountPaidForOrganizer(registrationId) ou equivalente.
  - `organizerService`: usar valor líquido (total_amount - platform_fee_amount - registration_edit_fee_amount) nos totais.
  - `eventsService`: ajustar revenue e, se existir, platform_fee_revenue por evento usando as novas colunas.
  - `adminService` (e rotas/controllers admin): expor totais de taxa de inscrição e taxa de atualização.
- **Frontend (admin):** tela de taxas ou dashboard com “Taxa de inscrição”, “Taxa de atualização” e “Total taxas da plataforma”. Em **Configurações > Avançado** (`AdvancedSettings.tsx`): novo bloco para executar o script “Atualizar taxa da plataforma em inscrições antigas” (chamada à API em `src/lib/api/systemSettings.ts`).
- **Log de atualizações e pagamentos (OK Etapa 7):** novo endpoint admin que lista pagamentos classificados (inscrição vs taxas) e log de atualizações (`registration_amount_adjustments`); nova aba/página no frontend admin com filtros por tipo (pagamento de inscrição / pagamento de taxas) e período.

---

## 6. Riscos e cuidados

- **Arredondamento:** Garantir que `amountPaidForOrganizer` e diferenças use round consistente (ex.: 2 casas) para não gerar centavos fantasmas.
- **Inscrições gratuitas / total 0:** `platform_fee_amount` e `registration_edit_fee_amount` devem ser 0; evitar divisão por zero ou valor negativo em `valor_liquido`.
- **Compatibilidade:** Com fallback (Etapa 6), comportamento atual é preservado para registros antigos sem as novas colunas.
- **Eventos antigos:** O backfill usa a taxa **atual** da plataforma para estimar `platform_fee_amount`; não temos taxa histórica por inscrição. Isso é coerente com o cálculo atual de receita do organizador e evita perder ou alterar qualquer dado já existente (apenas preenchemos uma coluna nova).
