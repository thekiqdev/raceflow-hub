# Decisão de Arquitetura: Status de Inscrições para Eventos

**Data:** 2025-01-27  
**Etapa:** 1 - Análise e Decisão de Arquitetura  
**Status:** ✅ Concluída

---

## 📊 Análise da Estrutura Atual

### Estrutura do Banco de Dados

**Tabela `events`:**
```sql
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_date TIMESTAMP WITH TIME ZONE NOT NULL,
  location TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  banner_url TEXT,
  regulation_url TEXT,
  result_url TEXT,
  status event_status DEFAULT 'draft',  -- ENUM: 'draft', 'published', 'ongoing', 'finished', 'cancelled'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**ENUM `event_status` atual:**
```sql
CREATE TYPE public.event_status AS ENUM (
  'draft',      -- Rascunho
  'published',  -- Publicado
  'ongoing',    -- Em andamento
  'finished',   -- Finalizado
  'cancelled'   -- Cancelado
);
```

### Observações Importantes:

1. **Status atual é um ENUM** - Modificar ENUMs em PostgreSQL requer cuidados especiais
2. **Status é usado em múltiplos lugares** - Controllers, services, frontend
3. **Lógica de inscrição atual** - Verifica apenas `status = 'published'` ou `'ongoing'`
4. **Retrocompatibilidade necessária** - Eventos existentes devem continuar funcionando

---

## 🔍 Análise das Opções

### Opção A: Adicionar campo `registration_status` separado (TEXT)

**Vantagens:**
- ✅ Não modifica ENUM existente (evita problemas de migração)
- ✅ Mantém compatibilidade total com código existente
- ✅ Flexível para adicionar novos valores no futuro
- ✅ Permite NULL para retrocompatibilidade
- ✅ Fácil de migrar dados existentes

**Desvantagens:**
- ⚠️ Requer validação adicional (CHECK constraint)
- ⚠️ Não tem type safety nativo do ENUM

**Implementação:**
```sql
ALTER TABLE public.events 
ADD COLUMN registration_status TEXT 
CHECK (registration_status IS NULL OR registration_status IN ('not_open', 'open', 'closed'));
```

---

### Opção B: Adicionar novos valores ao ENUM `event_status`

**Vantagens:**
- ✅ Type safety nativo do PostgreSQL
- ✅ Validação automática pelo banco

**Desvantagens:**
- ❌ Modificar ENUM requer ALTER TYPE (pode ser problemático)
- ❌ Quebra compatibilidade com código existente
- ❌ Não separa conceitualmente "status do evento" de "status de inscrições"
- ❌ Pode causar confusão (evento publicado mas inscrições fechadas?)

**Implementação:**
```sql
ALTER TYPE event_status ADD VALUE 'published_not_open';
ALTER TYPE event_status ADD VALUE 'published_closed';
-- Problema: não pode adicionar valores no meio do ENUM facilmente
```

---

### Opção C: Usar campos de data para controle automático

**Vantagens:**
- ✅ Controle automático baseado em datas
- ✅ Não requer intervenção manual
- ✅ Escalável para muitos eventos

**Desvantagens:**
- ⚠️ Requer job agendado para atualizar status
- ⚠️ Não permite controle manual imediato
- ⚠️ Pode não atender casos especiais

**Implementação:**
```sql
ALTER TABLE public.events 
ADD COLUMN registration_start_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.events 
ADD COLUMN registration_end_date TIMESTAMP WITH TIME ZONE;
```

---

## ✅ Decisão Final: Opção A + C (Híbrida)

**Decisão:** Implementar **Opção A + C** de forma híbrida, combinando o melhor de ambas.

### Justificativa:

1. **Separação de Conceitos:**
   - `status` (event_status) = Estado geral do evento (draft, published, finished)
   - `registration_status` = Estado específico das inscrições (not_open, open, closed)
   - Isso permite: evento publicado mas inscrições ainda não abertas ✅

2. **Flexibilidade:**
   - Modo Manual: Organizador controla `registration_status` diretamente
   - Modo Automático: Sistema calcula `registration_status` baseado em `registration_start_date` e `registration_end_date`
   - Organizador pode escolher o modo que preferir

3. **Retrocompatibilidade:**
   - Campos podem ser NULL
   - Se `registration_status = NULL`, usa lógica antiga baseada em `status`
   - Eventos existentes continuam funcionando sem alterações

4. **Escalabilidade:**
   - Suporta muitos eventos com controle automático
   - Permite casos especiais com controle manual
   - Fácil adicionar novos valores no futuro

---

## 🏗️ Arquitetura Escolhida

### Campos a Adicionar:

```sql
-- Status manual ou calculado automaticamente
registration_status TEXT 
  CHECK (registration_status IS NULL OR registration_status IN ('not_open', 'open', 'closed'))
  DEFAULT NULL;

-- Datas para controle automático
registration_start_date TIMESTAMP WITH TIME ZONE;
registration_end_date TIMESTAMP WITH TIME ZONE;

-- Flag para ativar modo automático
registration_auto_mode BOOLEAN DEFAULT false;
```

### Lógica de Funcionamento:

#### Modo Automático (`registration_auto_mode = true`):
1. Organizador define `registration_start_date` e `registration_end_date`
2. Sistema calcula `registration_status` automaticamente:
   - `NOW() < registration_start_date` → `'not_open'`
   - `registration_start_date <= NOW() <= registration_end_date` → `'open'`
   - `NOW() > registration_end_date` → `'closed'`
3. Job agendado atualiza `registration_status` periodicamente

#### Modo Manual (`registration_auto_mode = false`):
1. Organizador define `registration_status` diretamente
2. Campos de data podem ser NULL ou ignorados
3. Status é usado diretamente sem cálculo

#### Retrocompatibilidade (`registration_status = NULL`):
1. Se `registration_status = NULL`, usa lógica antiga:
   - `status = 'published'` ou `'ongoing'` → permite inscrições
   - `status = 'draft'`, `'finished'` ou `'cancelled'` → bloqueia inscrições

---

## 📋 Valores do Campo `registration_status`

| Valor | Descrição | Quando Usar |
|-------|-----------|-------------|
| `'not_open'` | Inscrições em breve | Evento publicado, mas inscrições ainda não abertas |
| `'open'` | Inscrições abertas | Evento publicado e aceitando inscrições |
| `'closed'` | Inscrições encerradas | Evento publicado, mas não aceita mais inscrições |
| `NULL` | Usar lógica padrão | Retrocompatibilidade ou não configurado |

---

## 🔄 Fluxo de Decisão

```
┌─────────────────────────────────────┐
│  Evento com registration_status?    │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       │                │
   NULL?            Não NULL?
       │                │
       ▼                ▼
┌──────────────┐  ┌─────────────────┐
│ Usa lógica   │  │ registration_    │
│ antiga       │  │ auto_mode?       │
│ (status)     │  └──────┬────────────┘
└──────────────┘         │
                    ┌────┴────┐
                    │         │
                 true?      false?
                    │         │
                    ▼         ▼
            ┌───────────┐ ┌───────────┐
            │ Calcula   │ │ Usa valor │
            │ baseado   │ │ manual    │
            │ em datas  │ │           │
            └───────────┘ └───────────┘
```

---

## ✅ Validações Necessárias

1. **Se `registration_auto_mode = true`:**
   - `registration_start_date` é obrigatório
   - `registration_end_date` é obrigatório
   - `registration_end_date >= registration_start_date`

2. **Se `registration_auto_mode = false`:**
   - `registration_status` pode ser NULL (usa lógica antiga)
   - Campos de data podem ser NULL

3. **Sempre:**
   - `registration_status` deve ser NULL ou um dos valores permitidos
   - Validação no backend (Zod) e no banco (CHECK constraint)

---

## 📝 Próximos Passos

1. ✅ **Etapa 1:** Análise e Decisão de Arquitetura (CONCLUÍDA)
2. ⏭️ **Etapa 2:** Criação da Migration do Banco de Dados
3. ⏭️ **Etapa 3:** Atualização dos Tipos TypeScript no Backend
4. ⏭️ **Etapa 4:** Atualização dos Controllers e Validações

---

## 📚 Referências

- Plano Completo: `docs/PLANO_STATUS_INSCRICOES.md`
- Localização dos Campos: `docs/LOCALIZACAO_CAMPOS_INSCRICOES.md`
- Migration Inicial: `backend/migrations/001_initial_schema.sql`

---

**Aprovado por:** Equipe de Desenvolvimento  
**Data de Aprovação:** 2025-01-27
