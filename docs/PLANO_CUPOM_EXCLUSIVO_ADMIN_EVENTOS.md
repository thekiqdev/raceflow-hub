# Plano: Cupom exclusivo (admin) – Eventos aplicáveis e visibilidade

**Objetivo:** Na criação de cupom exclusivo na visão do admin, permitir aplicar em qualquer evento do sistema; organizador do evento aplicado deve ver o cupom; e incluir campo de busca em Eventos Aplicáveis.

---

## Tarefas

### 1. Admin pode aplicar cupom em qualquer evento do sistema

- [x] **1.1** No diálogo de cupom exclusivo (LeaderCouponDialog), quando aberto como **admin** (prop `isAdmin`), carregar **todos os eventos** do sistema em vez de apenas eventos do usuário logado.
- [x] **1.2** LeaderCoupons (usado em GroupLeaderDetails com `isAdmin={true}`) deve passar a prop `isAdmin` para o LeaderCouponDialog.
- [x] **1.3** LeaderCouponDialog: se `isAdmin === true`, chamar `getEvents()` sem `organizer_id`; caso contrário, manter `getEvents({ organizer_id: user.id })`.

### 2. Organizador do evento aplicado pode ver o cupom criado pelo admin

- [x] **2.1** No backend, ao listar cupons do organizador (`getCouponsByOrganizer`), incluir também cupons de líder (`leader_id` preenchido) que tenham pelo menos um evento aplicável (`coupon_events`) cujo evento pertença a esse organizador (`events.organizer_id = organizerId`).
- [x] **2.2** Garantir que a listagem de cupons do organizador (ex.: CouponsManagement) mostre esses cupons criados pelo admin para líderes e aplicados a eventos do organizador.

### 3. Campo de busca em Eventos Aplicáveis

- [x] **3.1** Na seção "Eventos Aplicáveis" do LeaderCouponDialog, adicionar um campo de busca (input) que filtre a lista exibida por título do evento (e, se desejado, cidade/data).
- [x] **3.2** A filtragem pode ser apenas no frontend (lista já carregada), sem nova chamada à API.

---

## Regras de negócio

- **Admin:** ao criar/editar cupom exclusivo de um líder, pode escolher qualquer evento do sistema; a lista de eventos deve refletir isso e ter busca.
- **Organizador:** na sua área de cupons, deve ver além dos próprios cupons os cupons de líder criados pelo admin que tenham algum dos seus eventos em "eventos aplicáveis".
- **Backend:** criação de cupom por admin já exige ao menos um evento (`event_ids`); o `organizer_id` do cupom pode continuar sendo o do primeiro evento (para unicidade de código), mas a listagem por organizador deve considerar também cupons de líder vinculados a eventos do organizador.

---

## Critérios de teste

- Admin abre detalhes de um líder → Cupons → Criar cupom: a lista "Eventos Aplicáveis" mostra eventos de todos os organizadores.
- Admin seleciona um ou mais eventos de organizadores distintos, cria o cupom: sucesso.
- Organizador A acessa sua gestão de cupons: vê cupons criados por ele e cupons de líder (criados pelo admin) cujos eventos aplicáveis incluam algum evento do organizador A.
- No diálogo de cupom (admin), ao digitar no campo de busca de Eventos Aplicáveis, a lista é filtrada pelo texto (ex.: título do evento).

---

## Referências

- `src/components/organizer/LeaderCouponDialog.tsx` – diálogo de cupom exclusivo
- `src/components/organizer/LeaderCoupons.tsx` – lista e uso do diálogo (passar `isAdmin`)
- `src/components/admin/GroupLeaderDetails.tsx` – uso de LeaderCoupons com `isAdmin={true}`
- `backend/src/services/couponsService.ts` – `getCouponsByOrganizer`, `getCouponsByLeader`
- `backend/src/controllers/leaderCouponsController.ts` – criação de cupom por admin
- `src/lib/api/events.ts` – `getEvents(filters)`
