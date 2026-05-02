# Fluxos de criação de inscrição com kit / produto variável / `registration_product_selections`

Documento de apoio à fase de **consistência na criação**. Data de referência: investigação prévia + auditoria read-only (`registration_product_selections` como fonte canônica).

## Fluxos que criam inscrição com possível `product_selections`

| Fluxo | Entrada principal | Formato típico de `product_selections` | Observações |
|--------|-------------------|----------------------------------------|-------------|
| Inscrição pública (`RegistrationFlow` → `POST /registrations`) | Runner autenticado | `{ product_id, variant_id?, attribute_selections? }` por produto escolhido no kit | Normalmente envia `variant_id` e/ou `attribute_selections` quando há produto variável. |
| Staff organizador / super admin (`registerAthleteByStaff` → `createRegistration`) | `RegisterAthleteStaffDialog` etc. | Igual acordo API | Depende do formulário enviar seleções quando o kit tem variáveis. |
| Criação via `createRegistration` em qualquer controller que reutilize o serviço | Vários | Idem | Todos convergem em `registrationsService.createRegistration`. |
| Completar convite (`CompleteInvitationModal` → `completeInvitation` / `completeInvitationRegistration`) | Corredor com inscrição `convidado` | Só `product_id` + `variant_id` (sem `attribute_selections`) | Backend expande `variant_id` com `kit_products.variant_attributes` + parse do nome da variante (`" - "`) ou linha sintética `attribute_name = 'Variante'`. **Já valida** kit variável antes de atualizar. |

## Fragilidade histórica (antes do modo estrito)

Em `createRegistration`, falhas ao gravar `registration_product_selections` eram **capturadas e apenas logadas**, mantendo a inscrição — gerando o cenário que a auditoria detecta (kit variável + zero linhas).

O fluxo **`completeInvitationRegistration`** já exige seleções quando o kit tem produtos variáveis.

## Parse só com `variant_id` (convites)

- Confiança: boa quando existe linha em `product_variants`, `kit_products.variant_attributes` está preenchido e o nome da variante segue o formato esperado para split (`" - "`).
- Se `variant_attributes` estiver vazio, o backend usa fallback **Variante** + nome completo — ainda persiste linhas.
- Risco residual: nome da variante sem separadores esperados com vários atributos pode alinhar mal índices atributo/valor (cenário raro se UI só permite variantes válidas).

## Variável de ambiente `STRICT_KIT_SELECTIONS`

Quando `true` / `1` / `yes`:

1. Validação **antes** do `INSERT` em `registrations`: kit com produto variável com `variant_attributes` não vazio exige payload com seleção por produto (`variant_id` ou `attribute_selections`).
2. Erros ao persistir seleções **não são ignorados**; para inscrições que não são slot `free_bonus`, a inscrição recém-criada pode ser **removida** após falha.
3. Verificação **após** persistência: se o kit exige seleções canônicas e `COUNT(registration_product_selections)` continua 0, falha e remove inscrição não-convite quando aplicável.

Convites (`free_bonus`): não é seguro apagar a linha de `registrations` por causa de possível vínculo em `leader_invitations` (`bonus_registration_id`); em caso de falha grave, permanece log crítico para revisão manual — cenário esperado raro se o payload foi validado antes.
