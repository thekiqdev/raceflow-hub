# Plano de Melhorias - Líderes de Grupo

## Objetivo
Adicionar funcionalidades avançadas para gerenciamento de líderes de grupo, permitindo maior controle e personalização.

---

## Funcionalidades a Implementar

### 1. Editar Código de Líder
**Descrição:** Permitir que organizadores editem o código de referência de um líder de grupo.

**Requisitos:**
- Adicionar campo editável no formulário de edição do líder
- Validar que o código seja único (não pode existir outro líder com o mesmo código)
- Formato: 3 letras + 3 números (ex: ABC123)
- Validar formato antes de salvar
- Atualizar todas as referências existentes que usam o código antigo

**Backend:**
- Adicionar endpoint `PUT /api/organizer/group-leaders/:id/code` ou incluir no update
- Validar unicidade do código no banco de dados
- Validar formato do código (regex: `^[A-Z]{3}[0-9]{3}$`)
- Atualizar tabela `group_leaders` com novo código

**Frontend:**
- Adicionar campo de código no `GroupLeaderDialog` quando estiver editando
- Adicionar validação de formato e unicidade
- Exibir mensagem de erro se código já existir
- Adicionar opção "Editar Código" no menu de ações rápidas (3 pontinhos)

**Banco de Dados:**
- Verificar constraint de unicidade em `referral_code`
- Considerar atualizar `user_referrals` se necessário (se houver referência ao código antigo)

---

### 2. Definir Comissão para Evento Específico
**Descrição:** Permitir que organizadores definam uma comissão personalizada para um líder em um evento específico, e remova a comissão global.

**Requisitos:**
- Criar interface para associar líder + evento + comissão
- Comissão específica do evento tem prioridade sobre comissão global
- Permitir editar/remover comissão específica
- Exibir lista de eventos com comissões personalizadas no detalhe do líder

**Backend:**
- Criar tabela `leader_event_commissions`:
  ```sql
  CREATE TABLE leader_event_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leader_id UUID NOT NULL REFERENCES group_leaders(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    commission_percentage DECIMAL(5,2) NOT NULL CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(leader_id, event_id)
  );
  ```
- Criar endpoints:
  - `POST /api/organizer/group-leaders/:id/event-commissions` - Criar comissão para evento
  - `GET /api/organizer/group-leaders/:id/event-commissions` - Listar comissões do líder
  - `PUT /api/organizer/group-leaders/:id/event-commissions/:commissionId` - Atualizar comissão
  - `DELETE /api/organizer/group-leaders/:id/event-commissions/:commissionId` - Remover comissão
- Atualizar lógica de cálculo de comissão para verificar primeiro comissão específica do evento

**Frontend:**
- Criar componente `LeaderEventCommissions.tsx` para gerenciar comissões por evento
- Adicionar aba/seção no `GroupLeaderDetails` para exibir comissões por evento
- Criar dialog `EventCommissionDialog.tsx` para criar/editar comissão
- Adicionar opção "Definir Comissão por Evento" no menu de ações rápidas
- Listar eventos do organizador em um select
- Exibir tabela com eventos e suas comissões personalizadas

**Banco de Dados:**
- Migration para criar tabela `leader_event_commissions`
- Adicionar índices para performance
- Adicionar trigger para `updated_at`

---

### 3. Criar Cupom Exclusivo para Líder
**Descrição:** Permitir que organizadores criem cupons de desconto exclusivos para um líder divulgar, aplicáveis apenas em eventos selecionados.

**Requisitos:**
- Cupom vinculado a um líder específico
- Cupom pode ser aplicado apenas em eventos selecionados pelo organizador
- Desconto pode ser percentual ou fixo
- Cupom deve ter código único
- Exibir cupons do líder no detalhe do líder
- Permitir editar/desativar cupom

**Backend:**
- Adicionar campo `leader_id` na tabela `coupons` (opcional, nullable)
- Atualizar lógica de validação de cupom para verificar se é exclusivo do líder
- Criar endpoints:
  - `POST /api/organizer/group-leaders/:id/coupons` - Criar cupom para líder
  - `GET /api/organizer/group-leaders/:id/coupons` - Listar cupons do líder
  - `PUT /api/organizer/group-leaders/:id/coupons/:couponId` - Atualizar cupom
  - `DELETE /api/organizer/group-leaders/:id/coupons/:couponId` - Remover cupom
- Validar que cupom exclusivo só pode ser usado pelo líder ou por pessoas que se inscreveram usando o código do líder

**Frontend:**
- Criar componente `LeaderCoupons.tsx` para gerenciar cupons do líder
- Adicionar aba/seção no `GroupLeaderDetails` para exibir cupons
- Criar dialog `LeaderCouponDialog.tsx` para criar/editar cupom
- Adicionar opção "Criar Cupom Exclusivo" no menu de ações rápidas
- Permitir seleção múltipla de eventos (já existe essa funcionalidade em cupons)
- Exibir lista de cupons com status, desconto, eventos aplicáveis

**Banco de Dados:**
- Migration para adicionar `leader_id` em `coupons`:
  ```sql
  ALTER TABLE coupons ADD COLUMN leader_id UUID REFERENCES group_leaders(id) ON DELETE CASCADE;
  CREATE INDEX idx_coupons_leader_id ON coupons(leader_id);
  ```
- Atualizar lógica de validação de cupom no backend

---

## Interface - Menu de Ações Rápidas

### Localização
Adicionar menu de 3 pontinhos (DropdownMenu) na tabela de líderes, ao lado de cada líder.

### Opções do Menu:
1. **Ver Detalhes** (já existe)
2. **Editar** (já existe)
3. **Editar Código** (NOVO)
4. **Definir Comissão por Evento** (NOVO)
5. **Criar Cupom Exclusivo** (NOVO)
6. **Ativar/Desativar** (já existe)

---

## Estrutura de Arquivos

### Backend
```
backend/
├── migrations/
│   └── 039_add_leader_event_commissions.sql
│   └── 040_add_leader_id_to_coupons.sql
├── src/
│   ├── services/
│   │   ├── leaderEventCommissionsService.ts (NOVO)
│   │   └── couponsService.ts (atualizar)
│   ├── controllers/
│   │   ├── leaderEventCommissionsController.ts (NOVO)
│   │   └── couponsController.ts (atualizar)
│   └── routes/
│       └── organizerRoutes.ts (atualizar)
```

### Frontend
```
src/
├── components/
│   ├── organizer/
│   │   ├── OrganizerGroupLeaders.tsx (atualizar - adicionar menu)
│   │   ├── LeaderEventCommissions.tsx (NOVO)
│   │   ├── LeaderCoupons.tsx (NOVO)
│   │   ├── EventCommissionDialog.tsx (NOVO)
│   │   └── LeaderCouponDialog.tsx (NOVO)
│   └── admin/
│       └── GroupLeaderDialog.tsx (atualizar - adicionar campo código)
└── lib/
    └── api/
        ├── leaderEventCommissions.ts (NOVO)
        └── coupons.ts (atualizar)
```

---

## Ordem de Implementação

### ETAPA 1: Editar Código de Líder
- [ ] Migration (se necessário para constraint)
- [ ] Backend: Atualizar service e controller
- [ ] Frontend: Adicionar campo no dialog
- [ ] Frontend: Adicionar opção no menu de ações

### ETAPA 2: Comissão por Evento
- [ ] Migration: Criar tabela `leader_event_commissions`
- [ ] Backend: Criar service e controller
- [ ] Backend: Atualizar lógica de cálculo de comissão
- [ ] Frontend: Criar componentes
- [ ] Frontend: Adicionar opção no menu de ações

### ETAPA 3: Cupom Exclusivo para Líder
- [ ] Migration: Adicionar `leader_id` em `coupons`
- [ ] Backend: Atualizar service e controller de cupons
- [ ] Backend: Atualizar validação de cupom
- [ ] Frontend: Criar componentes
- [ ] Frontend: Adicionar opção no menu de ações

---

## Validações e Regras de Negócio

### Editar Código
- Código deve ter formato: 3 letras maiúsculas + 3 números
- Código deve ser único no sistema
- Não pode editar código se houver referências ativas (opcional - pode permitir)

### Comissão por Evento
- Comissão deve estar entre 0% e 100%
- Se existir comissão específica para evento, usar ela; senão, usar comissão global do líder
- Um líder pode ter apenas uma comissão por evento

### Cupom Exclusivo
- Cupom deve ter código único
- Cupom pode ser vinculado a múltiplos eventos
- Cupom exclusivo do líder só pode ser usado por pessoas que se inscreveram usando o código do líder (ou pelo próprio líder)
- Validar datas de validade do cupom

---

## Testes

### Testes Backend
- [ ] Testar edição de código com código duplicado
- [ ] Testar criação de comissão por evento
- [ ] Testar cálculo de comissão (específica vs global)
- [ ] Testar criação de cupom exclusivo
- [ ] Testar validação de uso de cupom exclusivo

### Testes Frontend
- [ ] Testar edição de código no formulário
- [ ] Testar criação de comissão por evento
- [ ] Testar criação de cupom exclusivo
- [ ] Testar menu de ações rápidas
- [ ] Testar exibição de dados no detalhe do líder

---

## Notas Técnicas

1. **Performance:** Adicionar índices nas novas tabelas e colunas
2. **Segurança:** Validar que organizador só pode gerenciar líderes relacionados aos seus eventos
3. **Auditoria:** Considerar adicionar logs de alterações importantes
4. **Compatibilidade:** Garantir que cupons existentes continuem funcionando (leader_id nullable)

---

## Próximos Passos

1. Revisar e aprovar plano
2. Iniciar implementação por etapas
3. Testar cada funcionalidade antes de prosseguir
4. Documentar APIs criadas
5. Atualizar documentação do sistema



