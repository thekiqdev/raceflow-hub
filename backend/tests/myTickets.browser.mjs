import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const base='http://127.0.0.1:5186';
const browser=await chromium.launch({channel:'msedge',headless:true});
await mkdir('tmp/ux-stage-e3',{recursive:true});let checks=0;
try {
  for(const width of [1366,390,320]) {
    const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
    await context.addInitScript(()=>{localStorage.setItem('auth_token','test-only');localStorage.setItem('auth_user','{}');});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const user={id:'buyer',email:'buyer@example.test',roles:['runner'],profile:{id:'buyer',full_name:'Ana Corredora'}};
    const build=(id,source='order',group='active',event={id:'event',title:'Corrida do Parque',date:'2099-01-01',location:'São Paulo',banner_url:null,transfers_enabled:true,transfer_until:null,status:'published',result_url:null})=>({registration_id:id,source,order_id:source==='order'?'order':null,
      relationship:{runner:source==='legacy',buyer:true},event:{...event,banner_url:id==='legacy'?`${base}/test-banner.svg`:event.banner_url},
      participant:{name:source==='legacy'?'Ana Corredora':`Participante ${id}`,cpf_masked:'***.***.247-**',restricted:false},
      selection:{category:'Geral',modality:'5 km',batch:'1º lote',kit:'Kit completo',products:[{product_id:'shirt',product_name:'Camiseta',variant_id:'m',variant_name:'M'}]},state:{registration:group==='active'?'confirmed':'pending',payment:group==='active'?'paid':'pending',order:source==='order'?(group==='active'?'confirmed':'awaiting_payment'):null,group},
      amounts:{total_cents:10000,paid_cents:group==='active'?10000:0,refunded_cents:0},ticket:{released:group==='active'},kit:{collected_at:null,returned_at:null},transfer:{pending:false,request_id:null},
      legacy:source==='legacy'?{runner_id:'buyer',registered_by:'buyer',category_id:'category',payment_method:'pix',has_pending_difference:false,pending_difference_amount:0,amount_paid:100,registration_edit_fee:0}:null});
    const pastEvent={id:'past-event',title:'Corrida Encerrada',date:'2020-01-15',location:'Campinas',banner_url:null,transfers_enabled:false,transfer_until:null,status:'finished',result_url:'https://example.test/resultados'};
    const items=[build('legacy','legacy'),build('group'),build('invitation','legacy'),build('difference','legacy'),build('pending','order','pending'),build('past-ticket','order','active',pastEvent),...Array.from({length:19},(_,i)=>build(`more-${i}`))];
    items[2].legacy.category_id=null;items[2].state.payment='convidado';items[2].selection.category=null;
    items[3].legacy.has_pending_difference=true;items[3].legacy.pending_difference_amount=20;items[3].state.payment='partially_paid';
    let failList=false,failCreate=true,transfer=null,creates=0,pays=0,releaseDownload=true,detailReads=0,legacyLists=0,groupLists=0,verify=0;
    let requestKey=null;
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.pathname==='/test-banner.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300"><rect width="800" height="300" fill="#165c3e"/><path d="M0 300Q200 70 800 140V300Z" fill="#2d9166"/><text x="50" y="115" fill="white" font-size="48">Corrida do Parque</text></svg>'});
      if(url.origin===base && !url.pathname.startsWith('/api/')) return route.continue();
      if(!url.pathname.includes('/api/')) return route.abort();
      const path=url.pathname.split('/api/')[1],body=req.postDataJSON();
      const ok=data=>route.fulfill({json:{success:true,data}});
      if(path==='auth/me')return ok(user);
      if(path==='registrations/legacy/receipt')return ok({id:'legacy',runner_id:'buyer',registered_by:'buyer',event_id:'event',status:releaseDownload?'confirmed':'cancelled',payment_status:releaseDownload?'paid':'refunded',confirmation_code:'LEGACY-CODE',event_title:'Corrida do Parque',event_date:'2099-01-01',runner_name:'Ana Corredora',total_amount:100});
      if(path==='registrations') {legacyLists++;return ok([]);}
      if(path==='checkout-delivery/mine'){groupLists++;return ok([]);}
      if(path==='registrations/settings/modules')return ok({enabled_modules:{transfers:true},transfer_fee:10});
      if(path==='tickets/mine/events') {
        if(failList)return route.fulfill({status:503,json:{success:false,error:'Falha simulada da consulta.'}});
        const search=url.searchParams.get('search') || '',timeline=url.searchParams.get('timeline') || 'all',current=Number(url.searchParams.get('page') || 1);
        const counts={active:0,pending:0,transferred:0,cancelled:0,refunded:0};for(const t of items)counts[t.state.group]++;
        const eligible=items.filter(t=>['active','pending'].includes(t.state.group) && t.event.title.toLowerCase().includes(search.toLowerCase()));
        const byEvent=new Map();
        for(const t of eligible) {
          const ended=new Date(t.event.date)<new Date() || ['finished','cancelled'].includes(t.event.status);
          const hasResults=Boolean(t.event.result_url);
          const cur=byEvent.get(t.event.id) || {event_id:t.event.id,title:t.event.title,date:t.event.date,location:t.event.location,banner_url:t.event.banner_url,status:t.event.status,result_url:t.event.result_url,ended,has_results:hasResults,confirmed_count:0,pending_count:0};
          if(t.state.group==='active') cur.confirmed_count++; else cur.pending_count++;
          byEvent.set(t.event.id,cur);
        }
        const events=[...byEvent.values()].filter(e=>e.confirmed_count>0).filter(e=>timeline==='all'||(timeline==='upcoming'&&!e.ended)||(timeline==='past'&&e.ended));
        return ok({items:events.slice((current-1)*20,current*20),page:current,page_size:20,total:events.length,counts});
      }
      if(path==='tickets/mine') {
        if(failList)return route.fulfill({status:503,json:{success:false,error:'Falha simulada da consulta.'}});
        const status=url.searchParams.get('status'),search=url.searchParams.get('search') || '',eventId=url.searchParams.get('event_id'),current=Number(url.searchParams.get('page') || 1);
        const scoped=items.filter(t=>(!eventId || t.event.id===eventId) && `${t.event.title} ${t.participant.name}`.toLowerCase().includes(search.toLowerCase()));
        const counts={active:0,pending:0,transferred:0,cancelled:0,refunded:0};for(const t of scoped)counts[t.state.group]++;
        const filtered=scoped.filter(t=>status==='all'?t.state.group!=='cancelled':t.state.group===status);
        return ok({items:filtered.slice((current-1)*20,current*20),page:current,page_size:20,total:filtered.length,counts});
      }
      if(path==='checkout-transfers/tickets/group/requests') {
        if(body.new_runner_cpf==='123')return route.fulfill({status:400,json:{success:false,error:'Dados da transferência inválidos.'}});
        creates++;requestKey ??=body.request_key;assert.equal(body.request_key,requestKey);
        transfer ??={id:'transfer',registration_id:'group',status:'pending',transfer_fee:10,payment_status:'pending',payment:null};
        if(failCreate){failCreate=false;return route.fulfill({status:503,json:{success:false,error:'Resposta perdida. Retome a solicitação.'}});}
        return ok(transfer);
      }
      if(path==='checkout-transfers/requests/transfer')return ok(transfer);
      if(path==='checkout-transfers/requests/transfer/payment'){pays++;transfer.payment={status:'pending',value:10,invoice_url:null,pix_qr_code:'00020126580014br.gov.bcb.pix0136transfer-ui',issue:null};return ok(transfer);}
      if(path==='checkout-transfers/requests/transfer/cancel'){
        transfer={...transfer,status:'cancelled',payment:transfer.payment?{...transfer.payment,status:'refunded',invoice_url:null,pix_qr_code:null}:null};
        return ok(transfer);
      }
      if(path==='checkout-delivery/tickets/group/resend')return ok({queued:true});
      if(path==='checkout-delivery/tickets/group') {
        detailReads++;return ok({id:'group',order_id:'order',event_id:'event',event_title:'Corrida do Parque',event_date:'2099-01-01',location:'São Paulo',runner_name:'Participante group',cpf_masked:'***.***.247-**',released:releaseDownload,confirmation_code:releaseDownload?'CURRENT-CODE':null,labels:{category:'Geral',modality:'5 km',kit:'Kit completo',products:[]},pricing:{total:100}});
      }
      if(path==='registrations/difference/verify-payment'){verify++;return route.fulfill({json:{success:true,payment_verified:true,message:'Pagamento confirmado.'}});}
      if(path.startsWith('events/'))return ok({id:'event',title:'Corrida do Parque',event_type:'NORMAL'});
      if(path==='checkout-orders/order')return route.fulfill({status:403,json:{success:false,error:'Pedido de teste: retomada consultada.'}});
      if(path==='checkout-orders' && req.method()==='POST')throw new Error('Retomada criou pedido indevidamente');
      return ok(path.includes('settings') || path.includes('branding') || path.includes('config')?{}:[]);
    });
    const card=id=>page.locator(`[data-registration-id="${id}"]`);
    const eventCard=()=>page.locator('[data-event-id="event"]');
    const pastEventCard=()=>page.locator('[data-event-id="past-event"]');
    const button=name=>page.getByRole('button',{name,exact:true});
    const openTickets=async()=>{await eventCard().click();await card('group').waitFor();};
    await page.goto(`${base}/corredor/minhas-inscricoes`);await eventCard().waitFor();
    assert.ok(await eventCard().isVisible());
    assert.ok(await eventCard().getByText(/ingresso/).isVisible());
    assert.ok(await eventCard().getByRole('heading',{name:'Corrida do Parque'}).isVisible());
    assert.ok(await page.getByRole('group',{name:'Filtrar por período'}).isVisible());
    assert.equal(await page.getByText(/inscriç(ão|ões) aguardando/).count(),0);checks+=2;
    assert.ok(await pastEventCard().getByText('Encerrado',{exact:true}).isVisible());
    assert.ok(await pastEventCard().getByRole('button',{name:'Ver resultado',exact:true}).isVisible());checks++;
    await button('Encerrados').click();
    await pastEventCard().waitFor();
    await eventCard().waitFor({state:'detached'});
    assert.ok(await pastEventCard().isVisible());checks++;
    await button('Próximos').click();
    await eventCard().waitFor();
    await pastEventCard().waitFor({state:'detached'});checks++;
    await button('Todos').click();await eventCard().waitFor();await pastEventCard().waitFor();checks++;
    await pastEventCard().click();
    await card('past-ticket').waitFor();
    assert.ok(await card('past-ticket').getByRole('button',{name:'Ver resultado',exact:true}).isVisible());
    assert.equal(await card('past-ticket').getByRole('button',{name:'Baixar ingresso',exact:true}).count(),0);
    assert.equal(await card('past-ticket').getByRole('link',{name:'Visualizar inscrição',exact:true}).count(),0);
    assert.equal(await card('past-ticket').getByRole('button',{name:'Transferir',exact:true}).count(),0);checks++;
    await button('Voltar aos eventos').click();await eventCard().waitFor();
    assert.equal(await card('group').count(),0);assert.equal(legacyLists,0);assert.equal(groupLists,0);checks+=3;
    await page.getByLabel('Buscar evento').fill('não encontrado');
    await page.getByText('Nenhum evento encontrado para essa busca.').waitFor();
    await button('Limpar filtros').click();await eventCard().waitFor();checks++;
    await openTickets();
    assert.equal(await card('pending').count(),1);checks++;
    assert.equal(await card('pending').getByRole('button',{name:'Transferir',exact:true}).count(),0);
    assert.equal(await card('pending').getByRole('link',{name:'Acompanhar pagamento'}).getAttribute('href'),'/events/event/inscricao?pedido=order');checks+=2;
    assert.equal(await card('legacy').count(),1);assert.equal(await card('group').count(),1);checks+=2;
    assert.equal(await page.getByText('Minhas compras e ingressos',{exact:true}).count(),0);checks++;
    assert.equal(await card('invitation').getByRole('button',{name:/Completar convite/}).count(),1);checks++;
    await card('difference').getByRole('button',{name:'Confirmar pagamento',exact:true}).click();await page.waitForTimeout(250);assert.equal(verify,1);checks++;
    assert.equal(await card('legacy').getByRole('button',{name:'Transferir',exact:true}).count(),1);checks++;
    const legacyDownload=page.waitForEvent('download');await card('legacy').getByRole('button',{name:'Baixar ingresso',exact:true}).click();assert.match((await legacyDownload).suggestedFilename(),/\.pdf$/);checks++;
    assert.ok(await card('legacy').getByText('Ana Corredora',{exact:true}).isVisible());
    assert.ok(await card('legacy').getByText('Categoria',{exact:true}).isVisible());
    assert.ok(await card('legacy').getByText('Geral',{exact:true}).isVisible());checks++;
    releaseDownload=false;await card('legacy').getByRole('button',{name:'Baixar ingresso',exact:true}).click();await page.getByText('Ingresso indisponível. Atualize a lista.',{exact:true}).first().waitFor();releaseDownload=true;checks++;
    await card('legacy').getByRole('button',{name:'Transferir',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');checks++;
    await button('Voltar aos eventos').click();await eventCard().waitFor();
    await openTickets();
    await button('Próxima').click();await card('more-18').waitFor();assert.equal(await card('group').count(),0);checks++;
    await button('Anterior').click();await card('group').waitFor();
    await page.getByLabel('Buscar participante').fill('não encontrado');
    await page.getByText('Nenhuma inscrição encontrada para essa busca.').waitFor();checks++;
    await button('Limpar busca').click();await card('group').waitFor();
    await button('Voltar aos eventos').click();await eventCard().waitFor();
    failList=true;await page.reload();
    await page.getByText('Falha simulada da consulta.',{exact:false}).waitFor();assert.equal(await eventCard().count(),0);checks++;
    failList=false;await button('Tentar novamente').click();await eventCard().waitFor();await openTickets();
    releaseDownload=false;await card('group').getByRole('button',{name:'Baixar ingresso',exact:true}).click();await card('group').getByRole('alert').waitFor();assert.ok(detailReads>0);checks++;
    releaseDownload=true;const download=page.waitForEvent('download');await card('group').getByRole('button',{name:'Baixar ingresso',exact:true}).click();assert.match((await download).suggestedFilename(),/\.pdf$/);checks++;
    assert.equal(await card('group').getByRole('button',{name:'Reenviar e-mail',exact:true}).count(),0);
    assert.equal(await card('group').getByRole('link',{name:'Inscrever outro participante',exact:true}).count(),0);checks++;
    await card('group').getByRole('button',{name:'Transferir',exact:true}).click();await page.getByLabel('CPF do novo titular',{exact:true}).fill('123');
    await button('Continuar transferência').click();await page.getByText('Dados da transferência inválidos.',{exact:true}).waitFor();assert.equal(await page.getByLabel('CPF do novo titular',{exact:true}).isEnabled(),true);checks++;
    await page.getByLabel('CPF do novo titular',{exact:true}).fill('11144477735');
    await button('Continuar transferência').click();await page.getByText('Resposta perdida. Retome a solicitação.',{exact:true}).waitFor();
    await button('Retomar solicitação').click();await button('Gerar pagamento da taxa').waitFor();assert.equal(creates,2);checks++;
    await button('Gerar pagamento da taxa').dblclick();
    await page.getByRole('button',{name:'Copiar código PIX',exact:true}).waitFor();
    assert.equal(await page.getByRole('link',{name:'Pagar taxa com Pix'}).count(),0);assert.equal(pays,1);checks++;
    assert.equal(await page.getByLabel('E-mail do novo titular').count(),0);checks++;
    await button('Cancelar solicitação').click();
    await page.getByLabel('CPF do novo titular',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Copiar código PIX',exact:true}).count(),0);checks++;
    requestKey=null;transfer=null;failCreate=false;
    await page.getByLabel('CPF do novo titular',{exact:true}).fill('11144477735');
    await button('Continuar transferência').click();await button('Gerar pagamento da taxa').waitFor();assert.equal(creates,3);checks++;
    await button('Gerar pagamento da taxa').click();
    await page.getByRole('button',{name:'Copiar código PIX',exact:true}).waitFor();assert.equal(pays,2);checks++;
    transfer.payment_status='paid';transfer.payment.status='paid';await button('Atualizar situação').click();await page.getByText('Taxa paga. A transferência ainda está em processamento.').waitFor();checks++;
    transfer.status='completed';await button('Atualizar situação').click();await page.getByRole('heading',{name:'Transferência concluída'}).waitFor();checks++;
    await button('Fechar').click();await card('group').waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));checks++;
    await page.screenshot({path:`tmp/ux-stage-e3/list-${width}.png`,fullPage:true});
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`tmp/ux-stage-e3/viewport-${width}.png`});
    await page.goto(`${base}/minhas-compras`);await page.waitForURL('**/corredor/minhas-inscricoes');await eventCard().waitFor();checks++;
    user.roles=['admin'];await page.reload();await eventCard().waitFor();await page.getByRole('link',{name:'Voltar à minha conta',exact:true}).waitFor();checks++;
    await page.goto(`${base}/events/event/inscricao?pedido=order`);await page.getByText('Pedido de teste: retomada consultada.',{exact:true}).waitFor();checks++;
    assert.deepEqual(errors,[]);checks++;await context.close();
  }
  console.log(`${checks} verificações de lista única, ações, privacidade e retomada aprovadas.`);
} finally {await browser.close();}
