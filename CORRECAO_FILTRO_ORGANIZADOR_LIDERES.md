# Correção: Filtro por Organizador em Ganhos e Cupons de Líderes

## Problema Identificado

Os ganhos (comissões) e cupons dos líderes estavam sendo exibidos para todos os organizadores, sem filtro. Um organizador podia ver comissões e cupons criados por outro organizador.

## Solução Implementada

### 1. Cupons de Líderes

**Service (`couponsService.ts`):**
- Modificada função `getCouponsByLeader()` para aceitar parâmetro opcional `organizerId`
- Quando `organizerId` é fornecido, filtra cupons apenas daquele organizador

**Controller (`leaderCouponsController.ts`):**
- `getLeaderCouponsController` agora passa `req.user.id` como `organizerId`
- Organizador vê apenas cupons que ele mesmo criou para o líder

### 2. Comissões de Eventos (Event Commissions)

**Service (`leaderEventCommissionsService.ts`):**
- Modificada função `getLeaderEventCommissions()` para aceitar parâmetro opcional `organizerId`
- Quando `organizerId` é fornecido, filtra comissões apenas de eventos daquele organizador
- Ao buscar cupons associados, também filtra por organizador

**Controller (`leaderEventCommissionsController.ts`):**
- `getLeaderEventCommissionsController` agora passa `req.user.id` como `organizerId`
- Organizador vê apenas comissões de eventos que ele mesmo criou

### 3. Comissões (Ganhos)

**Service (`commissionsService.ts`):**
- Modificada função `getCommissionsByLeader()` para aceitar parâmetro opcional `organizerId`
- Quando `organizerId` é fornecido, filtra comissões apenas de eventos daquele organizador através do JOIN com events

**Controller (`groupLeadersController.ts`):**
- `getCommissionsByLeaderController` agora passa `req.user.id` como `organizerId` quando chamado pela rota do organizador
- Removida lógica de filtro manual (agora feito diretamente na query)

## Alterações Realizadas

### Backend - Services

1. **`couponsService.ts`**:
   ```typescript
   export const getCouponsByLeader = async (leaderId: string, organizerId?: string): Promise<Coupon[]>
   ```
   - Adicionado filtro `AND organizer_id = $2` quando `organizerId` é fornecido

2. **`leaderEventCommissionsService.ts`**:
   ```typescript
   export const getLeaderEventCommissions = async (leaderId: string, organizerId?: string): Promise<LeaderEventCommission[]>
   ```
   - Adicionado filtro `AND e.organizer_id = $2` quando `organizerId` é fornecido
   - Ao buscar cupons, também passa `organizerId` para filtrar

3. **`commissionsService.ts`**:
   ```typescript
   export const getCommissionsByLeader = async (leaderId: string, filters?: CommissionFilters, organizerId?: string): Promise<LeaderCommission[]>
   ```
   - Adicionado filtro `AND e.organizer_id = $X` quando `organizerId` é fornecido

### Backend - Controllers

1. **`leaderCouponsController.ts`**:
   - `getLeaderCouponsController`: Passa `req.user.id` para filtrar cupons

2. **`leaderEventCommissionsController.ts`**:
   - `getLeaderEventCommissionsController`: Passa `req.user.id` para filtrar comissões de eventos

3. **`groupLeadersController.ts`**:
   - `getCommissionsByLeaderController`: Passa `req.user.id` quando rota do organizador

## Comportamento Final

### Para Organizadores:
- ✅ Vê apenas cupons que ele criou para o líder
- ✅ Vê apenas comissões de eventos que ele criou
- ✅ Vê apenas ganhos (comissões) de eventos que ele criou
- ✅ Não vê dados de outros organizadores

### Para Líderes (rota `/me`):
- ✅ Vê todos os seus cupons (de todos os organizadores)
- ✅ Vê todas as suas comissões de eventos (de todos os organizadores)
- ✅ Vê todos os seus ganhos (de todos os organizadores)

### Para Admin:
- ✅ Vê todos os cupons, comissões e ganhos (sem filtro)

## Segurança

- ✅ Filtros aplicados diretamente nas queries SQL (mais seguro)
- ✅ Validação de propriedade já existente nos controllers (update/delete)
- ✅ Parâmetros opcionais não quebram código existente

## Compatibilidade

- ✅ Parâmetros opcionais garantem compatibilidade com código existente
- ✅ Rotas do líder (`/me`) continuam funcionando normalmente
- ✅ Rotas do admin continuam funcionando normalmente
