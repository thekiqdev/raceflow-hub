# Correção: Total Ganhos por Organizador

## Problema Identificado

No painel do organizador, a visão geral e a lista de líderes estavam mostrando o "Total Ganhos" completo (de todos os organizadores), quando deveria mostrar apenas os ganhos do organizador em questão.

## Solução Implementada

### Backend - Service (`groupLeadersService.ts`)

**Nova Função:**
```typescript
export const getLeaderEarningsByOrganizer = async (leaderId: string, organizerId: string): Promise<number>
```
- Calcula ganhos de um líder apenas dos eventos de um organizador específico
- Filtra por `leader_id`, `organizer_id` e `status = 'paid'`

**Função Modificada:**
```typescript
export const getOrganizerLeaders = async (organizerId: string): Promise<any[]>
```
- Agora calcula ganhos por organizador para cada líder
- Usa query otimizada com `GROUP BY` para calcular todos os ganhos de uma vez
- Retorna `total_earnings` com valor calculado apenas para o organizador
- Mantém `total_earnings_all` com o total completo (para referência)

**Otimização:**
- Antes: N queries (uma por líder)
- Depois: 1 query com GROUP BY para todos os líderes

### Frontend

**Componente (`OrganizerGroupLeaders.tsx`):**
- Visão Geral (linha 239): `leaders.reduce((sum, l) => sum + l.total_earnings, 0)`
  - Agora soma apenas ganhos do organizador
- Lista (linha 339): `formatCurrency(leader.total_earnings)`
  - Agora mostra apenas ganhos do organizador

## Comportamento Final

### Para Organizadores:
- ✅ Visão Geral: "Total de Comissões" mostra apenas ganhos do organizador
- ✅ Lista: Coluna "Ganhos" mostra apenas ganhos do organizador
- ✅ Cada organizador vê apenas seus próprios ganhos

### Para Admin:
- ✅ Visão Geral: "Total de Comissões" mostra total completo (de todos os organizadores)
- ✅ Lista: Coluna "Ganhos" mostra total completo
- ✅ Admin vê todos os ganhos de todos os organizadores

## Query SQL Otimizada

```sql
SELECT 
  lc.leader_id,
  COALESCE(SUM(lc.commission_amount), 0) as total_earnings
FROM leader_commissions lc
JOIN events e ON lc.event_id = e.id
WHERE lc.leader_id = ANY($1::uuid[])
  AND e.organizer_id = $2
  AND lc.status = 'paid'
GROUP BY lc.leader_id
```

## Estrutura de Dados Retornada

```typescript
{
  id: string;
  total_earnings: number;        // Apenas do organizador
  total_earnings_all: number;    // Total completo (para referência)
  // ... outros campos
}
```

## Performance

- ✅ Query otimizada com GROUP BY
- ✅ Uma única query para todos os líderes
- ✅ Redução significativa de queries ao banco
