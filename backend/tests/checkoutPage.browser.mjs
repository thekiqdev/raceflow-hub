import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const base=process.env.CHECKOUT_UI_TEST_URL || 'http://127.0.0.1:5186';
assert.equal(new URL(base).hostname,'127.0.0.1');
const browser=await chromium.launch({channel:'msedge',headless:true});
await mkdir('tmp/ux-stage-c',{recursive:true});
let checks=0;
try {
  for(const width of [1366,390,320]) {
    const context=await browser.newContext({viewport:{width,height:844}});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const user={id:'buyer',email:'buyer@example.test',roles:['runner'],profile:{id:'buyer',full_name:'Ana Corredora'}};
    const event={id:'event',slug:'corrida-teste',title:'Corrida de teste',event_date:'2099-01-01',status:'published',registration_status:'open',location:'Parque',city:'São Paulo',state:'SP',organizer_id:'organizer'};
    const self={id:'self',registered:true,ready:true,cpf_masked:'***.***.247-**',delivery_mode:'account',expires_at:'2099-01-01'};
    const category={id:'cat',event_id:'event',name:'Geral · 5 km',price:100,modality_ids:['mod'],batches:[],custom_fields:[]};
    let order=null,creates=0,failSave=false;
    const own=()=>({...self,id:'item-self',participant_id:'self',choices:{},registration_id:null,participant:null,pricing:null,labels:null});
    await page.route('**/*',async route=> {
      const request=route.request(),url=new URL(request.url());
      if(url.origin===base && !url.pathname.startsWith('/api/')) return route.continue();
      if(!url.pathname.includes('/api/')) return route.abort();
      const path=url.pathname.split('/api/')[1],method=request.method();
      let body=null;try {body=request.postDataJSON();} catch { /* GET/sem JSON */ }
      const ok=data=>route.fulfill({json:{success:true,data}});
      if(path==='auth/login') return ok({user,token:'test-token'});
      if(path==='auth/me') return ok(user);
      if(path.startsWith('categories/event/')) return ok([category]);
      if(path.endsWith('/kits') || path.includes('pickup')) return ok([]);
      if(path.startsWith('modalities/event/')) return ok([{id:'mod',name:'Corrida',distance:'5 km'}]);
      if(path==='events/corrida-teste' || path==='events/event') return ok(event);
      if(path==='registrations/settings/modules') return ok({enabled_modules:{multi_registration_checkout:true},transfer_fee:0});
      if(path==='checkout-orders' && method==='POST') {
        assert.equal(body.include_buyer,true);creates++;
        order ??={id:'order',event_id:'event',status:'draft',version:1,total_cents:0,items:[own()],buyer:{full_name:'Ana Corredora',email:user.email,cpf_masked:self.cpf_masked,status:'ready',participant_id:'self'}};
        return ok(order);
      }
      if(path==='checkout-orders/order') return ok(order);
      if(path==='checkout-participants/self') return ok(self);
      if(path.endsWith('/eligibility-batch')) return ok({results:(body?.category_ids ?? []).map(category_id=>({category_id,eligible:true}))});
      if(path.endsWith('/eligibility')) return ok({eligible:true});
      if(path==='checkout-orders/order/items') {
        if(failSave) return route.fulfill({status:503,json:{success:false,error:'Falha simulada ao salvar.'}});
        assert.equal(body.version,order.version);
        order={...order,version:order.version+1,items:body.items.map(i=>({...own(),...i})),buyer:{...order.buyer,participant_id:body.items.some(i=>i.participant_id==='self')?'self':null}};
        return ok(order);
      }
      if(path==='checkout-orders/order/review') {
        assert.equal(order.items.length,1);assert.equal(order.items[0].participant_id,'self');
        order={...order,status:'reviewed',version:order.version+1,total_cents:10000,review_expires_at:'2099-01-01',items:order.items.map(i=>({...i,pricing:{subtotal:100,total:100},labels:{category:'Geral',products:[]}}))};return ok(order);
      }
      if(path==='checkout-orders/order/reserve') {order={...order,status:'reserved',version:order.version+1,reservation_expires_at:'2099-01-01'};return ok(order);}
      if(path==='checkout-orders/order/buyer') {
        order={...order,version:order.version+1,items:order.items.length?order.items:[own()],buyer:{...order.buyer,participant_id:'self'}};return ok(order);
      }
      return ok(path.includes('branding') || path.includes('config') || path.includes('settings')?{}:[]);
    });
    const button=name=>page.getByRole('button',{name,exact:true});
    await page.goto(`${base}/evento/corrida-teste?cupom=LIDER1&ref=EHV892`);
    await button('Fazer Inscrição').first().click();
    await page.waitForURL(/\/evento\/corrida-teste\/inscricao/);checks++;
    assert.ok(!page.url().includes('/auth'));
    await page.getByRole('heading',{name:'Entre para continuar a inscrição',exact:true}).waitFor();
    await page.getByLabel('E-mail ou CPF',{exact:true}).fill(user.email);
    await page.getByLabel('Senha',{exact:true}).fill('test-only');
    await page.locator('form').getByRole('button',{name:'Entrar',exact:true}).click();
    await page.getByRole('button',{name:/Sua inscrição · Ana Corredora/}).waitFor();
    assert.ok(/\/evento\/corrida-teste\/inscricao/.test(page.url()));
    assert.equal(await page.getByRole('dialog').count(),0);
    // Com escolhas abertas, o card "Sua inscrição" some (mobile e desktop) para focar na categoria.
    assert.equal(await page.getByRole('heading',{name:'Sua inscrição',exact:true}).count(),0);
    assert.equal(await page.getByRole('group',{name:'Categoria',exact:true}).isVisible(),true);checks++;
    assert.equal(await button('Continuar').isDisabled(),true);
    assert.equal(await button('Adicionar outro participante').count(),0);checks++;
    const categoryChip=()=>page.getByRole('toolbar',{name:'Escolhas já feitas'}).getByRole('button',{name:/Categoria: Geral/});
    const openCategory=async()=>{await categoryChip().click();await page.getByRole('group',{name:'Categoria',exact:true}).waitFor();};
    await page.getByRole('radio',{name:'Geral · 5 km',exact:true}).locator('..').click();
    await categoryChip().waitFor();
    await button('Concluir participante').waitFor();
    assert.equal(await button('Concluir participante').isEnabled(),true);checks++;
    assert.equal(await page.getByText('Escolhas prontas — conclua este participante',{exact:true}).count(),1);checks++;
    assert.equal(await page.getByLabel('Cupom deste participante (opcional)').inputValue(),'LIDER1');checks++;
    await page.waitForTimeout(1300);
    assert.equal(order.items[0].choices.category_id,'cat');
    assert.equal(order.items[0].choices.coupon_code,'LIDER1');checks++;
    await openCategory();
    assert.equal(await page.getByRole('radio',{name:'Geral · 5 km',exact:true}).isChecked(),true);assert.equal(order.items.length,1);checks++;
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));checks++;
    await page.screenshot({path:`tmp/ux-stage-c/page-${width}.png`,fullPage:true});
    await button('Completar inscrição').click();
    // Completar volta à lista (não abre o resumo).
    await page.getByRole('button',{name:/Escolhas completas/}).waitFor();
    assert.equal(await page.getByRole('group',{name:'Categoria',exact:true}).count(),0);checks++;
    await page.getByRole('button',{name:/Escolhas completas/}).click();
    await page.getByRole('heading',{name:'Inscrição',exact:true}).waitFor();
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Remover participante 1',exact:true}).click();
    await button('Adicionar minha inscrição').waitFor();await page.waitForTimeout(1100);
    assert.equal(order.items.length,0);
    await page.reload();await button('Adicionar minha inscrição').waitFor();
    assert.equal(order.items.length,0);assert.equal(creates,1);checks++;
    await button('Adicionar minha inscrição').click();await page.getByRole('group',{name:'Categoria',exact:true}).waitFor();
    failSave=true;await page.getByRole('radio',{name:'Geral · 5 km',exact:true}).locator('..').click();
    await page.getByText('Falha simulada ao salvar.',{exact:true}).waitFor();
    page.once('dialog',dialog=>dialog.dismiss());await button('← Voltar ao evento').click();
    assert.ok(/\/inscricao(\?|$)/.test(page.url()));checks++;
    page.once('dialog',dialog=>dialog.dismiss());await page.evaluate(()=>history.back());
    await page.waitForTimeout(500);assert.ok(/\/inscricao(\?|$)/.test(page.url()));
    await openCategory();
    assert.equal(await page.getByRole('radio',{name:'Geral · 5 km',exact:true}).isChecked(),true);checks++;
    failSave=false;await button('Salvar agora').click();await page.waitForTimeout(250);
    await button('← Voltar ao evento').click();await page.waitForURL('**/evento/corrida-teste');
    await button('Fazer Inscrição').first().click();
    await page.getByRole('heading',{name:'Inscrição',exact:true}).waitFor();
    await button('Atualizar dados').click();
    await page.getByRole('group',{name:'Categoria',exact:true}).waitFor();
    await categoryChip().waitFor();
    assert.equal(await page.getByRole('radio',{name:'Geral · 5 km',exact:true}).isChecked(),true);assert.equal(creates,1);checks++;
    await page.goto(`${base}/events/event/inscricao`);
    await page.getByRole('heading',{name:'Inscrição',exact:true}).waitFor();
    await button('Atualizar dados').click();
    await page.getByRole('group',{name:'Categoria',exact:true}).waitFor();
    await categoryChip().waitFor();
    await openCategory();
    assert.equal(order.items.length,1);assert.equal(creates,1);checks++;
    order={...order,items:[],buyer:{...order.buyer,status:'incomplete',participant_id:null,issues:[{field:'cpf',message:'CPF ausente ou inválido.'}]}};
    await page.reload();await page.getByText('CPF ausente ou inválido.',{exact:true}).waitFor();
    assert.equal(await button('Revisar inscrições').isDisabled(),true);checks++;
    assert.equal(await button('Adicionar minha inscrição').count(),0);checks++;
    assert.equal(await page.getByLabel('Progresso dos participantes').count(),0);checks++;
    assert.equal(await button('Adicionar outro participante').isEnabled(),true);checks++;
    order={...order,buyer:{...order.buyer,status:'ready',issues:[]}};
    await button('Já corrigi meus dados · verificar novamente').click();await button('Adicionar minha inscrição').waitFor();
    assert.equal(order.items.length,0);checks++;
    await button('Adicionar minha inscrição').click();await page.getByRole('group',{name:'Categoria',exact:true}).waitFor();
    assert.equal(order.items.length,1);assert.equal(order.items[0].participant_id,'self');checks++;
    await page.getByRole('radio',{name:'Geral · 5 km',exact:true}).locator('..').click();
    await button('Concluir participante').click();
    await button('Revisar inscrição').waitFor({state:'visible'});
    assert.equal(await button('Revisar inscrição').isEnabled(),true);checks++;
    await button('Revisar inscrição').click();await button('Reservar e ir para pagamento').waitFor();
    assert.equal(order.items.length,1);checks++;
    await button('Reservar e ir para pagamento').click();
    await page.getByRole('heading',{name:'Conclua seu pedido',exact:true}).waitFor();
    assert.equal(order.status,'reserved');assert.equal(order.items.length,1);checks++;
    assert.deepEqual(errors,[]);checks++;
    await context.close();
  }
  console.log(`${checks} verificações de página/autenticação/retomada/navegação aprovadas.`);
} finally {await browser.close();}
