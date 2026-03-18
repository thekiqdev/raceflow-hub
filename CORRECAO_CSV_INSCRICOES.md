# Correção: Exportação CSV de Inscrições

## Problema Identificado

1. **Colunas faltando no CSV**: CPF, E-mail e Equipe não estavam sendo exportados
2. **Atributos não aparecendo**: Em algumas inscrições feitas pelo líder, os atributos (tamanho, cor, etc.) não estavam sendo exportados

## Solução Implementada

### 1. Adição de Colunas CPF, E-mail e Equipe

#### Backend - Service (`registrationsService.ts`)

**Query `getRegistrations` atualizada:**
- Adicionado `p.team as runner_team` na query
- Adicionado `u.email as runner_email` na query
- Adicionado `LEFT JOIN users u ON p.id = u.id` para buscar o email

**Código:**
```typescript
p.full_name as runner_name,
p.cpf as runner_cpf,
p.gender as runner_gender,
p.birth_date as runner_birth_date,
p.city as runner_city,
p.state as runner_state,
p.team as runner_team,  // NOVO
u.email as runner_email,  // NOVO
```

#### Backend - Controller (`registrationsController.ts`)

**Headers do CSV atualizados:**
```typescript
const headers = [
  'NUMERO',
  'NOME MINUSCULO',
  'NOME',
  'CPF',           // NOVO
  'E-MAIL',        // NOVO
  'EQUIPE',        // NOVO
  'SEXO',
  'NASCIMENTO',
  'CATEGORIA',
  'KIT',
  'VARIAÇÃO',
  'ATRIBUTO',
  'MODALIDADE',
  'DATA HORA INSCRIÇÃO',
  'MEIO DE PAGAMENTO',
  'VALOR',
  'LÍDER',
];
```

**Função de formatação de CPF adicionada:**
```typescript
const formatCPF = (cpf: string | null | undefined): string => {
  if (!cpf) return '';
  const cleanCpf = cpf.replace(/[^0-9]/g, '');
  if (cleanCpf.length === 11) {
    return cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cleanCpf;
};
```

**Linha do CSV atualizada:**
```typescript
return [
  index + 1,           // NUMERO
  runnerNameLower,     // NOME MINUSCULO
  runnerNameUpper,     // NOME
  runnerCpf,           // CPF (formatado)
  runnerEmail,         // E-MAIL
  runnerTeam,          // EQUIPE
  gender,              // SEXO
  birthDate,          // NASCIMENTO
  categoryName,       // CATEGORIA
  kitName,            // KIT
  kitVariation,       // VARIAÇÃO
  attributes,         // ATRIBUTO
  modality,           // MODALIDADE
  registrationDateTime, // DATA HORA INSCRIÇÃO
  paymentMethod,      // MEIO DE PAGAMENTO
  totalAmount,        // VALOR
  leaderName,         // LÍDER
];
```

### 2. Correção de Atributos em Inscrições Feitas pelo Líder

#### Frontend - API (`registrations.ts`)

**Interface atualizada:**
```typescript
export interface CreateRegistrationByLeaderData {
  email: string;
  event_id: string;
  category_id: string;
  kit_id?: string;
  commission_id?: string;
  product_selections?: ProductSelection[];  // NOVO
}
```

#### Backend - Controller (`registrationsController.ts`)

**Controller atualizado para receber e passar `product_selections`:**
```typescript
const { email, event_id, category_id, kit_id, commission_id, product_selections } = req.body;

// ...

const registrationData = {
  event_id,
  category_id,
  kit_id: kit_id || undefined,
  runner_id: athlete.id,
  registered_by: req.user.id,
  total_amount: totalAmount,
  payment_method: 'pix' as const,
  coupon_code: couponCode,
  product_selections: product_selections || undefined,  // NOVO
};
```

## Observações

### Atributos em Inscrições do Líder

O backend agora aceita `product_selections` quando o líder cria uma inscrição. No entanto, o frontend do líder (`LeaderDashboard.tsx`) atualmente **não envia** `product_selections` porque não há interface para selecionar produtos/variantes no painel do líder.

**Para que os atributos apareçam completamente:**
1. ✅ Backend já aceita `product_selections` (implementado)
2. ⚠️ Frontend do líder precisa ser atualizado para incluir interface de seleção de produtos/variantes (futuro)

**Inscrições feitas pelo organizador ou pelo próprio atleta:**
- ✅ Já incluem `product_selections` corretamente
- ✅ Atributos são exportados no CSV

## Estrutura Final do CSV

| Coluna | Descrição | Formato |
|--------|-----------|---------|
| NUMERO | Número sequencial | 1, 2, 3... |
| NOME MINUSCULO | Nome em minúsculas | joão silva |
| NOME | Nome em maiúsculas | JOÃO SILVA |
| CPF | CPF formatado | 123.456.789-00 |
| E-MAIL | Email do corredor | email@exemplo.com |
| EQUIPE | Equipe do corredor | Nome da Equipe |
| SEXO | Gênero | M ou F |
| NASCIMENTO | Data de nascimento | DD/MM/AAAA |
| CATEGORIA | Categoria | Nome da Categoria |
| KIT | Kit selecionado | Nome do Kit |
| VARIAÇÃO | Variação do kit | (vazio por enquanto) |
| ATRIBUTO | Atributos selecionados | Tamanho: P; Cor: Azul |
| MODALIDADE | Modalidade | Nome da Modalidade |
| DATA HORA INSCRIÇÃO | Data/hora da inscrição | DD/MM/AAAA HH:MM:SS |
| MEIO DE PAGAMENTO | Método de pagamento | PIX, Cartão de Crédito, etc. |
| VALOR | Valor sem taxa da plataforma | 100,00 |
| LÍDER | Nome do líder (se aplicável) | Nome do Líder |

## Testes Recomendados

1. ✅ Exportar CSV e verificar se CPF, E-mail e Equipe aparecem
2. ✅ Verificar formatação do CPF (XXX.XXX.XXX-XX)
3. ✅ Verificar se atributos aparecem em inscrições feitas pelo organizador
4. ⚠️ Verificar se atributos aparecem em inscrições feitas pelo líder (quando frontend for atualizado)
