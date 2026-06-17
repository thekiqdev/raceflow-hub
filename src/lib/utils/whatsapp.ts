export function buildWhatsAppUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function normalizeWhatsAppDigits(phone: string): string | null {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");
  if (!digits || digits.length < 10) {
    return null;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  if (digits.startsWith("55")) {
    return digits;
  }

  return null;
}

export function buildClientContactWhatsAppMessage(): string {
  return `Olá!

Recebi sua mensagem enviada através da plataforma Cronoteam.

Em que posso ajudar?`;
}

export interface BuildContactWhatsAppMessageParams {
  eventName: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  eventUrl: string;
}

export function buildContactWhatsAppMessage(params: BuildContactWhatsAppMessageParams): string {
  const phoneLine = params.phone?.trim() || "Não informado";

  return `Olá!

Acabei de enviar uma mensagem através do site.

Evento:
${params.eventName}

Nome:
${params.name}

E-mail:
${params.email}

Telefone:
${phoneLine}

Assunto:
${params.subject}

Mensagem:
${params.message}

Link do evento:
${params.eventUrl}`;
}
