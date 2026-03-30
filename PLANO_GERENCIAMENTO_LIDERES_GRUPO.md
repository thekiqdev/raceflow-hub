# Plano: Alteração no Gerenciamento de Líderes de Grupo

## Objetivo

Restringir a criação de líderes apenas para administradores e permitir que organizadores visualizem e gerenciem apenas os líderes criados pelo admin.

## Fluxo Atual vs Novo Fluxo

### Fluxo Atual
1. Organizador pode criar líderes diretamente
2. Organizador vê todos os líderes do sistema
3. Problema: Organizador vê líderes sem informações (mostra "Carregando...")

### Novo Fluxo
1. **Usuário se cadastra** no sistema
2. **Admin converte usuário em líder** (via aba Usuários ou aba Líderes de Grupo)
3. **Organizador vê apenas líderes criados pelo admin**
4. **Organizador pode gerenciar** (ativar/desativar, definir comissões, criar cupons) apenas os líderes disponibilizados pelo admin

## Alterações Necessárias

### 1. Backend - Restrição de Criação de Líderes

#### 1.1 Controller (`backend/src/controllers/groupLeadersController.ts`)

**Alteração:** Adicionar verificação de role no `createGroupLeaderController`

**Atual:**
- Qualquer usuário autenticado pode criar líder (via rota admin ou organizer)

**Novo:**
- Apenas admin pode criar líder
- Organizador não pode criar líder diretamente

**Implementação:**
```typescript
// Verificar se é admin antes de permitir criação
// Já existe middleware requireRole('admin') nas rotas admin
// Precisamos garantir que a rota do organizador NÃO permita criação
```

#### 1.2 Rotas (`backend/src/routes/organizerRoutes.ts`)

**Alteração:** Remover rota POST `/group-leaders` do organizador

**Atual:**
```typescript
router.post('/group-leaders', createGroupLeaderController);
```

**Novo:**
```typescript
// Remover esta linha - organizador não pode criar líder
// Apenas admin pode criar via /api/admin/group-leaders
```

#### 1.3 Service - Filtro de Líderes para Organizador

**Alteração:** Criar função específica para retornar líderes visíveis ao organizador

**Novo Service:** `getOrganizerGroupLeaders()` em `backend/src/services/groupLeadersService.ts`

**Lógica:**
- Retornar TODOS os líderes criados pelo admin (não filtrar por eventos)
- Organizador pode ver todos os líderes disponíveis no sistema
- Organizador pode gerenciar (ativar/desativar, comissões, cupons) qualquer líder

**Query:**
```sql
SELECT * FROM group_leaders 
ORDER BY created_at DESC
-- Não precisa filtrar por organizador, pois todos os líderes são globais
```

### 2. Backend - Endpoint Específico para Organizador

#### 2.1 Controller (`backend/src/controllers/groupLeadersController.ts`)

**Alteração:** Criar controller específico para organizador

**Novo Controller:** `getOrganizerGroupLeadersController`

**Implementação:**
```typescript
export const getOrganizerGroupLeadersController = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    // Retornar todos os líderes (criados pelo admin)
    const leaders = await getAllGroupLeaders();
    
    res.json({
      success: true,
      data: leaders,
    });
  }
);
```

#### 2.2 Rotas (`backend/src/routes/organizerRoutes.ts`)

**Alteração:** Usar controller específico para GET

**Atual:**
```typescript
router.get('/group-leaders', getAllGroupLeadersController);
```

**Novo:**
```typescript
router.get('/group-leaders', getOrganizerGroupLeadersController);
// Remover POST - organizador não pode criar
```

### 3. Frontend - Remover Criação de Líder pelo Organizador

#### 3.1 Componente (`src/components/organizer/OrganizerGroupLeaders.tsx`)

**Alteração 1:** Remover botão "Novo Líder" ou desabilitar funcionalidade

**Opção A - Remover botão:**
```typescript
// Remover ou comentar:
// <Button onClick={handleCreateLeader}>
//   <UserPlus className="mr-2 h-4 w-4" />
//   Novo Líder
// </Button>
```

**Opção B - Manter botão mas mudar funcionalidade:**
- Botão "Selecionar Líder" ao invés de "Novo Líder"
- Abre dialog para selecionar líder existente (criado pelo admin)
- Permite atribuir líder a eventos específicos

**Alteração 2:** Corrigir busca de informações do usuário

**Problema Atual:**
- Busca usuários apenas através de inscrições do organizador
- Se líder não tem inscrições, mostra "Carregando..."

**Solução:**
- Buscar informações do usuário diretamente do perfil
- Criar endpoint ou modificar endpoint para retornar informações do usuário junto com o líder

**Implementação:**
```typescript
// Opção 1: Modificar backend para retornar user info junto
// Opção 2: Buscar user info separadamente no frontend
const loadUserInfo = async (userId: string) => {
  // Buscar do endpoint de usuários ou profiles
};
```

#### 3.2 API Client (`src/lib/api/groupLeaders.ts`)

**Alteração:** Garantir que `getOrganizerGroupLeaders` retorna dados completos

**Verificar:** Se o endpoint retorna informações do usuário ou apenas `user_id`

**Se necessário:** Criar endpoint adicional para buscar informações do usuário

### 4. Frontend - Melhorar Exibição de Informações do Usuário

#### 4.1 Componente (`src/components/organizer/OrganizerGroupLeaders.tsx`)

**Alteração:** Buscar informações do usuário de forma mais robusta

**Implementação:**

**Opção A - Modificar Backend:**
- Modificar `getAllGroupLeaders()` para fazer JOIN com profiles
- Retornar `user_name` e `user_email` junto com os dados do líder

**Opção B - Buscar no Frontend:**
```typescript
const loadUserInfoForLeaders = async (leaders: GroupLeader[]) => {
  const userIds = leaders.map(l => l.user_id);
  // Buscar informações de todos os usuários de uma vez
  const usersResponse = await getUsersByIds(userIds);
  // Mapear para availableUsers
};
```

**Opção C - Buscar Individualmente (menos eficiente):**
```typescript
useEffect(() => {
  leaders.forEach(leader => {
    if (!availableUsers.find(u => u.id === leader.user_id)) {
      // Buscar informações do usuário
      loadUserInfo(leader.user_id);
    }
  });
}, [leaders]);
```

### 5. Backend - Melhorar Retorno de Dados do Líder

#### 5.1 Service (`backend/src/services/groupLeadersService.ts`)

**Alteração:** Modificar `getAllGroupLeaders()` para incluir informações do usuário

**Nova Query:**
```sql
SELECT 
  gl.*,
  p.full_name as user_name,
  u.email as user_email,
  p.cpf as user_cpf,
  p.phone as user_phone
FROM group_leaders gl
LEFT JOIN profiles p ON gl.user_id = p.id
LEFT JOIN users u ON gl.user_id = u.id
ORDER BY gl.created_at DESC
```

**Ou criar função específica:**
```typescript
export const getAllGroupLeadersWithUserInfo = async (): Promise<GroupLeader[]> => {
  const result = await query(`
    SELECT 
      gl.*,
      p.full_name as user_name,
      u.email as user_email
    FROM group_leaders gl
    LEFT JOIN profiles p ON gl.user_id = p.id
    LEFT JOIN users u ON gl.user_id = u.id
    ORDER BY gl.created_at DESC
  `);
  
  return result.rows.map(row => ({
    ...row,
    user_name: row.user_name,
    user_email: row.user_email,
  }));
};
```

### 6. Frontend - Ajustar Dialog de Criação/Seleção

#### 6.1 Componente (`src/components/admin/GroupLeaderDialog.tsx`)

**Verificar:** Se já existe e se funciona corretamente para admin

**Se necessário:** Garantir que admin pode criar líder selecionando usuário da lista

#### 6.2 Componente (`src/components/organizer/OrganizerGroupLeaders.tsx`)

**Alteração:** Se manter botão, mudar para "Selecionar Líder" ou remover completamente

**Se remover:**
- Remover `handleCreateLeader`
- Remover `GroupLeaderDialog` do componente
- Remover estado `dialogOpen` e `editingLeader` relacionados à criação

**Se mudar funcionalidade:**
- Criar novo dialog para seleção de líder existente
- Permitir atribuir líder a eventos específicos (via comissões por evento)

## Plano de Implementação

### Fase 1: Backend - Restrições e Melhorias
1. ✅ Remover rota POST `/organizer/group-leaders`
2. ✅ Criar `getOrganizerGroupLeadersController` específico
3. ✅ Modificar `getAllGroupLeaders()` para incluir informações do usuário
4. ✅ Testar endpoints

### Fase 2: Frontend - Remover Criação pelo Organizador
1. ✅ Remover ou alterar botão "Novo Líder" no componente do organizador
2. ✅ Remover `handleCreateLeader` e dialog relacionado
3. ✅ Ajustar `loadAvailableUsers` para buscar informações do usuário corretamente
4. ✅ Testar exibição de líderes

### Fase 3: Frontend - Melhorar Exibição
1. ✅ Ajustar componente para usar informações do usuário retornadas pelo backend
2. ✅ Remover lógica de busca através de inscrições
3. ✅ Testar exibição completa de informações

### Fase 4: Validação e Testes
1. ✅ Testar criação de líder pelo admin (via usuários e via líderes de grupo)
2. ✅ Testar visualização de líderes pelo organizador
3. ✅ Testar gerenciamento (ativar/desativar, comissões, cupons) pelo organizador
4. ✅ Verificar que organizador não pode criar líder

## Estrutura de Dados

### Resposta do Backend - Lista de Líderes

**Atual:**
```typescript
{
  id: string;
  user_id: string;
  referral_code: string;
  is_active: boolean;
  // ...
}
```

**Novo (com informações do usuário):**
```typescript
{
  id: string;
  user_id: string;
  user_name: string;      // NOVO
  user_email: string;     // NOVO
  referral_code: string;
  is_active: boolean;
  // ...
}
```

### Frontend - Interface GroupLeader

**Atualizar:**
```typescript
export interface GroupLeader {
  id: string;
  user_id: string;
  user_name?: string;     // NOVO - opcional para compatibilidade
  user_email?: string;    // NOVO - opcional para compatibilidade
  referral_code: string;
  is_active: boolean;
  // ...
}
```

## Considerações Importantes

### Segurança
- ✅ Organizador não pode criar líderes (apenas admin)
- ✅ Organizador pode ver todos os líderes criados pelo admin
- ✅ Organizador pode gerenciar líderes (ativar/desativar, comissões, cupons)
- ✅ Filtros de referrals e commissions por evento continuam funcionando

### Compatibilidade
- ✅ Manter compatibilidade com código existente
- ✅ Adicionar campos opcionais na interface
- ✅ Não quebrar funcionalidades existentes

### Performance
- ✅ Buscar informações do usuário em uma única query (JOIN)
- ✅ Evitar múltiplas requisições no frontend
- ✅ Cachear informações quando possível

## Checklist de Implementação

### Backend
- [ ] Remover rota POST `/organizer/group-leaders`
- [ ] Criar `getOrganizerGroupLeadersController`
- [ ] Modificar `getAllGroupLeaders()` para incluir user info
- [ ] Atualizar interface TypeScript se necessário
- [ ] Testar endpoints

### Frontend
- [ ] Remover/alterar botão "Novo Líder" no componente organizador
- [ ] Remover `handleCreateLeader` e dialog
- [ ] Atualizar `loadAvailableUsers` ou remover se não necessário
- [ ] Atualizar interface `GroupLeader` com campos opcionais
- [ ] Ajustar exibição para usar `user_name` e `user_email` do backend
- [ ] Remover lógica de busca através de inscrições
- [ ] Testar visualização completa

### Testes
- [ ] Admin pode criar líder via aba Usuários
- [ ] Admin pode criar líder via aba Líderes de Grupo
- [ ] Organizador vê lista de líderes criados pelo admin
- [ ] Organizador vê informações completas (nome, email) dos líderes
- [ ] Organizador não pode criar líder
- [ ] Organizador pode gerenciar líderes (ativar/desativar, comissões, cupons)

## Notas Adicionais

### Sobre "Novo Líder" no Organizador
Se o botão for mantido, pode ser usado para:
- Selecionar líder existente para atribuir a eventos específicos
- Visualizar lista de líderes disponíveis
- Não criar novo líder, apenas selecionar

### Sobre Filtros Futuros
Se no futuro quiser filtrar líderes por organizador:
- Adicionar campo `organizer_id` na tabela `group_leaders` (opcional)
- Ou criar tabela de relacionamento `organizer_group_leaders`
- Por enquanto, todos os líderes são globais e visíveis a todos os organizadores
