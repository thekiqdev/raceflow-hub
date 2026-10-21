/** Snapshot é imutável; a titularidade atual é explicitamente versionada. */
export function currentTicketIdentity(row:any) {return row.checkout_current_identity ?? row.snapshot?.identity;}
export function ticketVersion(row:any) {return Number(row.checkout_ticket_version ?? 0);}

export type CheckoutBuyerContact = { email?: string | null; phone?: string | null };

/**
 * Aplica identidade do pedido (snapshot / checkout_current_identity) e contato do comprador
 * nos campos runner_* usados por listagem, detalhe e CSV.
 * Sprint 2: needs_preregistration = order sem runner_id (pré-cadastro ainda não ligado).
 */
export function applyCheckoutIdentityOverlay(
  row: any,
  snapshot: { identity?: any; labels?: any } | null | undefined,
  buyer?: CheckoutBuyerContact | null,
  options?: { overlayLabels?: boolean }
): any {
  if (!row?.order_id) {
    row.needs_preregistration = false;
    return row;
  }

  const identity = snapshot?.identity ?? {};
  const labels = snapshot?.labels ?? {};
  const overlayLabels = options?.overlayLabels !== false;

  if (identity.fullName) row.runner_name = identity.fullName;
  if (identity.cpf) row.runner_cpf = identity.cpf;
  else if (row.participant_cpf && !row.runner_cpf) row.runner_cpf = row.participant_cpf;

  if (identity.gender && (!row.runner_gender || !row.runner_id)) {
    row.runner_gender = identity.gender;
  }
  if (identity.birthDate && (!row.runner_birth_date || !row.runner_id)) {
    row.runner_birth_date = identity.birthDate;
  }

  // Contato: perfil do titular → e-mail do snapshot → comprador do pedido.
  if (!row.runner_email) {
    row.runner_email = identity.email || buyer?.email || null;
  }
  if (!row.runner_phone) {
    row.runner_phone = buyer?.phone || null;
  }
  // Sem conta: Sprint 1 exige telefone/e-mail do comprador na planilha.
  if (!row.runner_id) {
    if (buyer?.email) row.runner_email = identity.email || buyer.email;
    if (buyer?.phone) row.runner_phone = buyer.phone;
  }

  if (overlayLabels) {
    if (labels.category) row.category_name = labels.category;
    if (labels.modality) row.modality_name = labels.modality;
    if (labels.kit) row.kit_name = labels.kit;
  }

  // Preparação Sprint 2: titular do pedido ainda sem conta no sistema.
  row.needs_preregistration = !row.runner_id;
  return row;
}
