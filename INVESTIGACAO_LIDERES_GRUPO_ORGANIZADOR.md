# Investigação: Problema "Carregando..." em Líderes de Grupo - Painel Organizador

## Problema Identificado

No menu "Líderes de Grupo" na visão do organizador, o usuário aparece como "Carregando..." quando o líder não tem inscrições nos eventos do organizador.

## Análise da Configuração Atual

### Frontend (`src/components/organizer/OrganizerGroupLeaders.tsx`)

**Linha 67-92:** Função `loadAvailableUsers()`
- Busca usuários através das inscrições do organizador usando `getRegistrations({ organizer_id: user.id })`
- Extrai usuários únicos das inscrições (`runner_id` e `runner_name`)
- **Problema:** Só inclui usuários que têm inscrições nos eventos do organizador

**Linha 303:** Busca do usuário na lista
```typescript
const user = availableUsers.find((u) => u.id === leader.user_id);
```

**Linha 330-332:** Exibição quando usuário não encontrado
```typescript
{user ? (
  <div>
    <div className="font-medium">{user.name || "N/A"}</div>
    {user.email && (
      <div className="text-sm text-muted-foreground">{user.email}</div>
    )}
  </div>
) : (
  <span className="text-muted-foreground">Carregando...</span>
)}
```

### Backend - Rota do Organizador (`backend/src/routes/organizerRoutes.ts`)

**Linha 76:** Endpoint GET `/api/organizer/group-leaders`
- Usa o mesmo controller `getAllGroupLeadersController` usado pelo admin
- Não há filtro específico para organizadores na lista de líderes

### Backend - Controller (`backend/src/controllers/groupLeadersController.ts`)

**Linha 112-120:** `getAllGroupLeadersController`
- Chama `getAllGroupLeaders()` do service
- **Não há lógica de filtro por organizador** - retorna TODOS os líderes do sistema
- Não verifica se o líder tem relação com os eventos do organizador

### Backend - Service (`backend/src/services/groupLeadersService.ts`)

**Linha 260-266:** `getAllGroupLeaders()`
```typescript
export const getAllGroupLeaders = async (): Promise<GroupLeader[]> => {
  const result = await query(
    'SELECT * FROM group_leaders ORDER BY created_at DESC'
  );
  
  return result.rows as GroupLeader[];
};
```
- **Retorna TODOS os líderes** sem nenhum filtro
- Não verifica relação com eventos do organizador

### Lógica de Segurança em Outros Endpoints

**Referrals (Linha 322-351 do controller):**
- Quando chamado pela rota do organizador, filtra referrals para mostrar apenas usuários que se registraram nos eventos do organizador
- Query específica: `JOIN registrations r ON ur.user_id = r.runner_id WHERE ur.leader_id = $1 AND r.event_id = ANY($2::uuid[])`

**Commissions (Linha 419-440 do controller):**
- Quando chamado pela rota do organizador, filtra comissões para mostrar apenas dos eventos do organizador
- Filtro: `commissions.filter((c: any) => eventIds.includes(c.event_id))`

## Conclusão

### Como Está Configurado Atualmente:

1. **Backend retorna TODOS os líderes** do sistema, sem filtro por organizador
2. **Frontend tenta buscar informações do usuário** através das inscrições do organizador
3. **Se o líder não tem inscrições** nos eventos do organizador, ele não aparece na lista `availableUsers`
4. **Resultado:** O nome do usuário não é encontrado e mostra "Carregando..."

### Problema de Segurança/Visibilidade:

- **Não há restrição de segurança** - o organizador vê TODOS os líderes do sistema
- **Há restrição de informação** - o organizador só consegue ver o nome do usuário se ele tiver inscrições nos eventos do organizador
- **Inconsistência:** O líder aparece na lista, mas sem informações do usuário

### Comportamento Esperado vs Atual:

**Atual:**
- Organizador vê todos os líderes do sistema
- Nome do usuário só aparece se houver inscrições nos eventos do organizador
- Se não houver inscrições, mostra "Carregando..." indefinidamente

**Possíveis Comportamentos Esperados:**
1. **Opção A:** Mostrar apenas líderes que têm relação com eventos do organizador (via comissões, referrals ou inscrições)
2. **Opção B:** Mostrar todos os líderes, mas buscar informações do usuário diretamente do perfil (não apenas das inscrições)
3. **Opção C:** Mostrar todos os líderes, mas indicar claramente quando não há relação com o organizador

## Recomendações

1. **Decisão necessária:** Definir se o organizador deve ver:
   - Apenas líderes relacionados aos seus eventos (mais restritivo)
   - Todos os líderes, mas com informações completas (menos restritivo)

2. **Solução temporária:** Buscar informações do usuário diretamente do perfil quando não encontrado nas inscrições

3. **Solução definitiva:** Implementar filtro no backend similar ao usado em referrals/commissions, ou buscar informações do usuário de forma mais abrangente no frontend
