import { query, withTransaction } from '../config/database.js';
import { fetchCpfFromBrasilApi } from './cpfBrasilClient.js';
import { mapSexoToProfileGender } from './cpfLookupService.js';
import { isValidCpfDigits, normalizeCpfDigits, formatCpf } from '../utils/cpf.js';
import { validateFullName } from '../utils/profileValidation.js';
import { z } from 'zod';

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
function cpfDigits(value: string) {
  const cpf = normalizeCpfDigits(value);
  if (!isValidCpfDigits(cpf)) throw fail('CPF inválido.');
  return cpf;
}
function birthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw fail('Data de nascimento inválida.');
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
      || value < '1900-01-01' || value > new Date().toISOString().slice(0, 10)) {
    throw fail('Data de nascimento inválida.');
  }
  return value;
}
async function account(cpf: string) {
  const result = await query(`SELECT p.id FROM profiles p JOIN users u ON u.id = p.id
    WHERE regexp_replace(COALESCE(p.cpf::text,''), '[^0-9]', '', 'g') = $1 LIMIT 2`, [cpf]);
  if (result.rows.length > 1) throw fail('Não foi possível identificar este participante. Contate o suporte.', 409);
  return (result.rows[0]?.id as string | undefined) ?? null;
}
export async function checkParticipantCpf(rawCpf: string) {
  return { registered: Boolean(await account(cpfDigits(rawCpf))) };
}
async function eventAvailable(eventId: string) {
  const result = await query("SELECT id FROM events WHERE id=$1 AND status IN ('published','ongoing')", [eventId]);
  if (!result.rows.length) throw fail('Evento indisponível para inscrição.', 404);
}
async function useAccount(id: string) {
  return (await query(`UPDATE checkout_participants SET identity_source='account', full_name=NULL,
    birth_date=NULL, gender=NULL, gender_locked=false, email=NULL, delivery_mode='account', ready=true,
    updated_at=now() WHERE id=$1 RETURNING *`, [id])).rows[0];
}
function publicParticipant(row: any) {
  const common = { id: row.id, registered: row.identity_source === 'account', cpf_masked: formatCpf(row.cpf),
    ready: row.ready, delivery_mode: row.delivery_mode, expires_at: row.expires_at };
  // Nunca serializar a linha do banco ou o perfil da conta nesta resposta.
  if (common.registered) return common;
  return { ...common, full_name: row.full_name, birth_date: row.birth_date instanceof Date
    ? row.birth_date.toISOString().slice(0, 10) : row.birth_date,
    gender: row.gender, gender_locked: row.gender_locked,
    manual_entry_allowed: row.identity_source === 'manual', email: row.email };
}

/** A dependência permite testar a fronteira do provedor sem consultas reais a CPFs. */
export function createParticipantsService(provider = fetchCpfFromBrasilApi) {
  async function assertParticipantNotRegistered(eventId: string, runnerId: string | null, cpf: string) {
    if (runnerId) {
      const existing = await query(`SELECT id FROM registrations r WHERE event_id=$1 AND runner_id=$2
        AND status<>'cancelled' AND NOT (status='transferred' AND transferred_to_registration_id IS NOT NULL)
        AND (COALESCE(payment_method::text,'')<>'free_bonus' OR EXISTS
          (SELECT 1 FROM leader_invitations li WHERE li.bonus_registration_id=r.id
           AND li.runner_id=r.runner_id AND li.status IN ('sent','used'))) LIMIT 1`, [eventId, runnerId]);
      if (existing.rows.length) throw fail('Este participante já possui inscrição neste evento.', 409);
      return;
    }
    const byCpf = await query(`SELECT r.id FROM registrations r
      LEFT JOIN profiles p ON p.id=r.runner_id
      WHERE r.event_id=$1
        AND COALESCE(r.participant_cpf, regexp_replace(COALESCE(p.cpf,''),'[^0-9]','','g'))=$2
        AND r.status<>'cancelled' AND NOT (r.status='transferred' AND r.transferred_to_registration_id IS NOT NULL)
        AND (COALESCE(r.payment_method::text,'')<>'free_bonus' OR EXISTS
          (SELECT 1 FROM leader_invitations li WHERE li.bonus_registration_id=r.id
           AND li.runner_id=r.runner_id AND li.status IN ('sent','used'))) LIMIT 1`, [eventId, cpf]);
    if (byCpf.rows.length) throw fail('Este participante já possui inscrição neste evento.', 409);
  }
  async function prepare(buyerId: string, input: { event_id: string; cpf: string; birth_date?: string; excluded_participant_ids?:string[] }) {
    const cpf = cpfDigits(input.cpf);
    await eventAvailable(input.event_id);
    // Incluir novamente não pode sobrescrever contato/escolhas de identidade já adicionada.
    if(input.excluded_participant_ids?.length && (await query(`SELECT id FROM checkout_participants
      WHERE buyer_id=$1 AND event_id=$2 AND cpf=$3 AND id=ANY($4::uuid[])`,
      [buyerId,input.event_id,cpf,input.excluded_participant_ids])).rows.length) throw fail('Este participante já está no pedido.',409);
    let source = 'account', name: string | null = null, dob: string | null = null;
    let gender: string | null = null, locked = false;
    if (!await account(cpf)) {
      if (!input.birth_date) throw fail('Informe a data de nascimento do participante.');
      dob = birthDate(input.birth_date);
      const result = await provider(cpf);
      if (!result.ok) {
        if (result.internalCode !== 'EXTERNAL_NOT_FOUND') {
          throw fail('Consulta de CPF indisponível. Tente novamente; nenhum cadastro foi considerado ausente.', 503);
        }
        // Regra específica da compra: ausência confirmada permite declaração manual.
        source = 'manual';
      } else {
        if (!result.payload || result.payload.cpf !== cpf || result.payload.nascIso !== dob) {
          throw fail('Não foi possível conferir o CPF e a data de nascimento informados.');
        }
        source = 'cpf_api';
        name = result.payload.nome.trim().replace(/\s+/g, ' ');
        const mapped = mapSexoToProfileGender(result.payload.sexoRaw);
        gender = mapped.gender || null;
        locked = mapped.locked;
      }
    }
    return withTransaction(async () => {
      // Reconsulta após a chamada externa: uma conta pode ter sido criada durante a consulta.
      const runnerId = await account(cpf);
      if (runnerId) { source = 'account'; name = dob = gender = null; locked = false; }
      await assertParticipantNotRegistered(input.event_id, runnerId, cpf);
      const row = (await query(`INSERT INTO checkout_participants
        (buyer_id,event_id,cpf,identity_source,full_name,birth_date,gender,gender_locked,delivery_mode,ready)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (buyer_id,event_id,cpf) DO UPDATE SET
          identity_source=EXCLUDED.identity_source, full_name=EXCLUDED.full_name,
          birth_date=EXCLUDED.birth_date, gender=EXCLUDED.gender, gender_locked=EXCLUDED.gender_locked,
          email=NULL,delivery_mode=EXCLUDED.delivery_mode,ready=EXCLUDED.ready,
          expires_at=now()+interval '24 hours',updated_at=now()
        RETURNING *`, [buyerId,input.event_id,cpf,source,name,dob,gender,locked,
        source === 'account' ? 'account' : 'buyer',source === 'account'])).rows[0];
      return publicParticipant(row);
    });
  }
  async function load(id: string, buyerId: string) {
    const result = await query(`SELECT * FROM checkout_participants WHERE id=$1 AND buyer_id=$2
      AND expires_at>now() FOR UPDATE`, [id,buyerId]);
    if (!result.rows.length) throw fail('Participante não encontrado ou identificação expirada.', 404);
    let row = result.rows[0];
    const runnerId = await account(row.cpf);
    if (runnerId && row.identity_source !== 'account') row = await useAccount(row.id);
    if (!runnerId && row.identity_source === 'account') throw fail('Identifique novamente o participante.', 409);
    return { row, runnerId };
  }
  async function get(id: string, buyerId: string) {
    return withTransaction(async () => publicParticipant((await load(id,buyerId)).row));
  }
  async function complete(id: string, buyerId: string, input: {
    full_name?: string; gender?: 'M'|'F'|'O'; email?: string | null; delivery_mode: 'buyer'|'email';
  }) {
    return withTransaction(async () => {
      const { row, runnerId } = await load(id,buyerId);
      if (runnerId) return publicParticipant(row); // Contato da conta nunca é substituído.
      const name = row.identity_source === 'manual' ? input.full_name?.trim().replace(/\s+/g,' ') : row.full_name;
      if (!validateFullName(name).valid) throw fail('Informe o nome completo do participante.');
      if (row.identity_source === 'cpf_api' && input.full_name && input.full_name.trim() !== row.full_name) {
        throw fail('O nome conferido na consulta não pode ser substituído.');
      }
      const gender = row.gender_locked ? row.gender : input.gender;
      if (!gender || !['M','F','O'].includes(gender)) throw fail('Informe o sexo do participante.');
      if (row.gender_locked && input.gender && input.gender !== row.gender) throw fail('O sexo conferido na consulta não pode ser substituído.');
      const email = input.delivery_mode === 'email' ? input.email?.trim().toLowerCase() : null;
      if (input.delivery_mode === 'email' && !z.string().email().safeParse(email).success) throw fail('Informe um e-mail válido ou acompanhe pela conta do comprador.');
      const saved = (await query(`UPDATE checkout_participants SET full_name=$2,gender=$3,email=$4,
        delivery_mode=$5,ready=true,updated_at=now() WHERE id=$1 RETURNING *`,
      [id,name,gender,email,input.delivery_mode])).rows[0];
      return publicParticipant(saved);
    });
  }
  /** Uso interno pelo futuro pedido. Não retornar este objeto em controllers. */
  async function resolveForCheckout(id: string, buyerId: string, eventId: string) {
    return withTransaction(async () => {
      const { row, runnerId } = await load(id,buyerId);
      if (row.event_id !== eventId) throw fail('Participante não pertence a este evento.', 404);
      await eventAvailable(eventId);
      if (!row.ready) throw fail('Complete os dados do participante.');
      if (runnerId) {
        await assertParticipantNotRegistered(eventId, runnerId, row.cpf);
      } else {
        await assertParticipantNotRegistered(eventId, null, row.cpf);
      }
      return { participantId:id, buyerId, eventId, cpf:row.cpf, runnerId:runnerId ?? null,
        fullName:row.full_name, birthDate:row.birth_date, gender:row.gender,
        email:row.email, deliveryMode:row.delivery_mode, identitySource:row.identity_source };
    });
  }
  function evaluateCategoryEligibility(ready: boolean, identity: {birth_date?: unknown; gender?: unknown} | null, category: {min_age?: number|null; max_age?: number|null; gender?: string|null}) {
    if (!ready) {
      return { eligible: false, message: 'Complete a identificação deste participante antes de escolher a categoria.' };
    }
    const gender = String(identity?.gender ?? '').toUpperCase();
    const normalized = gender === 'M' || gender === 'MASCULINO' ? 'masculino' : gender === 'F' || gender === 'FEMININO' ? 'feminino' : null;
    const categoryGender = category.gender || 'ambos';
    if (categoryGender !== 'ambos' && categoryGender !== normalized) {
      return { eligible: false, message: categoryGender === 'masculino' ? 'Categoria exclusiva para masculino.' : 'Categoria exclusiva para feminino.' };
    }
    const hasMin = !!(category.min_age && category.min_age > 0);
    const hasMax = !!(category.max_age && category.max_age > 0);
    if (hasMin || hasMax) {
      const dob = identity?.birth_date ? new Date(identity.birth_date as string | Date) : null;
      if (!dob || Number.isNaN(dob.getTime())) {
        return { eligible: false, message: 'Informe a data de nascimento para esta categoria.' };
      }
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;
      if (hasMin && age < category.min_age!) {
        return { eligible: false, message: `Idade mínima desta categoria: ${category.min_age} anos.` };
      }
      if (hasMax && age > category.max_age!) {
        return { eligible: false, message: `Idade máxima desta categoria: ${category.max_age} anos.` };
      }
    }
    return { eligible: true };
  }
  async function eligibility(id: string, buyerId: string, categoryId: string) {
    return withTransaction(async () => {
      const { row, runnerId } = await load(id,buyerId);
      const category = (await query('SELECT min_age,max_age,gender FROM categories WHERE id=$1 AND event_id=$2', [categoryId,row.event_id])).rows[0];
      if (!category) throw fail('Categoria inválida para o evento.');
      const identity = runnerId ? (await query('SELECT birth_date,gender FROM profiles WHERE id=$1',[runnerId])).rows[0] : row;
      return evaluateCategoryEligibility(row.ready, identity, category);
    });
  }
  /** Uma leitura de identidade; filtra a lista de categorias na UI sem N+1. */
  async function eligibilityBatch(id: string, buyerId: string, categoryIds: string[]) {
    const unique = [...new Set(categoryIds)];
    if (!unique.length) return { results: [] as Array<{category_id:string;eligible:boolean;message?:string}> };
    if (unique.length > 100) throw fail('Muitas categorias para conferir de uma vez.');
    return withTransaction(async () => {
      const { row, runnerId } = await load(id,buyerId);
      const identity = runnerId ? (await query('SELECT birth_date,gender FROM profiles WHERE id=$1',[runnerId])).rows[0] : row;
      const categories = (await query(
        'SELECT id,min_age,max_age,gender FROM categories WHERE event_id=$1 AND id = ANY($2::uuid[])',
        [row.event_id, unique],
      )).rows as Array<{id:string;min_age:number|null;max_age:number|null;gender:string}>;
      const byId = new Map(categories.map(c=>[c.id,c]));
      return {
        results: unique.map(categoryId => {
          const category = byId.get(categoryId);
          if (!category) return { category_id: categoryId, eligible: false, message: 'Categoria inválida para o evento.' };
          return { category_id: categoryId, ...evaluateCategoryEligibility(row.ready, identity, category) };
        }),
      };
    });
  }
  /** O pedido deve usar esta resolução dentro da transação de fechamento, antes de reservar. */
  async function resolveManyForCheckout(ids: string[], buyerId: string, eventId: string) {
    if (!ids.length || new Set(ids).size !== ids.length) throw fail('Há participante repetido ou a lista está vazia.');
    return withTransaction(async () => {
      const participants: Awaited<ReturnType<typeof resolveForCheckout>>[] = [];
      // Ordem estável evita inversão de bloqueios entre duas revisões do mesmo grupo.
      for (const id of [...ids].sort()) participants.push(await resolveForCheckout(id,buyerId,eventId));
      if (new Set(participants.map(p=>p.cpf)).size !== participants.length) throw fail('O mesmo CPF não pode participar duas vezes do pedido.');
      return ids.map(id=>participants.find(p=>p.participantId===id)!);
    });
  }
  return { prepare, get, complete, resolveForCheckout, resolveManyForCheckout, eligibility, eligibilityBatch };
}
export const checkoutParticipants = createParticipantsService();
