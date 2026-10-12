import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { checkParticipantCpf, prepareParticipant, completeParticipant, type CheckoutParticipant } from '@/lib/api/checkoutParticipants';

/** Identificação reutilizável pelo fluxo de pedido; não cria conta, inscrição ou cobrança. */
export function ParticipantIdentityForm({ eventId, onReady, onChange, excludedParticipantIds }: {
  eventId: string;
  onReady: (participant: CheckoutParticipant) => void;
  onChange?: () => void;
  excludedParticipantIds?:string[];
}) {
  const formId = useId();
  const version = useRef(0);
  const [cpf, setCpf] = useState('');
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [participant, setParticipant] = useState<CheckoutParticipant | null>(null);
  const [dob, setDob] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'M'|'F'|'O'|''>('');
  const [useBuyer, setUseBuyer] = useState(true);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    version.current++;
    setRegistered(null); setParticipant(null); setDob(''); setName(''); setGender('');
    setEmail(''); setUseBuyer(true); setError(''); setBusy(false);
    return () => { version.current++; };
  }, [eventId]);
  function resetCpf(value: string) {
    version.current++;
    setCpf(value.replace(/\D/g, '').slice(0,11));
    setRegistered(null); setParticipant(null); setDob(''); setName(''); setGender('');
    setEmail(''); setUseBuyer(true); setError(''); setBusy(false); onChange?.();
  }
  async function identify() {
    const current = ++version.current;
    setBusy(true); setError('');
    try {
      const check = await checkParticipantCpf(cpf);
      if (current !== version.current) return;
      if (!check.success || !check.data) throw new Error(check.error || check.message || 'Não foi possível consultar o CPF. Tente novamente.');
      setRegistered(check.data.registered);
      if (check.data.registered) {
        const prepared = await prepareParticipant({event_id:eventId,cpf,excluded_participant_ids:excludedParticipantIds});
        if (current !== version.current) return;
        if (!prepared.success || !prepared.data) throw new Error(prepared.error || 'Não foi possível identificar o participante.');
        setParticipant(prepared.data);
      }
    } catch (e) { if (current === version.current) setError(e instanceof Error ? e.message : 'Falha na consulta.'); }
    finally { if (current === version.current) setBusy(false); }
  }
  async function verifyBirth() {
    const current = ++version.current;
    setBusy(true); setError('');
    try {
      const result = await prepareParticipant({event_id:eventId,cpf,birth_date:dob,excluded_participant_ids:excludedParticipantIds});
      if (current !== version.current) return;
      if (!result.success || !result.data) throw new Error(result.error || 'Não foi possível conferir os dados.');
      setParticipant(result.data); setRegistered(result.data.registered);
      setName(result.data.full_name || ''); setGender(result.data.gender || '');
    } catch (e) { if (current === version.current) setError(e instanceof Error ? e.message : 'Falha na consulta.'); }
    finally { if (current === version.current) setBusy(false); }
  }
  async function save() {
    if (!participant) return;
    if (participant.registered) { onReady(participant); return; }
    const current = ++version.current;
    setBusy(true); setError('');
    try {
      const result = await completeParticipant(participant.id,{ full_name:name,gender:gender || undefined,
        delivery_mode:useBuyer?'buyer':'email',email:useBuyer?null:email });
      if (current !== version.current) return;
      if (!result.success || !result.data) throw new Error(result.error || 'Confira os dados do participante.');
      setParticipant(result.data); onReady(result.data);
    } catch (e) { if (current === version.current) setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { if (current === version.current) setBusy(false); }
  }
  return <div className="space-y-4" aria-busy={busy}>
    <div className="space-y-2">
      <Label htmlFor={`${formId}-cpf`}>CPF do participante</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id={`${formId}-cpf`} inputMode="numeric" autoComplete="off" value={cpf} onChange={e=>resetCpf(e.target.value)} />
        <Button type="button" disabled={busy || cpf.length!==11} onClick={identify}>Consultar CPF</Button>
      </div>
    </div>
    {registered !== null && <p role="status" className="text-sm">{registered?'Possui cadastro. Os dados serão conferidos pela plataforma.':'Não possui cadastro. Confira o nascimento para preencher os dados.'}</p>}
    {registered === false && !participant && <div className="space-y-2">
      <Label htmlFor={`${formId}-dob`}>Data de nascimento</Label>
      <Input id={`${formId}-dob`} type="date" value={dob} disabled={busy} onChange={e=>setDob(e.target.value)} />
      <Button type="button" onClick={verifyBirth} disabled={busy || !dob}>Conferir dados</Button>
    </div>}
    {participant && !participant.registered && <>
      <div className="space-y-2">
        <Label htmlFor={`${formId}-name`}>Nome completo</Label>
        <Input id={`${formId}-name`} value={name} readOnly={!participant.manual_entry_allowed} disabled={busy} onChange={e=>{setName(e.target.value);onChange?.();}} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${formId}-gender`}>Sexo</Label>
        <select id={`${formId}-gender`} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={gender} disabled={busy || participant.gender_locked} onChange={e=>{setGender(e.target.value as 'M'|'F'|'O');onChange?.();}}>
          <option value="">Selecione</option><option value="M">Masculino</option><option value="F">Feminino</option><option value="O">Outro</option>
        </select>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1" checked={useBuyer} disabled={busy} onChange={e=>{setUseBuyer(e.target.checked);onChange?.();}} />
        Usar minha conta para acompanhar este ingresso
      </label>
      {!useBuyer && <div className="space-y-2">
        <Label htmlFor={`${formId}-email`}>E-mail para receber a inscrição</Label>
        <Input id={`${formId}-email`} type="email" value={email} disabled={busy} onChange={e=>{setEmail(e.target.value);onChange?.();}} />
        <p className="text-sm text-muted-foreground">Após a confirmação, enviaremos a inscrição e a opção de completar o cadastro.</p>
      </div>}
      {useBuyer && <p className="text-sm text-muted-foreground">O e-mail do participante é opcional. O ingresso terá os dados de quem vai correr e poderá ser acompanhado na sua conta.</p>}
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {participant && <div className="flex flex-col gap-2 sm:flex-row">
      <Button type="button" className="w-full sm:w-auto" disabled={busy} onClick={save}>Salvar participante</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={()=>resetCpf(cpf)}>Alterar identificação</Button>
    </div>}
  </div>;
}
