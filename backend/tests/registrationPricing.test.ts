import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../src/config/database.js';
import { calculateRegistrationTotal, registrationPriceMatches, RegistrationPricingError } from '../src/services/registrationTotalService.js';

const base = {
  eventId: 'event', categoryId: 'category', kitId: null, modalityId: null,
  runnerId: 'runner', publicCheckout: true,
};

/** Executa o calculador real com leituras de catálogo controladas, sem conexão externa. */
function fixture(t: any, options: {
  categoryPrice?: string; kitPrice?: string; categoryMissing?: boolean; kitMissing?: boolean;
  batches?: { id: string; price: string; is_active: boolean }[];
  senior?: boolean; birthDate?: string; fee?: number; feeType?: string; feeMin?: number;
  coupon?: Record<string, unknown>; couponEvents?: string[];
} = {}) {
  t.mock.method(pool, 'query', async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM categories')) {
      assert.deepEqual(params, ['category', 'event']);
      return { rows: options.categoryMissing ? [] : [{ price: options.categoryPrice ?? '100.00' }] };
    }
    if (sql.includes('FROM category_batches')) return { rows: options.batches ?? [] };
    if (sql.includes('FROM event_kits')) {
      assert.deepEqual(params, ['kit', 'event']);
      return { rows: options.kitMissing ? [] : [{ price: options.kitPrice ?? '20.00' }] };
    }
    if (sql.includes('FROM system_settings')) return { rows: [{
      enabled_modules: { senior_discount_60_plus: options.senior ?? false, platform_fees: true },
      platform_fee: options.fee ?? 0, platform_fee_type: options.feeType ?? 'fixed',
      platform_fee_min: options.feeMin ?? 0,
    }] };
    if (sql.includes('FROM profiles')) return { rows: [{ birth_date: options.birthDate ?? '1940-01-01' }] };
    if (sql.includes('FROM events')) return { rows: [{ organizer_id: 'organizer' }] };
    if (sql.includes('FROM coupons')) return { rows: options.coupon ? [{
      id: 'coupon', code: 'PROMO', is_active: true, current_uses: 0, max_uses: null,
      expiration_date: null, leader_id: null, ...options.coupon,
    }] : [] };
    if (sql.includes('FROM coupon_events')) return { rows: (options.couponEvents ?? []).map(event_id => ({ event_id })) };
    throw new Error(`Consulta inesperada (nenhuma gravação é permitida na precificação): ${sql}`);
  });
}

describe('Precificação do checkout público', () => {
  it('usa preços do catálogo e soma kit e taxa fixa', async t => {
    fixture(t, { fee: 5 });
    const price = await calculateRegistrationTotal({ ...base, kitId: 'kit' });
    assert.equal(price.subtotal, 120);
    assert.equal(price.total, 125);
    assert.equal(price.platformFee, 5);
    assert.equal(registrationPriceMatches(0, price.total), false);
    assert.equal(registrationPriceMatches(124.99, price.total), false);
    assert.equal(registrationPriceMatches(125, price.total), true);
  });

  it('preserva lote gratuito mesmo com categoria base paga e taxa habilitada', async t => {
    fixture(t, { fee: 10, batches: [{ id: 'free', price: '0', is_active: true }] });
    const price = await calculateRegistrationTotal({ ...base, batchId: 'free' });
    assert.equal(price.categoryPrice, 0);
    assert.equal(price.total, 0);
    assert.equal(price.platformFee, 0);
  });

  it('cobra o lote selecionado em vez do preço base', async t => {
    fixture(t, { batches: [{ id: 'batch', price: '75', is_active: true }] });
    assert.equal((await calculateRegistrationTotal({ ...base, batchId: 'batch' })).total, 75);
  });

  it('impede omitir lote vigente para usar preço base menor', async t => {
    fixture(t, { categoryPrice: '0', batches: [{ id: 'batch', price: '90', is_active: true }] });
    await assert.rejects(() => calculateRegistrationTotal(base), /Selecione um lote vigente/);
  });

  it('rejeita lote vencido, futuro ou de outra categoria', async t => {
    fixture(t, { batches: [{ id: 'expired', price: '10', is_active: false }] });
    for (const batchId of ['expired', 'future', 'other-category']) {
      await assert.rejects(
        () => calculateRegistrationTotal({ ...base, batchId }),
        /lote vigente|lote selecionado não está disponível/
      );
    }
  });

  it('usa preço base quando a categoria não tem lotes cadastrados', async t => {
    fixture(t, { batches: [] });
    assert.equal((await calculateRegistrationTotal(base)).total, 100);
  });

  it('bloqueia inscrição se há lotes cadastrados mas nenhum vigente (evita fallback R$0)', async t => {
    fixture(t, { categoryPrice: '0', batches: [{ id: 'expired', price: '90', is_active: false }] });
    await assert.rejects(
      () => calculateRegistrationTotal(base),
      /Não há lote vigente|Selecione um lote vigente/
    );
  });

  it('não aceita categoria ou kit de outro evento', async t => {
    fixture(t, { categoryMissing: true });
    await assert.rejects(() => calculateRegistrationTotal(base), RegistrationPricingError);
    t.mock.restoreAll();
    fixture(t, { kitMissing: true });
    await assert.rejects(() => calculateRegistrationTotal({ ...base, kitId: 'kit' }), /Kit não encontrado/);
  });

  it('aplica cupom percentual após desconto por idade e então taxa mínima', async t => {
    fixture(t, { senior: true, fee: 5, feeType: 'percentage', feeMin: 4,
      coupon: { type: 'percentage', discount_value: 10 } });
    const price = await calculateRegistrationTotal({ ...base, couponCode: 'PROMO' });
    assert.equal(price.seniorDiscount, 50);
    assert.equal(price.couponDiscount, 5);
    assert.equal(price.platformFee, 4);
    assert.equal(price.total, 49);
  });

  it('limita cupom fixo ao saldo e não cobra taxa de inscrição gratuita', async t => {
    fixture(t, { senior: true, fee: 7, coupon: { type: 'fixed', discount_value: 200 } });
    const price = await calculateRegistrationTotal({ ...base, couponCode: 'PROMO' });
    assert.equal(price.couponDiscount, 50);
    assert.equal(price.platformFee, 0);
    assert.equal(price.total, 0);
  });

  it('bloqueia cupom inexistente inclusive em inscrição gratuita', async t => {
    fixture(t, { categoryPrice: '0' });
    await assert.rejects(() => calculateRegistrationTotal({ ...base, couponCode: 'INVALID' }), /Cupom não encontrado/);
  });

  it('bloqueia cupons inativos, expirados, esgotados e restritos a outro evento', async t => {
    const scenarios = [
      { coupon: { is_active: false }, expected: /inativo/ },
      { coupon: { expiration_date: '2000-01-01' }, expected: /expirado/ },
      { coupon: { max_uses: 1, current_uses: 1 }, expected: /limite de uso/ },
      { coupon: {}, couponEvents: ['another-event'], expected: /não é válido para este evento/ },
    ];
    for (const scenario of scenarios) {
      t.mock.restoreAll();
      fixture(t, scenario);
      await assert.rejects(() => calculateRegistrationTotal({ ...base, couponCode: 'PROMO' }), scenario.expected);
    }
  });

  it('não dá desconto por idade se o módulo está desabilitado ou atleta não tem idade', async t => {
    fixture(t);
    assert.equal((await calculateRegistrationTotal(base)).seniorDiscount, 0);
    t.mock.restoreAll();
    fixture(t, { senior: true, birthDate: '2010-01-01' });
    assert.equal((await calculateRegistrationTotal(base)).seniorDiscount, 0);
  });

  it('arredonda centavos e taxa percentual de forma consistente', async t => {
    fixture(t, { categoryPrice: '19.99', fee: 7.5, feeType: 'percentage' });
    const price = await calculateRegistrationTotal(base);
    assert.equal(price.platformFee, 1.5);
    assert.equal(price.total, 21.49);
    assert.equal(registrationPriceMatches(21.490000000001, price.total), true);
    assert.equal(registrationPriceMatches(NaN, price.total), false);
    assert.equal(registrationPriceMatches(Infinity, price.total), false);
  });

  it('rejeita preços de catálogo inválidos no checkout público', async t => {
    for (const categoryPrice of ['-10', 'invalid']) {
      t.mock.restoreAll();
      fixture(t, { categoryPrice });
      await assert.rejects(() => calculateRegistrationTotal(base), /Preço inválido/);
    }
  });

  it('mantém o modo administrativo de recálculo com lote histórico', async t => {
    fixture(t, { batches: [{ id: 'expired', price: '30', is_active: false }] });
    const price = await calculateRegistrationTotal({ ...base, publicCheckout: false, batchId: 'expired' });
    assert.equal(price.total, 30);
  });
});
