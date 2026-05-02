import type { Registration } from "@/lib/api/registrations";

export type RegistrationOriginKind = "courtesy" | "leader_coupon" | "commercial";

/**
 * Classificação operacional para listagem (cortesia vs paga vs cupom de líder).
 * Ordem: cortesia primeiro; depois cupom com líder; senão fluxo comercial.
 */
export function getRegistrationOriginKind(
  reg: Pick<Registration, "payment_method" | "payment_status" | "leader_id" | "coupon_code">
): RegistrationOriginKind {
  if (reg.payment_method === "free_bonus" || reg.payment_status === "convidado") {
    return "courtesy";
  }
  if (reg.leader_id) {
    return "leader_coupon";
  }
  if (reg.coupon_code) {
    return "leader_coupon";
  }
  return "commercial";
}

export function getRegistrationOriginBadge(reg: Registration): { label: string; className: string } {
  const kind = getRegistrationOriginKind(reg);
  if (kind === "courtesy") {
    return {
      label: "Cortesia / convidado",
      className: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200 border-amber-200",
    };
  }
  if (kind === "leader_coupon") {
    return {
      label: "Cupom / líder",
      className: "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200 border-violet-200",
    };
  }
  return {
    label: "Paga",
    className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200 border-emerald-200",
  };
}

export type RegistrationListTypeBadge = { label: string; className: string; hint?: string };

/**
 * Badge de “tipo” para listagem: separado do status de pagamento.
 * Prioridade: transferida → cortesia/convite → cupom/líder → cadastro por equipe/admin → comercial.
 */
export function getRegistrationListTypeBadge(reg: Registration): RegistrationListTypeBadge {
  if (reg.status === "transferred") {
    return {
      label: "Transferida",
      className:
        "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-600",
      hint: "Titularidade alterada; situação financeira aparece na coluna Pagamento.",
    };
  }

  const kind = getRegistrationOriginKind(reg);
  if (kind === "courtesy") {
    return {
      label: "Cortesia / convidado",
      className: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200 border-amber-200",
      hint: "Inclusão operacional ou convite sem cobrança comercial.",
    };
  }
  if (kind === "leader_coupon") {
    return {
      label: "Cupom / líder",
      className: "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200 border-violet-200",
      hint: "Associada a cupom ou líder de grupo.",
    };
  }

  const staffRegistration =
    reg.registered_by &&
    reg.runner_id &&
    reg.registered_by !== reg.runner_id;

  if (staffRegistration) {
    return {
      label: "Equipe / manual",
      className: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200 border-sky-200",
      hint: "Inscrição registrada por outro usuário (equipe ou painel).",
    };
  }

  return {
    label: "Comercial",
    className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200 border-emerald-200",
    hint: "Fluxo padrão de compra pelo atleta.",
  };
}
