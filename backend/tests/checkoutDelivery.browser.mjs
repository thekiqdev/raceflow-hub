import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
const base=process.env.CHECKOUT_UI_TEST_URL || 'http://127.0.0.1:5186';
assert.equal(new URL(base).hostname,'127.0.0.1');
const browser=await chromium.launch({channel:'msedge',headless:true});let checks=0;
try{
  for(const viewport of [{width:1365,height:900},{width:390,height:844}]){
    const context=await browser.newContext({viewport}),page=await context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const template={order_id:'pedido-123',event_id:'event',event_title:'Corrida no Parque',event_date:'2026-12-12T11:00:00Z',location:'Parque · São Paulo · SP',
      cpf_masked:'***.***.247-**',status:'confirmed',payment_status:'paid',order_status:'confirmed',released:true,buyer:true,kit_collected_at:null,
      labels:{category:'Geral',modality:'5 km',batch:'Primeiro lote',kit:'Kit com camiseta',products:[{product_id:'shirt',product_name:'Camiseta',variant_id:'m',variant_name:'Azul - M'}]},
      pricing:{total:120,subtotal:120,seniorDiscount:0,couponDiscount:0,platformFee:0},custom_fields:[{label:'Equipe',value:'Corredores do parque'}]};
    let tickets=[{...template,id:'first',runner_name:'Ana Silva',confirmation_code:'REG-PRIMEIRO'},{...template,id:'second',runner_name:'Bruno Souza',confirmation_code:'REG-SEGUNDO'},
      {...template,id:'third',runner_name:'Carlos Lima',confirmation_code:null,released:false,status:'cancelled',payment_status:'refunded'}];
    let resend=0,collect=0,returned=0,tokenCalls=0;
    const validation=()=>({id:'first',confirmation_code:'REG-PRIMEIRO',ticket_available:true,status:'confirmed',payment_status:'paid',
      event_title:'Corrida no Parque',event_date:'2026-12-12T11:00:00Z',location:'Parque · São Paulo · SP',
      category_name:'Geral',modality_name:'5 km',kit_name:'Kit com camiseta',total_amount:120,
      runner_name:'Ana Silva',runner_cpf:'52998224725',product_selections:[]});
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin===base && !url.pathname.startsWith('/api/')) return route.continue();
      if(!url.pathname.includes('/api/')) return route.abort();
      const path=url.pathname.split('/api/')[1],body=req.postDataJSON();
      const ok=data=>route.fulfill({json:{success:true,data}}),bad=()=>route.fulfill({status:409,json:{success:false,error:'Ingresso não está disponível.'}});
      if(path==='auth/me') return ok(null);
      if(path==='checkout-delivery/mine' || path==='checkout-delivery/events/event') return ok(tickets);
      if(path==='checkout-delivery/ticket-access'){tokenCalls++;return body.token==='valid-token'?ok(tickets[0]):bad();}
      if(path.endsWith('/resend')){resend++;return ok({queued:true});}
      if(path.endsWith('/collect')){collect++;tickets=tickets.map(t=>t.id===path.split('/')[2]?{...t,kit_collected_at:new Date().toISOString()}:t);return ok(tickets[0]);}
      if(path.endsWith('/return')){returned++;tickets=tickets.map(t=>t.id===path.split('/')[2]?{...t,kit_returned_at:new Date().toISOString()}:t);return ok(tickets[0]);}
      if(path==='registrations/first/validate') return ok(validation());
      if(path.startsWith('checkout-delivery/tickets/')){const t=tickets.find(t=>t.id===path.split('/')[2]);return t?.released?ok(t):bad();}
      return ok(path.includes('settings') || path.includes('branding') || path.includes('config')?{}:[]);
    });
    await page.goto(`${base}/backend/tests/fixtures/checkoutDelivery.html`);
    await page.getByRole('heading',{name:'Ana Silva',exact:true}).waitFor();
    assert.equal(await page.getByRole('article').count(),3);checks++;
    assert.equal(await page.getByRole('button',{name:'Baixar PDF',exact:true}).count(),2);checks++;
    await page.getByRole('textbox').fill('Bruno');assert.equal(await page.getByRole('article').count(),1);checks++;
    await page.getByRole('textbox').fill('');
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar ingressos disponíveis'}).click();
    const file=await downloaded;assert.equal(file.suggestedFilename(),'ingressos-cronoteam.pdf');checks++;
    const pdf=await readFile(await file.path(),'latin1');assert.ok(pdf.startsWith('%PDF-'));assert.equal((pdf.match(/\/Type \/Page\b/g)||[]).length,2);checks++;
    await page.getByRole('button',{name:'Reenviar e-mail'}).first().click();await page.getByText('Reenvio solicitado para o e-mail da sua conta.').waitFor();assert.equal(resend,1);checks++;
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);checks++;
    await page.screenshot({path:`tmp/stage7-${viewport.width}.png`,fullPage:true});
    await page.getByRole('link',{name:'Abrir ingresso'}).first().click();
    await page.getByRole('heading',{name:'Validação de Inscrição'}).waitFor();
    await page.getByText('Inscrição Confirmada',{exact:true}).waitFor();
    await page.getByText('REG-PRIMEIRO',{exact:true}).waitFor();
    assert.equal(await page.locator('svg').count()>0,true);checks++;
    await page.goto(`${base}/backend/tests/fixtures/checkoutDelivery.html?mode=ticket#valid-token`);
    await page.getByRole('heading',{name:'Validação de Inscrição'}).waitFor();
    await page.getByText('REG-PRIMEIRO',{exact:true}).waitFor();
    await page.goto(`${base}/backend/tests/fixtures/checkoutDelivery.html?mode=ticket#valid-token`);
    await page.getByText('REG-PRIMEIRO',{exact:true}).waitFor();
    assert.ok(tokenCalls>0);checks++;
    await page.goto(`${base}/backend/tests/fixtures/checkoutDelivery.html?mode=organizer`);
    await page.getByRole('button',{name:'Confirmar entrega do kit'}).first().click();await page.getByText('Retirada de kit registrada.').waitFor();assert.equal(collect,1);checks++;
    assert.equal(await page.getByRole('button',{name:'Confirmar entrega do kit'}).count(),1);checks++;
    tickets=tickets.map(t=>t.id==='first'?{...t,released:false,payment_status:'refunded',status:'cancelled'}:t);
    await page.getByRole('button',{name:'Atualizar ingressos'}).click();
    await page.getByRole('button',{name:'Confirmar recebimento do kit devolvido'}).click();
    await page.getByText('Devolução física registrada; kit liberado no estoque.').waitFor();assert.equal(returned,1);checks++;
    assert.deepEqual(errors,[]);checks++;
    await context.close();
  }
  console.log(`${checks} verificações aprovadas de ingressos em desktop e mobile.`);
}finally{await browser.close();}
