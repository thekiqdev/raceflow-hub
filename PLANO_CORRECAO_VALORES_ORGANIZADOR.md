# Plano de Correção: Valores sem Taxa da Plataforma para Organizadores

## Problema Identificado

Atualmente, os valores exibidos no painel do organizador incluem a taxa da plataforma. Como a taxa é ganha pelo admin, o organizador deve ver apenas o valor da inscrição sem a taxa.

## Análise dos Locais Afetados

### 1. Backend - Views e Queries SQL

#### 1.1. Views do Banco de Dados
**Arquivo:** `backend/migrations/011_organizer_dashboard_views.sql`

**Views afetadas:**
- `organizer_dashboard_stats` (linhas 19-27)
  - `total_revenue`: Soma de `r.total_amount` (inclui taxa)
  - `revenue_this_month`: Soma de `r.total_amount` (inclui taxa)

- `organizer_revenue_by_day` (linhas 45-56)
  - `revenue`: Soma de `r.total_amount` (inclui taxa)

- `organizer_top_events` (linhas 86-98)
  - `revenue`: Soma de `r.total_amount` (inclui taxa)

**Solução:** Criar função SQL para calcular valor sem taxa e usar nas views.

#### 1.2. Serviços Backend

**Arquivo:** `backend/src/services/organizerService.ts`

**Funções afetadas:**
- `getOrganizerDashboardStats` (linhas 6-37)
  - Retorna `total_revenue` e `revenue_this_month` da view (inclui taxa)

- `getOrganizerChartData` (linhas 42-134)
  - `revenueByDay`: Usa view `organizer_revenue_by_day` (inclui taxa)
  - `topEvents`: Usa view `organizer_top_events` (inclui taxa)

- `getOrganizerFinancialSummary` (linhas 149-175)
  - `totalRevenue`: Soma de `r.total_amount` (inclui taxa)
  - `pixRevenue`: Soma de `r.total_amount` (inclui taxa)
  - `creditCardRevenue`: Soma de `r.total_amount` (inclui taxa)
  - `boletoRevenue`: Soma de `r.total_amount` (inclui taxa)
  - `kitRevenue`: Soma de `r.total_amount` (inclui taxa)

- `getOrganizerEventRevenues` (linhas 190-218)
  - `totalRevenue`: Soma de `r.total_amount` (inclui taxa)
  - `avgTicket`: Calculado a partir de `totalRevenue` (inclui taxa)

**Arquivo:** `backend/src/services/financialService.ts`

**Funções afetadas:**
- `getOrganizerFinancialOverview` (linhas 422-496)
  - `total_revenue`: Soma de `r.total_amount` (inclui taxa)
  - `platform_commissions`: Calculado sobre `total_revenue` (precisa ajuste)
  - `available_balance`: Calculado a partir de `total_revenue` (precisa ajuste)

**Arquivo:** `backend/src/services/userManagementService.ts`

**Funções afetadas:**
- `getOrganizers` (linhas 28-78)
  - `revenue`: Soma de `r.total_amount` (inclui taxa)

### 2. Frontend - Componentes React

#### 2.1. Dashboard Overview
**Arquivo:** `src/components/organizer/OrganizerDashboardOverview.tsx`

**Locais afetados:**
- Linha 151: `stats?.total_revenue` - Card "Faturamento Total"
- Linha 87-101: `formattedRevenueByDay` - Gráfico "Faturamento por Dia"
- Linha 335: `event.revenue` - Top 3 Corridas

**Solução:** Os valores já vêm do backend, então a correção deve ser feita no backend.

#### 2.2. Painel Financeiro
**Arquivo:** `src/components/organizer/OrganizerFinancial.tsx`

**Locais afetados:**
- Linha 215: `overview.total_revenue` - Card "Total Arrecadado"
- Linha 228: `overview.total_revenue - overview.platform_commissions` - Card "Total Líquido"

**Problema:** O cálculo de `platform_commissions` está sendo feito sobre o `total_revenue` que já inclui a taxa, mas deveria ser feito sobre o valor sem taxa.

**Solução:** 
1. Backend deve retornar `total_revenue` já sem a taxa
2. `platform_commissions` deve ser calculado sobre o valor sem taxa (ou removido, já que a taxa já foi descontada)

#### 2.3. Lista de Eventos
**Arquivo:** `src/components/organizer/OrganizerEvents.tsx`

**Locais afetados:**
- Linha 322: `event.revenue` - Coluna de receita na tabela
- Linha 404: Soma de `event.revenue` - Total geral

**Solução:** O valor vem da API de eventos, precisa verificar se a API retorna o valor correto.

#### 2.4. Relatório Detalhado do Evento
**Arquivo:** `src/components/organizer/EventDetailedReport.tsx`

**Locais afetados:**
- Linha 158: `reg.total_amount` - Cálculo de `totalRevenue`
- Linha 173: `reg.total_amount` - Cálculo de revenue por categoria
- Linha 187: `reg.total_amount` - Cálculo de revenue por kit
- Linha 297: `reg.total_amount` - Cálculo de revenue por modalidade
- Linha 402: `totalRevenue` - Card de receita total
- Linha 405: Ticket médio calculado a partir de `totalRevenue`
- Linha 422: Soma de revenue de kits
- Linha 436: `pixRevenue`
- Linha 453: `creditCardRevenue`
- Linha 477-485: Revenue por categoria
- Linha 507-515: Revenue por kit
- Linha 544-574: Revenue por modalidade
- Linha 755: `reg.total_amount` - Tabela de inscrições

**Solução:** Criar função helper no frontend para calcular valor sem taxa e aplicar em todos os cálculos.

#### 2.5. Lista de Inscrições
**Arquivo:** `src/components/organizer/OrganizerRegistrations.tsx`

**Locais afetados:**
- Linha 648: `registration.total_amount` - Coluna de valor na tabela
- Linha 1180: `registrationDetails.total_amount` - Dialog de detalhes

**Solução:** Aplicar função helper para calcular valor sem taxa antes de exibir.

#### 2.6. Relatórios
**Arquivo:** `src/components/organizer/OrganizerReports.tsx`

**Locais afetados:**
- Linha 146: `summary.totalRevenue` - Card de receita total
- Linha 165: `summary.pixRevenue` - Card de receita PIX
- Linha 186: `summary.creditCardRevenue` - Card de receita Cartão
- Linha 207: `summary.kitRevenue` - Card de receita Kits
- Linha 277: `eventRevenues` - Gráfico de receita por evento
- Linha 325: `event.totalRevenue` - Tabela de receita por evento

**Solução:** Os valores vêm do backend, correção deve ser feita no backend.

## Plano de Implementação

### Fase 1: Criar Função Helper para Calcular Valor sem Taxa

#### 1.1. Backend - Função SQL
**Arquivo:** Nova migration ou atualização de migration existente

```sql
-- Função para calcular valor sem taxa da plataforma
CREATE OR REPLACE FUNCTION calculate_value_without_platform_fee(
  total_amount DECIMAL,
  platform_fee DECIMAL,
  platform_fee_type VARCHAR
) RETURNS DECIMAL AS $$
BEGIN
  IF total_amount IS NULL OR total_amount <= 0 OR platform_fee IS NULL OR platform_fee <= 0 THEN
    RETURN total_amount;
  END IF;
  
  IF platform_fee_type = 'percentage' THEN
    -- Se taxa é percentual: value_without_fee = total_amount / (1 + fee/100)
    -- Exemplo: se total é 110 e taxa é 10%, então original = 110 / 1.10 = 100
    RETURN total_amount / (1 + platform_fee / 100);
  ELSE
    -- Se taxa é fixa: value_without_fee = total_amount - fee
    RETURN GREATEST(0, total_amount - platform_fee);
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

#### 1.2. Backend - Função TypeScript
**Arquivo:** `backend/src/utils/feeCalculations.ts` (novo arquivo)

```typescript
export interface PlatformFeeSettings {
  platform_fee: number;
  platform_fee_type: 'fixed' | 'percentage';
}

export function calculateValueWithoutFee(
  totalAmount: number,
  platformFee: number,
  platformFeeType: 'fixed' | 'percentage'
): number {
  if (!totalAmount || totalAmount <= 0 || !platformFee || platformFee <= 0) {
    return totalAmount;
  }
  
  if (platformFeeType === 'percentage') {
    // Se taxa é percentual: value_without_fee = total_amount / (1 + fee/100)
    return totalAmount / (1 + platformFee / 100);
  } else {
    // Se taxa é fixa: value_without_fee = total_amount - fee
    return Math.max(0, totalAmount - platformFee);
  }
}
```

#### 1.3. Frontend - Função Helper
**Arquivo:** `src/lib/utils/feeCalculations.ts` (novo arquivo)

```typescript
export interface PlatformFeeSettings {
  platform_fee: number;
  platform_fee_type: 'fixed' | 'percentage';
}

export function calculateValueWithoutFee(
  totalAmount: number,
  platformFee: number,
  platformFeeType: 'fixed' | 'percentage'
): number {
  if (!totalAmount || totalAmount <= 0 || !platformFee || platformFee <= 0) {
    return totalAmount;
  }
  
  if (platformFeeType === 'percentage') {
    return totalAmount / (1 + platformFee / 100);
  } else {
    return Math.max(0, totalAmount - platformFee);
  }
}
```

### Fase 2: Atualizar Views do Banco de Dados

**Arquivo:** Nova migration: `backend/migrations/XXX_update_organizer_views_without_fee.sql`

1. Atualizar `organizer_dashboard_stats` para usar a função SQL
2. Atualizar `organizer_revenue_by_day` para usar a função SQL
3. Atualizar `organizer_top_events` para usar a função SQL

**Nota:** As views precisam acessar as configurações de taxa da plataforma. Pode ser necessário criar uma função que busca essas configurações ou passar como parâmetro.

### Fase 3: Atualizar Serviços Backend

#### 3.1. `organizerService.ts`
- Atualizar `getOrganizerFinancialSummary` para calcular valores sem taxa
- Atualizar `getOrganizerEventRevenues` para calcular valores sem taxa
- As outras funções que usam views serão atualizadas automaticamente quando as views forem atualizadas

#### 3.2. `financialService.ts`
- Atualizar `getOrganizerFinancialOverview`:
  - Calcular `total_revenue` sem taxa
  - Ajustar cálculo de `platform_commissions` (pode ser removido ou calculado de forma diferente)
  - Ajustar `available_balance` para usar o novo `total_revenue`

#### 3.3. `userManagementService.ts`
- Atualizar `getOrganizers` para calcular revenue sem taxa

### Fase 4: Atualizar Componentes Frontend

#### 4.1. Componentes que recebem dados do backend
- `OrganizerDashboardOverview.tsx`: Valores já vêm corretos do backend
- `OrganizerFinancial.tsx`: Ajustar exibição se necessário
- `OrganizerReports.tsx`: Valores já vêm corretos do backend
- `OrganizerEvents.tsx`: Verificar se API de eventos retorna valor correto

#### 4.2. Componentes que calculam valores no frontend
- `EventDetailedReport.tsx`: 
  - Importar função helper
  - Buscar configurações de taxa
  - Aplicar função em todos os cálculos de revenue
  - Aplicar função na exibição de `total_amount` na tabela

- `OrganizerRegistrations.tsx`:
  - Importar função helper
  - Buscar configurações de taxa
  - Aplicar função na exibição de `total_amount`

### Fase 5: Migração de Dados Históricos

**Consideração:** Os valores já armazenados no banco (`total_amount` nas inscrições) incluem a taxa. Para exibir corretamente os valores históricos, precisamos:

1. **Opção 1 (Recomendada):** Calcular o valor sem taxa em tempo de execução usando a função helper
   - Vantagem: Não precisa migrar dados
   - Desvantagem: Depende das configurações atuais de taxa (se a taxa mudou, os valores históricos podem ficar incorretos)

2. **Opção 2:** Armazenar o valor sem taxa em uma nova coluna `base_amount` na tabela `registrations`
   - Vantagem: Valores históricos preservados corretamente
   - Desvantagem: Requer migration de dados e atualização do código de criação de inscrições

**Recomendação:** Usar Opção 1 inicialmente. Se necessário, implementar Opção 2 no futuro.

## Ordem de Implementação

1. ✅ Criar função helper (Backend e Frontend)
2. ✅ Criar/atualizar migration para função SQL
3. ✅ Atualizar views do banco de dados
4. ✅ Atualizar serviços backend
5. ✅ Atualizar componentes frontend que calculam valores
6. ✅ Testar em ambiente de desenvolvimento
7. ✅ Validar valores históricos
8. ✅ Deploy em produção

## Testes Necessários

1. **Teste de Cálculo:**
   - Taxa percentual: Verificar se cálculo está correto
   - Taxa fixa: Verificar se cálculo está correto
   - Sem taxa: Verificar se retorna valor original
   - Valores zero ou negativos: Verificar tratamento

2. **Teste de Exibição:**
   - Dashboard: Verificar se valores estão corretos
   - Financeiro: Verificar se valores estão corretos
   - Eventos: Verificar se valores estão corretos
   - Inscrições: Verificar se valores estão corretos
   - Relatórios: Verificar se valores estão corretos

3. **Teste de Dados Históricos:**
   - Verificar se valores antigos são exibidos corretamente
   - Verificar se mudanças na taxa não afetam valores históricos incorretamente

## Observações Importantes

1. **Taxa da Plataforma:** A taxa é configurada em `system_settings` e pode ser alterada. Os valores históricos devem ser calculados com base na taxa atual, não na taxa que estava vigente na época da inscrição.

2. **Compatibilidade:** Manter compatibilidade com código existente. Se outros sistemas ou APIs dependem dos valores com taxa, considerar criar endpoints separados ou parâmetros de query.

3. **Performance:** As views atualizadas podem ter impacto na performance. Monitorar e otimizar se necessário.

4. **Auditoria:** Considerar manter logs ou histórico de mudanças na taxa da plataforma para rastreabilidade futura.
