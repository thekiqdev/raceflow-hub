/** Snapshot é imutável; a titularidade atual é explicitamente versionada. */
export function currentTicketIdentity(row:any) {return row.checkout_current_identity ?? row.snapshot?.identity;}
export function ticketVersion(row:any) {return Number(row.checkout_ticket_version ?? 0);}
