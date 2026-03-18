# Plano: Desligar notificações de faturas no Asaas

## Objetivo

Desabilitar as notificações de faturas enviadas pelo Asaas aos clientes (runners), de forma que eles **não recebam** e-mails/SMS/whatsapp de cobrança gerados automaticamente pelo gateway. O Cronoteam já envia suas próprias notificações de inscrição/confirmação.

---

## Documentação Asaas

- **FAQ Notificações:**  
  https://docs.asaas.com/docs/duvidas-frequentes-notificacoes  
  > *"Para criar um cliente com as notificações desabilitadas, basta enviar o atributo `notificationDisabled` como `true`. Caso o cliente já exista, basta enviar um update com o atributo `"notificationDisabled": "true"`."*

- **Alterar notificações de um cliente (detalhes):**  
  https://docs.asaas.com/docs/alterando-notificacoes-de-um-cliente  

- **Atualizar cliente (PUT):**  
  `PUT /v3/customers/{id}` — [Update existing customer](https://docs.asaas.com/reference/update-existing-customer)  
  Permissão: `CUSTOMER:WRITE`

---

## Situação atual no Cronoteam

### Onde o Asaas é usado

| Arquivo | Função / fluxo | Uso do cliente Asaas |
|--------|--------------------------------|----------------------|
| `backend/src/services/asaasService.ts` | `createCustomer(userId, customerData)` | Cria ou associa cliente (busca por CPF); **não** envia `notificationDisabled` |
| `backend/src/services/asaasService.ts` | `validateOrRecreateCustomer(userId, customerData)` | Usa/createCustomer; **não** atualiza notificações em clientes existentes |
| `backend/src/controllers/registrationsController.ts` | `createRegistrationController` | Monta `customerData` e chama `validateOrRecreateCustomer` |
| `backend/src/controllers/registrationsController.ts` | `createRegistrationByLeaderController` | Idem |
| `backend/src/controllers/transferRequestController.ts` | Fluxo de transferência com pagamento | Monta `customerData` e chama `createCustomer` |

### Payload hoje

- **Tipo:** `AsaasCustomerRequest` em `backend/src/types/asaas.ts`  
  - Campos usados: `name`, `email`, `cpfCnpj`, `phone`, `mobilePhone`  
  - **Não** existe `notificationDisabled`.

- **Criação:**  
  `POST /v3/customers` com esse objeto — clientes novos **não** nascem com notificações desligadas.

- **Clientes já existentes:**  
  Há apenas leitura (`GET /customers/{id}` na validação). Nenhum `PUT /customers/{id}` é feito para desativar notificações.

### Base de clientes existentes

- Tabela `asaas_customers`:  
  `(id, user_id, asaas_customer_id, created_at, updated_at)`  
- Todo usuário que já gerou cobrança Asaas está aí com um `asaas_customer_id`.  
- Esses IDs são os que precisam ser atualizados no Asaas para desligar notificações.

---

## Opções de implementação

### 1) Clientes novos — sempre com notificações desligadas

**O que fazer:**  
Incluir `notificationDisabled: true` em todo lugar que monta o payload de **criação** de cliente no Asaas.

**Onde alterar:**

1. **Tipo**  
   - `backend/src/types/asaas.ts`  
   - Em `AsaasCustomerRequest`, adicionar:  
     `notificationDisabled?: boolean;`

2. **Serviço**  
   - `backend/src/services/asaasService.ts`  
   - Em `createCustomer`, garantir que o objeto enviado em  
     `asaasClient.post('/customers', customerData)`  
     tenha `notificationDisabled: true` quando não vier preenchido (por exemplo:  
     `{ ...customerData, notificationDisabled: customerData.notificationDisabled ?? true }`).

3. **Quem monta `customerData`**  
   Garantir que não sobrescrevam com `false`. Hoje os pontos são:
   - `registrationsController.ts` (createRegistrationController, createRegistrationByLeaderController)
   - `transferRequestController.ts`  
   Não é obrigatório colocar `notificationDisabled: true` em cada um; basta o serviço definir o padrão e o tipo permitir o campo.

**Vantagem:**  
Todos os clientes criados daqui pra frente já nascem sem notificações de faturas.  
**Esforço:** baixo.

---

### 2) Clientes antigos — atualizar em massa via script (recomendado para “uma vez”)

**O que fazer:**  
Um script que lê todos os registros de `asaas_customers` e, para cada `asaas_customer_id`, chama a API do Asaas para desligar notificações.

**Fluxo sugerido:**

1. `SELECT user_id, asaas_customer_id FROM asaas_customers;`
2. Para cada linha:  
   `PUT /v3/customers/{asaas_customer_id}`  
   Body: `{ "notificationDisabled": true }`
3. Tratar erro (ex.: 404, rate limit) e logar; continuar com o próximo.
4. (Opcional) Registrar em log quantos foram atualizados / falharam.

**Onde implementar:**

- **Opção A – Script standalone (Node/TS)**  
  - Arquivo: por exemplo `backend/scripts/disable-asaas-customer-notifications.ts`  
  - Usa `query` do projeto e mesmo cliente HTTP/axios que o `asaasService` (ou importa `createAsaasClient` e faz os PUTs).  
  - Rode uma vez em homologação e, depois, em produção.

- **Opção B – Endpoint admin**  
  - Ex.: `POST /api/admin/scripts/disable-asaas-notifications`  
  - Internamente faz o mesmo loop (lê `asaas_customers`, PUT em cada `asaas_customer_id`).  
  - Útil se quiser rodar pelo painel ou reexecutar no futuro sem acesso ao servidor.

**Vantagens:**  
- Corrige toda a base antiga de uma vez.  
- Não muda o fluxo de inscrição/transferência.

**Cuidados:**  
- Respeitar limites de taxa da API Asaas (pode ser necessário pequeno delay entre chamadas).  
- Ter certeza de ambiente (sandbox vs produção) e de que a chave usada tem permissão `CUSTOMER:WRITE`.

---

### 3) Clientes antigos — desligar “sob demanda” ao reutilizar o cliente

**O que fazer:**  
Sempre que o fluxo for usar um cliente Asaas **já existente** (encontrado no nosso banco ou por CPF na API), antes de seguir, chamar o Asaas para desativar notificações nesse cliente.

**Onde alterar:**

- `backend/src/services/asaasService.ts`
  - Em `createCustomer`:
    - No ramo em que o cliente já existe no Asaas (busca por CPF) e você só associa no banco: após o `INSERT` em `asaas_customers`, chamar algo como `updateCustomerNotificationDisabled(asaasClient, existingAsaasCustomer.id)`.
    - No ramo em que o cliente já está na tabela `asaas_customers` (e você retorna sem chamar a API de criação): aí **não** há chamada de criação; esse caso hoje é tratado em `validateOrRecreateCustomer`.
  - Em `validateOrRecreateCustomer`:
    - Quando o cliente existe no banco e o `GET /customers/{id}` retorna sucesso: antes de dar `return asaasCustomerId`, chamar `PUT /customers/{asaasCustomerId}` com `{ notificationDisabled: true }`.

**Função auxiliar sugerida:**  
`updateCustomerNotificationDisabled(asaasClient, asaasCustomerId: string): Promise<void>`  
que faz `PUT /customers/${asaasCustomerId}` com body `{ notificationDisabled: true }` e ignora se o Asaas já retornar esse estado (ou tratar 4xx/5xx só em log para não quebrar inscrição).

**Vantagens:**  
- Não exige script nem job separado.  
- Conforme runners forem se inscrevendo de novo, seus clientes vão sendo corrigidos.

**Desvantagens:**  
- Um PUT extra por fluxo em que o cliente já existe.  
- Quem nunca mais se inscrever continua com notificações ligadas até rodar o script da opção 2.

---

### 4) Clientes antigos — só via API de notificações (alternativa)

**O que fazer:**  
Usar a API de notificações do Asaas em vez do atributo do cliente:

- `GET /v3/customers/{id}/notifications`
- Para cada notificação, `POST /v3/notifications/{id}` com `enabled: false` (e demais flags desligadas), ou usar `POST /v3/notifications/batch`.

**Contra:**  
- Mais chamadas e mais lógica.  
- O próprio FAQ do Asaas recomenda `notificationDisabled` no cliente para “nunca receber nenhuma notificação por padrão”.

**Recomendação:**  
Usar essa abordagem apenas se houver necessidade de desligar só alguns eventos/canais e manter outros. Para “desligar notificações de faturas” de forma geral, o caminho mais simples é **opção 2 + tipo/serviço da opção 1**.

---

## Recomendações

| Público | Ação sugerida |
|---------|----------------|
| **Clientes novos** | Implementar **opção 1** (tipo + padrão em `createCustomer` + garantir nos montadores de `customerData`). |
| **Clientes antigos** | Implementar **opção 2** (script ou endpoint admin que faz PUT em todos os `asaas_customer_id` da tabela `asaas_customers`). |
| **Opcional** | Se quiser corrigir também “no uso”, sem esperar o script: implementar **opção 3** em `validateOrRecreateCustomer` e no ramo “cliente encontrado por CPF” em `createCustomer`. |

Ordem sugerida de implementação:

1. **Opção 1** — tipo + serviço + padrão para clientes novos.  
2. **Opção 2** — script ou endpoint admin para clientes antigos.  
3. (Opcional) **Opção 3** — desligar sob demanda quando reutilizar cliente.

---

## Resumo de alterações por opção

### Opção 1 (clientes novos)

| Arquivo | Alteração |
|---------|-----------|
| `backend/src/types/asaas.ts` | Adicionar `notificationDisabled?: boolean` em `AsaasCustomerRequest`. |
| `backend/src/services/asaasService.ts` | Ao chamar `POST /customers`, enviar `notificationDisabled: true` por padrão (ex.: merge com `customerData`). |

### Opção 2 (clientes antigos – script/endpoint)

| Onde | Alteração |
|------|-----------|
| Novo script ou endpoint admin | Ler `asaas_customers`; para cada `asaas_customer_id`, `PUT /v3/customers/{id}` com `{ "notificationDisabled": true }`; logar sucesso/falha. |

### Opção 3 (sob demanda)

| Arquivo | Alteração |
|---------|-----------|
| `backend/src/services/asaasService.ts` | Nova função `updateCustomerNotificationDisabled(asaasClient, asaasCustomerId)`. Em `createCustomer`, ao vincular cliente encontrado por CPF, chamá-la. Em `validateOrRecreateCustomer`, ao validar cliente existente, chamá-la antes do `return`. |

---

## Referências

- [Dúvidas frequentes - Notificações (Asaas)](https://docs.asaas.com/docs/duvidas-frequentes-notificacoes)
- [Alterando notificações de um cliente](https://docs.asaas.com/docs/alterando-notificacoes-de-um-cliente)
- [Update existing customer](https://docs.asaas.com/reference/update-existing-customer)
