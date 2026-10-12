import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
// Use runtime Playwright disponível na máquina; não instala navegadores ou dependências.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const base=process.env.CHECKOUT_UI_TEST_URL || 'http://127.0.0.1:5186';
assert.equal(new URL(base).hostname,'127.0.0.1');
const browser=await chromium.launch({channel:'msedge',headless:true});
let checks=0;
try {
  for(const viewport of [{width:1365,height:900},{width:390,height:844},{width:320,height:844}]) {
    const context=await browser.newContext({viewport});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let order=null,payment=null,payCalls=0,reserveCalls=0,failSave=false,failReserve=false;
    const people=new Map();
    const category={id:'cat',event_id:'event',name:'Categoria geral',price:100,modality_ids:['mod'],batches:[],custom_fields:[]};
    const kits=[{id:'kit',name:'Kit com camiseta',price:20,category_ids:['cat'],products:[{id:'shirt',name:'Camiseta',type:'variable',variants:[{id:'m',name:'Azul - M',available_quantity:8},{id:'g',name:'Azul - G',available_quantity:8}]}]}];
    await page.route('**/*',async route=> {
      const request=route.request(),url=new URL(request.url());
      if(url.origin===base && !url.pathname.startsWith('/api/')) {await route.continue();return;}
      if(!url.pathname.includes('/api/')) {await route.abort();return;}
      const path=url.pathname.split('/api/')[1],method=request.method(),body=request.postDataJSON();
      const ok=data=>route.fulfill({json:{success:true,data}});
      const bad=(message,status=409)=>route.fulfill({status,json:{success:false,error:message}});
      if(path.startsWith('categories/event/')) return ok([category]);
      if(path.endsWith('/kits')) return ok(kits);
      if(path.startsWith('modalities/event/')) return ok([{id:'mod',name:'Corrida',distance:'5 km'}]);
      if(path==='checkout-orders' && method==='POST') {
        order ??={id:'order',event_id:body.event_id,status:'draft',version:1,total_cents:0,items:[]};return ok(order);
      }
      if(path==='checkout-participants/check-cpf') return ok({registered:body.cpf!=='16899535009'});
      if(path==='checkout-participants' && method==='POST') {
        const id=body.cpf;
        if(body.excluded_participant_ids?.includes(id)) return bad('Este participante já está no pedido.');
        const registered=id!=='16899535009';
        const p={id,registered,cpf_masked:`***.***.${id.slice(6,9)}-**`,ready:registered,delivery_mode:registered?'account':'buyer',manual_entry_allowed:true,gender_locked:false,expires_at:'2099-01-01'};
        people.set(id,p);return ok(p);
      }
      if(path.startsWith('checkout-participants/')) {
        const id=path.split('/')[1];
        if(path.endsWith('/eligibility')) return ok({eligible:id!=='11144477735',message:'Participante não elegível para a categoria.'});
        if(method==='PATCH') {const p={...people.get(id),...body,ready:true};people.set(id,p);return ok(p);}
        return ok(people.get(id));
      }
      if(path==='checkout-orders/order' && method==='GET') return ok(order);
      if(path==='checkout-orders/order/items') {
        if(failSave) {failSave=false;return bad('Falha temporária ao salvar.',503);}
        if(body.version!==order.version) return bad('O pedido foi alterado. Recarregue a revisão.');
        order={...order,status:'draft',version:order.version+1,total_cents:0,items:body.items.map((i,n)=>({...i,id:`item${n}`,position:n}))};return ok(order);
      }
      if(path==='checkout-orders/order/review') {
        order={...order,status:'reviewed',version:order.version+1,total_cents:order.items.length*12000,review_expires_at:new Date(Date.now()+900000).toISOString(),
          items:order.items.map(i=>({...i,participant:people.get(i.participant_id),pricing:{subtotal:120,total:120,platformFee:0,seniorDiscount:0,couponDiscount:0},labels:{category:'Categoria geral',modality:'5 km',kit:'Kit com camiseta',products:[{product_id:'shirt',product_name:'Camiseta',variant_name:i.choices.product_selections?.[0]?.variant_id==='g'?'Azul - G':'Azul - M'}]}}))};return ok(order);
      }
      if(path==='checkout-orders/order/reserve') {
        reserveCalls++;
        if(failReserve) {failReserve=false;return bad('Valores ou dados foram atualizados. Revise o pedido novamente.');}
        order={...order,status:'reserved',version:order.version+1,reservation_expires_at:new Date(Date.now()+1200000).toISOString()};return ok(order);
      }
      if(path==='checkout-orders/order/unreserve') {
        payment=null;
        order={...order,status:'reviewed',version:order.version+1,reservation_expires_at:null,review_expires_at:new Date(Date.now()+900000).toISOString()};
        return ok(order);
      }
      if(path==='checkout-orders/order/payment') {
        if(method==='POST') {payCalls++;payment={id:'pay',method:body.method,status:'pending',amount_cents:order.total_cents,invoice_url:'https://sandbox.asaas.com/i/fake',pix_qr_code:body.method==='PIX'?'00020126580014br.gov.bcb.pix0136group-checkout-ui':null,expires_at:order.reservation_expires_at,cancel_requested:false,issue:null};order.status='awaiting_payment';}
        return ok(payment);
      }
      if(path==='checkout-orders/order/cancel') {order.status='cancelled';return ok(order);}
      throw new Error(`API inesperada: ${method} ${path}`);
    });
    await page.goto(`${base}/backend/tests/fixtures/groupCheckout.html`);
    const button=(name)=>page.getByRole('button',{name,exact:true});
    await button('Adicionar outro participante').waitFor();
    async function add(cpf,guest=false) {
      await button('Adicionar outro participante').click();
      await page.getByLabel('CPF do participante').fill(cpf);await button('Consultar CPF').click();
      if(guest) {
        await page.getByLabel('Data de nascimento').fill('1990-01-01');await button('Conferir dados').click();
        await page.getByLabel('Nome completo').fill('Maria Corredora');await page.getByLabel('Sexo',{exact:true}).selectOption('F');
        if(viewport.width>1000) {
          await page.getByLabel('Usar minha conta para acompanhar este ingresso').uncheck();
          await page.getByLabel('E-mail para receber a inscrição').fill('maria@example.test');
        }
      }
      await button('Salvar participante').click();await button('Adicionar outro participante').waitFor();
      await page.waitForTimeout(1300);
    }
    await add('52998224725');await add('16899535009',true);await add('11144477735');
    assert.equal(order.items.length,3);checks++;
    assert.equal(people.get('16899535009').delivery_mode,viewport.width>1000?'email':'buyer');checks++;
    await button('Adicionar outro participante').click();await page.getByLabel('CPF do participante').fill('52998224725');await button('Consultar CPF').click();
    await page.getByText('Este participante já está no pedido.',{exact:true}).waitFor();await button('Voltar à lista').click();
    assert.equal(order.items.length,3);checks++;
    // Completar fonte, mostrar incompatibilidade e copiar somente para quem pode receber.
    await page.getByRole('button',{name:/Participante 1.*Não iniciado/}).click();
    const panel=page.locator('#choices-52998224725');
    await panel.getByRole('radio',{name:'Categoria geral',exact:true}).locator('..').click();await page.waitForTimeout(1300);
    await panel.getByRole('radio',{name:'Kit com camiseta',exact:true}).locator('..').click();await page.waitForTimeout(1300);
    await panel.getByRole('radio',{name:'Azul - M',exact:true}).locator('..').click();await page.waitForTimeout(1300);
    await panel.getByRole('button',{name:'Aplicar a outros',exact:true}).click();
    await page.getByText('Participante não elegível para a categoria.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('checkbox').count(),2);
    assert.equal(await page.getByRole('checkbox').nth(1).isDisabled(),true);checks++;
    await button('Aplicar aos selecionados').click();await page.waitForTimeout(1300);
    assert.equal(order.items[1].choices.kit_id,'kit');assert.equal(order.items[2].choices.kit_id,undefined);checks++;
    await page.getByRole('button',{name:/Participante 3.*Não iniciado/}).click();
    await page.getByRole('button',{name:'Remover participante 3'}).click();await page.waitForTimeout(1300);
    // Erro de rede preserva alteração local e permite repetir o salvamento.
    await page.getByRole('button',{name:/Maria Corredora.*Escolhas completas/}).click();
    failSave=true;
    await page.locator('#choices-16899535009').getByRole('button',{name:/Camiseta:/}).click();
    await page.locator('#choices-16899535009').getByRole('radio',{name:'Azul - G',exact:true}).locator('..').click();
    await page.getByText('Falha temporária ao salvar.',{exact:true}).waitFor();
    await page.locator('#choices-16899535009').getByRole('button',{name:/Camiseta: Azul - G/}).waitFor();checks++;
    await button('Salvar agora').click();await page.waitForTimeout(300);
    // Conclusão individual salva e recolhe o painel; cópia pelo destino exige confirmação.
    await page.locator('#choices-16899535009').getByRole('button',{name:'Concluir participante',exact:true}).click();
    await page.getByText('Escolhas salvas. Você pode adicionar participantes ou revisar o pedido.',{exact:true}).waitFor();
    assert.equal(await page.locator('#choices-16899535009').isVisible(),false);checks++;
    await page.getByRole('button',{name:/Participante 1.*Escolhas completas/}).click();
    await page.locator('#choices-52998224725').getByRole('button',{name:/Extras/}).click();
    await page.locator('#choices-52998224725').getByLabel('Cupom deste participante (opcional)').fill('GRUPO');await page.waitForTimeout(1300);
    await page.getByRole('button',{name:/Maria Corredora.*Escolhas completas/}).click();
    await page.locator('#choices-16899535009').getByRole('button',{name:'Copiar de outro participante',exact:true}).click();
    await page.locator('[aria-label="Escolher origem da cópia"]').getByRole('button',{name:'Participante 1',exact:true}).click();
    const preview=page.getByRole('region',{name:'Aplicar escolhas a outros participantes'});
    await preview.getByText('Compatível com a categoria.',{exact:false}).waitFor();
    assert.equal(await button('Aplicar aos selecionados').isDisabled(),true);
    assert.equal(await preview.getByLabel('Aplicar também o cupom da origem, sujeito à validação individual').isChecked(),false);checks++;
    await preview.getByLabel(/Confirmo substituir as escolhas existentes/).check();
    await button('Aplicar aos selecionados').click();await page.waitForTimeout(1300);
    assert.equal(order.items[1].choices.coupon_code,undefined);assert.equal(order.items[1].choices.product_selections[0].variant_id,'m');checks++;
    await page.locator('#choices-16899535009').getByRole('button',{name:/Camiseta:/}).click();
    await page.locator('#choices-16899535009').getByRole('radio',{name:'Azul - G',exact:true}).locator('..').click();await page.waitForTimeout(1300);
    // Retoma do servidor no mesmo contexto sem duplicar o pedido.
    await page.reload();await button('Adicionar outro participante').waitFor();
    assert.equal(order.items.length,2);checks++;
    await button('Revisar inscrições').click();await button('Reservar e ir para pagamento').waitFor();
    if(process.env.CHECKOUT_UI_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.CHECKOUT_UI_SCREENSHOT_DIR}/checkout-review-${viewport.width}.png`});
    assert.equal(await page.getByText('Azul - G',{exact:false}).count()>0,true);
    assert.equal(await page.locator('[role="dialog"]').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);checks++;
    failReserve=true;await button('Reservar e ir para pagamento').click();
    await page.getByText('Valores ou dados foram atualizados. Revise o pedido novamente.',{exact:true}).waitFor();
    await button('Editar participantes').click();await button('Revisar inscrições').click();
    await button('Reservar e ir para pagamento').click();await page.getByRole('button',{name:/^Gerar pagamento único/}).waitFor();
    if(process.env.CHECKOUT_UI_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.CHECKOUT_UI_SCREENSHOT_DIR}/checkout-${viewport.width}.png`});
    await page.getByRole('button',{name:/^Gerar pagamento único/}).click();
    await page.getByRole('button',{name:'Copiar chave Pix',exact:true}).waitFor();
    assert.equal(await button('Voltar').count(),1);assert.equal(await button('Cancelar pedido').count(),0);checks++;
    assert.equal(payCalls,1);checks++;
    await page.reload();await page.getByRole('button',{name:'Copiar chave Pix',exact:true}).waitFor();assert.equal(payCalls,1);checks++;
    payment.status='paid';payment.invoice_url=null;payment.pix_qr_code=null;order.status='confirmed';
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByRole('heading',{name:'Pedido confirmado'}).waitFor();
    assert.equal(reserveCalls,2);assert.deepEqual(errors,[]);checks++;
    // Retomada de pedido grande: lista inteira, limite e cópia a partir do último atleta.
    const source=order.items[0];
    order={...order,status:'draft',items:[source,...Array.from({length:19},(_,i)=> {
      const id=`athlete-${i+2}`;people.set(id,{id,registered:true,ready:true,delivery_mode:'account',expires_at:'2099-01-01'});
      return {id:`item-many-${i}`,participant_id:id,position:i+1,choices:{}};
    })]};
    await page.reload();await page.getByRole('button',{name:/Participante 20.*Não iniciado/}).waitFor();
    assert.equal(await page.locator('button[id^="participant-"]').count(),20);
    assert.equal(await button('Adicionar outro participante').isDisabled(),true);checks++;
    await page.getByRole('button',{name:/Participante 20.*Não iniciado/}).click();
    await page.locator('#choices-athlete-20').getByRole('button',{name:'Copiar de outro participante',exact:true}).click();
    await page.locator('[aria-label="Escolher origem da cópia"]').getByRole('button',{name:'Participante 1',exact:true}).click();
    await page.getByLabel('Aplicar também o cupom da origem, sujeito à validação individual').check();
    await button('Aplicar aos selecionados').click();await page.waitForTimeout(1300);
    assert.equal(order.items[19].choices.coupon_code,'GRUPO');assert.equal(order.items[19].choices.kit_id,'kit');
    assert.equal(order.items[1].choices.kit_id,undefined);checks++;
    assert.equal(await page.locator('[role="dialog"]').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);checks++;
    await context.close();
    console.log(`OK ${viewport.width}px: inclusão, cópia seletiva, erro de gravação, retomada, revisão, reserva, pagamento e confirmação.`);
  }
  console.log(`${checks} verificações de navegador aprovadas.`);
} finally {await browser.close();}
