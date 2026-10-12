import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Calendar, Clock, MapPin } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getEventById, type Event } from '@/lib/api/events';
import { GroupRegistrationFlow } from '@/components/registration/GroupRegistrationFlow';
import { CheckoutAuthPanel } from '@/components/registration/CheckoutAuthPanel';
import { Button } from '@/components/ui/button';
import { getReferralCoupon, saveReferralCoupon } from '@/lib/referralCouponCache';
import { formatDateOnlyBrasilia, formatTimeBrasilia } from '@/lib/utils';
import heroImage from '@/assets/hero-running.jpg';

export default function EventCheckout() {
  const { slug, id } = useParams();
  const [searchParams] = useSearchParams();
  const resumeOrderId = searchParams.get('pedido') || undefined;
  const forceNew = searchParams.get('novo') === '1' && !resumeOrderId;
  const reference = slug || id || '';
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setEvent(null);
    setError('');
    getEventById(reference)
      .then((result) => {
        if (!active) return;
        if (result.success && result.data) setEvent(result.data);
        else setError(result.error || 'Evento não encontrado.');
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar o evento. Tente novamente.');
      });
    return () => {
      active = false;
    };
  }, [reference, attempt]);

  const back = slug
    ? `/evento/${encodeURIComponent(slug)}`
    : `/events/${encodeURIComponent(id || '')}`;

  // A página também permite retomar pedidos existentes quando a entrada de novas compras estiver desligada.
  if (event?.event_type === 'EXTERNAL') return <Navigate to={back} replace />;

  if (error) {
    return (
      <main className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">Sua inscrição</h1>
        <p role="alert">{error}</p>
        <Button onClick={() => setAttempt((n) => n + 1)}>Tentar novamente</Button>
        <Link className="block underline" to={back}>
          Voltar ao evento
        </Link>
      </main>
    );
  }

  if (!event || authLoading) {
    return (
      <p role="status" className="p-6 text-center">
        Carregando sua inscrição…
      </p>
    );
  }

  const cupomParam = searchParams.get('cupom')?.trim() || undefined;
  const refParam = searchParams.get('ref')?.trim() || undefined;
  if (cupomParam || refParam) saveReferralCoupon(event.id, { cupom: cupomParam, ref: refParam });
  const referralCoupon =
    (cupomParam || getReferralCoupon(event.id)?.cupom || '').trim().toUpperCase() || undefined;
  const referralCode = (refParam || getReferralCoupon(event.id)?.ref || '').trim() || undefined;

  if (!user) {
    const locationLine = [
      event.location,
      event.city && event.state ? `${event.city} - ${event.state}` : event.city || event.state,
    ]
      .filter(Boolean)
      .join(', ');

    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
        <header className="relative shrink-0 overflow-hidden text-white">
          <div className="absolute inset-0">
            <img
              src={event.banner_url || heroImage}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                const t = e.currentTarget;
                if (!t.src.endsWith('hero-running.jpg')) t.src = heroImage;
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/25" />
          </div>
          <div className="relative z-10 px-3 pb-3 pt-2 sm:px-6 sm:pb-4 sm:pt-3">
            <div className="mx-auto flex w-full max-w-3xl items-start gap-2 lg:max-w-4xl">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 -ml-1 px-2 text-xs text-white hover:bg-white/15 hover:text-white sm:text-sm"
                asChild
              >
                <Link to={back}>← Voltar ao evento</Link>
              </Button>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-bold leading-tight drop-shadow sm:text-2xl lg:text-3xl">
                  {event.title}
                </h1>
                {(event.event_date || locationLine) && (
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/90 sm:mt-2 sm:text-sm">
                    {event.event_date && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {formatDateOnlyBrasilia(event.event_date)}
                      </span>
                    )}
                    {event.event_date && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {formatTimeBrasilia(event.event_date)}
                      </span>
                    )}
                    {!!locationLine && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{locationLine}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <CheckoutAuthPanel referralCode={referralCode} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-background">
      <GroupRegistrationFlow
        key={`${user.id}:${event.id}:${resumeOrderId || ''}:${forceNew ? 'novo' : ''}:${referralCoupon || ''}`}
        resumeOrderId={resumeOrderId}
        forceNew={forceNew}
        mode="page"
        open
        event={event}
        buyerId={user.id}
        referralCoupon={referralCoupon}
        onOpenChange={(open) => {
          if (!open) navigate(back, { viewTransition: true });
        }}
      />
    </div>
  );
}
