import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
const base=process.env.CHECKOUT_UI_TEST_URL || 'http://127.0.0.1:5186';
assert.equal(new URL(base).hostname,'127.0.0.1');
const browser=await chromium.launch({channel:'msedge',headless:true});
await mkdir('tmp/ux-stage-d',{recursive:true});
let checks=0;
const sampleCard=async(page)=>{
  const form=page.getByLabel('Pagamento com cartão de crédito');
  await form.getByPlaceholder('0000 0000 0000 0000',{exact:true}).fill('4111111111111111');
  await form.getByPlaceholder('NOME COMPLETO',{exact:true}).fill('Teste Comprador');
  await form.getByPlaceholder('MM',{exact:true}).fill('12');
  await form.getByPlaceholder('AAAA',{exact:true}).fill('2030');
  await form.locator('input[type="password"]').fill('123');
  await form.getByRole('textbox',{name:'Nome Completo',exact:true}).fill('Teste Comprador');
  await form.getByRole('textbox',{name:'E-mail',exact:true}).fill('comprador@example.test');
  await form.getByRole('textbox',{name:'CPF',exact:true}).fill('529.982.247-25');
  await form.getByRole('textbox',{name:'CEP',exact:true}).fill('01310-100');
  await form.getByRole('textbox',{name:'Número',exact:true}).fill('100');
  await form.getByRole('textbox',{name:'Telefone',exact:true}).fill('(11) 99999-9999');
};
try {
  for(const width of [1366,390,320]) {
    const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();page.setDefaultTimeout(12000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const future=()=>new Date(Date.now()+900000).toISOString();
    const person={id:'self',registered:true,ready:true,cpf_masked:'***.***.247-**',delivery_mode:'account',expires_at:'2099-01-01'};
    const item={id:'item',participant_id:'self',position:0,choices:{category_id:'cat',modality_id:'mod'},participant:person,pricing:{subtotal:100,seniorDiscount:0,couponDiscount:10,platformFee:5,total:95},labels:{category:'Geral',modality:'5 km',kit:null,batch:null,products:[]}};
    const fresh=()=>({id:'order',event_id:'event',status:'reserved',version:1,total_cents:9500,reservation_expires_at:future(),review_expires_at:future(),items:[structuredClone(item)]});
    let order=fresh(),payment=null,payCalls=0,keys=[],failResponse=false,refreshCalls=0,cancelCalls=0,lastPayBody=null;
    const attempt=(status,method='CREDIT_CARD')=>({id:'pay',status,method,amount_cents:order.total_cents,invoice_url:status==='pending' && method==='PIX'?'https://sandbox.asaas.com/i/fake':null,pix_qr_code:status==='pending' && method==='PIX'?'00020126580014br.gov.bcb.pix0136payment-ui':null,expires_at:future(),cancel_requested:false,keep_reservation:false,issue:null});
    await page.route('**/*',async route=> {
      const req=route.request(),url=new URL(req.url());
      if(url.origin===base && !url.pathname.startsWith('/api/')) return route.continue();
      if(!url.pathname.includes('/api/')) return route.abort();
      const path=url.pathname.split('/api/')[1],method=req.method(),body=req.postDataJSON();
      const ok=data=>route.fulfill({json:{success:true,data}});
      if(path.startsWith('categories/event/')) return ok([{id:'cat',name:'Geral',price:100,modality_ids:['mod'],batches:[],custom_fields:[]}]);
      if(path.endsWith('/kits')) return ok([]);
      if(path.startsWith('modalities/event/')) return ok([{id:'mod',name:'Corrida',distance:'5 km'}]);
      if(path==='checkout-participants/self') return ok(person);
      if(path==='checkout-orders' || path==='checkout-orders/order') return ok(order);
      if(path==='checkout-orders/order/review') {order={...order,status:'reviewed',review_expires_at:future(),version:order.version+1};return ok(order);}
      if(path==='checkout-orders/order/reserve') {order={...order,status:'reserved',reservation_expires_at:future(),version:order.version+1};return ok(order);}
      if(path==='checkout-orders/order/unreserve') {
        payment=null;
        order={...order,status:'reviewed',reservation_expires_at:null,review_expires_at:future(),version:order.version+1};
        return ok(order);
      }
      if(path==='checkout-orders/order/payment') {
        if(method==='GET') {refreshCalls++;return ok(payment);}
        payCalls++;keys.push(body.request_key);lastPayBody=body;
        if(body.method==='CREDIT_CARD' && !body.credit_card_token && (!body.credit_card || !body.credit_card_holder_info)) {
          return route.fulfill({status:400,json:{success:false,error:'Informe os dados do cartão para confirmar o pagamento.'}});
        }
        payment={...attempt(order.total_cents===0?'paid':'pending',order.total_cents===0?'FREE':body.method)};
        order.status=order.total_cents===0?'confirmed':'awaiting_payment';
        await new Promise(resolve=>setTimeout(resolve,150));
        if(failResponse) {failResponse=false;return route.abort('failed');}
        return ok(payment);
      }
      if(path==='checkout-orders/order/payment/tokenize') {
        if(!body.credit_card?.number || !body.credit_card_holder_info) {
          return route.fulfill({status:400,json:{success:false,error:'Informe os dados do cartão.'}});
        }
        return ok({credit_card_token:`tok_${String(body.credit_card.number).slice(-4)}`,brand:'VISA',last4:String(body.credit_card.number).slice(-4)});
      }
      if(path==='checkout-orders/order/payment/switch') {
        // Após a troca concluir, a tentativa fica cancelled (cancel_requested pode permanecer no registro).
        payment={...payment,status:'cancelled',cancel_requested:true,keep_reservation:true,invoice_url:null,pix_qr_code:null};
        order={...order,status:'reserved',version:order.version+1};
        return ok(payment);
      }
      if(path==='checkout-orders/order/cancel') {cancelCalls++;payment={...payment,cancel_requested:true,keep_reservation:false,invoice_url:null};return ok(order);}
      throw new Error(`API inesperada: ${method} ${path}`);
    });
    const button=name=>page.getByRole('button',{name,exact:true});
    const start=()=>page.getByRole('button',{name:/^Gerar pagamento único/});
    const copyPix=()=>page.getByRole('button',{name:'Copiar chave Pix',exact:true});
    const confirmCard=()=>page.getByRole('button',{name:'Confirmar Pagamento',exact:true});
    async function visit(query='') {await page.goto(`${base}/backend/tests/fixtures/checkoutPayment.html${query}`);await page.getByRole('heading',{name:'Corrida de teste'}).waitFor();await page.waitForFunction(()=>!document.body.textContent.includes('Preparando sua inscrição…'));}
    // Revisão usa preços do servidor; editar abre exatamente o participante escolhido.
    order.status='reviewed';await visit();await button('Reservar e ir para pagamento').waitFor();
    await page.getByRole('button',{name:'Editar Participante 1',exact:true}).click();
    assert.equal(await page.locator('#choices-self').isVisible(),true);checks++;
    await page.locator('button[aria-expanded="true"]').first().click();
    await button('Revisar inscrição').click();await button('Reservar e ir para pagamento').waitFor();
    await page.screenshot({path:`tmp/ux-stage-d/review-${width}.png`,fullPage:true});
    assert.ok(await button('Reservar e ir para pagamento').isVisible());checks++;
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));checks++;
    order.review_expires_at='2000-01-01';await page.reload();await button('Atualizar revisão').click();
    await button('Reservar e ir para pagamento').click();await start().waitFor();checks++;
    assert.ok(await button('Revisão').isVisible());checks++;
    const steps=()=>page.getByRole('list',{name:'Etapas da compra'});
    await steps().getByRole('button',{name:'2. Revisão',exact:true}).click();
    await button('Reservar e ir para pagamento').waitFor();
    assert.equal(order.status,'reviewed');
    assert.match(await steps().locator('li[aria-current="step"]').innerText(),/Revisão/);checks++;
    await steps().getByRole('button',{name:'1. Participantes',exact:true}).click();
    await steps().locator('li[aria-current="step"]').filter({hasText:'Participantes'}).waitFor();
    assert.equal(order.status,'reviewed');checks++;
    if(await page.locator('button[aria-expanded="true"]').count()) await page.locator('button[aria-expanded="true"]').first().click();
    await button('Revisar inscrição').click();
    await button('Reservar e ir para pagamento').waitFor();
    await button('Reservar e ir para pagamento').click();await start().waitFor();checks++;
    await visit('?cardOnly');await confirmCard().waitFor();
    assert.equal(await page.getByRole('radio',{name:'Pix',exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole('radio',{name:'Cartão de crédito',exact:true}).isChecked(),true);checks++;
    assert.equal(await start().count(),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;
    const methodBounds=await page.getByRole('radio',{name:'Cartão de crédito',exact:true}).locator('..').boundingBox();
    const formBounds=await page.getByLabel('Pagamento com cartão de crédito').boundingBox();
    assert.ok(formBounds.y>=methodBounds.y+methodBounds.height);checks++;
    await page.screenshot({path:`tmp/ux-stage-d/payment-${width}.png`,fullPage:true});
    await sampleCard(page);
    await confirmCard().evaluate(el=>{el.click();el.click();});
    await page.getByRole('heading',{name:'Confirmando pagamento no cartão'}).waitFor();
    assert.equal(payCalls,1);assert.equal(payment.method,'CREDIT_CARD');
    assert.ok(lastPayBody?.credit_card?.number);assert.ok(lastPayBody?.credit_card_holder_info);
    assert.equal(lastPayBody?.credit_card_token,undefined);checks++;
    await page.reload();await page.getByText('Meio escolhido:',{exact:false}).waitFor();assert.equal(payCalls,1);checks++;
    const beforeFocus=refreshCalls;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(350);assert.ok(refreshCalls>beforeFocus);assert.equal(payCalls,1);checks++;
    const beforeVisible=refreshCalls;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(350);assert.ok(refreshCalls>beforeVisible);assert.equal(payCalls,1);checks++;
    payment.status='paid';payment.invoice_url=null;order.status='confirmed';
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByRole('heading',{name:'Pedido confirmado'}).waitFor();
    assert.equal(await button('Cancelar pedido').count(),0);assert.equal(await page.getByRole('link',{name:/Abrir pagamento/}).count(),0);checks++;
    // Retomar falha definitiva libera outro meio e cria uma nova chave apenas nessa condição.
    order=fresh();payment=attempt('failed');await visit();
    await page.getByRole('radio',{name:'Pix',exact:true}).locator('..').click();
    await page.getByRole('button',{name:/^Tentar novamente/}).click();
    await copyPix().waitFor();
    assert.equal(payment.method,'PIX');assert.notEqual(keys[0],keys[1]);checks++;
    const pixKey=payment.pix_qr_code;const payCallsAfterPix=payCalls;
    // Voltar: só reabre a seleção; no seletor o Voltar/abas voltam à revisão.
    await button('Voltar').click();
    await page.getByRole('radio',{name:'Pix',exact:true}).waitFor();
    assert.ok(await button('Revisão').isVisible());
    assert.ok(await page.getByRole('list',{name:'Etapas da compra'}).getByRole('button',{name:'2. Revisão',exact:true}).isEnabled());checks++;
    await button('Tentar novamente').click();
    await copyPix().waitFor();
    assert.equal(payment.pix_qr_code,pixKey);assert.equal(payCalls,payCallsAfterPix);assert.equal(payment.status,'pending');checks++;
    await button('Voltar').click();
    await page.getByRole('list',{name:'Etapas da compra'}).getByRole('button',{name:'2. Revisão',exact:true}).click();
    await button('Reservar e ir para pagamento').waitFor();
    assert.equal(order.status,'reviewed');checks++;
    await button('Reservar e ir para pagamento').click();await start().waitFor();
    await start().click();await copyPix().waitFor();
    // Troca para cartão: abandona Pix e libera formulário.
    await button('Voltar').click();
    await page.getByRole('radio',{name:'Cartão de crédito',exact:true}).locator('..').click();
    await button('Continuar com cartão').click();
    await confirmCard().waitFor();
    assert.equal(order.status,'reserved');assert.equal(payment.status,'cancelled');checks++;
    assert.equal(await page.getByRole('radio',{name:'Pix',exact:true}).isEnabled(),true);checks++;
    await page.getByRole('radio',{name:'Pix',exact:true}).locator('..').click();
    await page.getByRole('button',{name:/^Tentar novamente|^Gerar pagamento único/}).click();
    await copyPix().waitFor();
    assert.equal(payment.method,'PIX');checks++;
    await button('Voltar').click();
    await page.getByRole('radio',{name:'Cartão de crédito',exact:true}).locator('..').click();
    await button('Continuar com cartão').click();
    await confirmCard().waitFor();
    assert.equal(await page.getByRole('radio',{name:'Pix',exact:true}).isEnabled(),true);checks++;
    await sampleCard(page);await confirmCard().click();
    await page.getByRole('heading',{name:'Confirmando pagamento no cartão'}).waitFor();
    assert.equal(payment.method,'CREDIT_CARD');checks++;
    // Resposta perdida no Pix: retomar recupera a tentativa existente sem nova cobrança.
    order=fresh();payment=attempt('failed','PIX');await visit();failResponse=true;
    await page.getByRole('radio',{name:'Pix',exact:true}).locator('..').click();
    await page.getByRole('button',{name:/^Tentar novamente/}).click();await page.getByRole('alert').waitFor();
    const failedResponseKey=keys.at(-1);
    await page.getByRole('button',{name:/^Retomar tentativa/}).click();await copyPix().waitFor();
    assert.equal(keys.at(-1),failedResponseKey);checks++;
    const afterFailure=payCalls;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(350);
    await copyPix().waitFor();assert.equal(payCalls,afterFailure);checks++;
    for(const status of ['unknown','creating','preparing']) {
      order.status='awaiting_payment';payment=attempt(status,'PIX');await visit();
      await page.getByRole('heading',{name:status==='creating'?'Registrando o pagamento':status==='unknown'?'Conferindo a tentativa de pagamento':'Preparando seu pagamento'}).waitFor();
      assert.equal(await start().count(),0);assert.equal(await copyPix().count(),0);
      assert.equal(await button('Tentar preparar pagamento novamente').count(),status==='preparing'?1:0);checks++;
    }
    // Cartão em creating/unknown: sem formulário; preparing libera reenvio tokenizado.
    order.status='awaiting_payment';payment=attempt('creating','CREDIT_CARD');await visit();
    assert.equal(await confirmCard().count(),0);
    await page.getByRole('heading',{name:'Registrando o pagamento'}).waitFor();checks++;
    payment=attempt('unknown','CREDIT_CARD');await visit();
    assert.equal(await confirmCard().count(),0);
    await page.getByText('antes de preencher o cartão novamente',{exact:false}).waitFor();checks++;
    payment=attempt('preparing','CREDIT_CARD');await visit();
    await confirmCard().waitFor();
    await page.getByText('Reenvie o formulário do cartão',{exact:false}).waitFor();checks++;
    payment=attempt('pending','PIX');await visit();await copyPix().waitFor();
    assert.equal(await button('Voltar').count(),1);assert.equal(await button('Cancelar pedido').count(),0);checks++;
    await page.evaluate(()=>sessionStorage.clear());
    order=fresh();order.reservation_expires_at='2000-01-01';payment=null;await visit();await start().waitFor();assert.equal(await start().isDisabled(),true);checks++;
    order=fresh();payment=null;await visit('?noMethods');await page.getByText('Nenhum meio de pagamento está disponível neste momento.').waitFor();assert.equal(await start().isDisabled(),true);checks++;
    for(const status of ['needs_review','expired','cancelled','refunded']) {
      order={...fresh(),status};payment=null;await visit();await page.waitForTimeout(100);
      assert.equal(await start().count(),0);assert.equal(await copyPix().count(),0);checks++;
    }
    order={...fresh(),total_cents:0};payment=null;await visit('?noMethods');await button('Confirmar inscrições gratuitas').click();
    await page.getByText('Todas as inscrições gratuitas foram confirmadas.',{exact:false}).waitFor();assert.equal(payment.method,'FREE');checks++;
    assert.deepEqual(errors,[]);checks++;
    await context.close();
  }
  console.log(`${checks} verificações de revisão, meios, retomada, duplo clique e estados de pagamento aprovadas.`);
} finally {await browser.close();}
