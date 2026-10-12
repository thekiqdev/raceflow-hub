import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const base='http://127.0.0.1:5186';
const browser=await chromium.launch({channel:'msedge',headless:true});
let checks=0;
try {
  for(const width of [1366,390,320]) {
    const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
    await context.addInitScript(()=>{localStorage.setItem('auth_token','test-only');localStorage.setItem('auth_user','{}');});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let payment='paid',cancelled=false,owner=true,receiptReads=0,publicReads=0,downloads=0,privateDenied=false;
    page.on('download',()=>downloads++);
    const registration=()=>({id:'legacy',runner_id:owner?'buyer':'new-runner',registered_by:'buyer',event_id:'event',
      status:cancelled?'cancelled':owner?'confirmed':'transferred',payment_status:cancelled?'refunded':payment,
      confirmation_code:'LEGACY-CODE',event_title:'Corrida do Parque',event_date:'2099-01-01',location:'Parque',
      runner_name:'Ana Corredora',total_amount:'100.00',product_selections:[]});
    const groupRegistration=()=>({id:'group',confirmation_code:'GROUP-CODE',ticket_available:true,status:'confirmed',payment_status:'paid',
      event_title:'Corrida do Parque',event_date:'2099-01-01',location:'Parque',
      category_name:'Geral',modality_name:'5 km',kit_name:'Kit',total_amount:100,
      runner_name:'Participante group',runner_cpf:'52998224725',product_selections:[]});
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin===base && !url.pathname.startsWith('/api/'))return route.continue();
      if(!url.pathname.includes('/api/'))return route.abort();
      const path=url.pathname.split('/api/')[1];
      const ok=data=>route.fulfill({json:{success:true,data}});
      const fail=(status,error,code)=>route.fulfill({status,json:{success:false,error,code}});
      if(path==='auth/me')return ok({id:'buyer',email:'buyer@example.test',roles:['runner'],profile:{id:'buyer',full_name:'Ana Corredora'}});
      if(path==='registrations/legacy/receipt'){
        receiptReads++;
        return cancelled || !owner?fail(409,'Ingresso indisponível. Atualize a lista.'):ok(registration());
      }
      if(path==='registrations/legacy')return privateDenied?fail(403,'Sem permissão privada'):ok(registration());
      if(path==='registrations/legacy/validate'){publicReads++;return ok(registration());}
      if(path==='registrations/group')return fail(409,'Esta inscrição deve ser acessada pelo pedido.','ORDER_REGISTRATION_REQUIRED');
      if(path==='registrations/group/validate'){publicReads++;return ok(groupRegistration());}
      if(path==='checkout-delivery/tickets/group')return fail(403,'Acesso ao ingresso não autorizado.');
      return ok(path.includes('settings') || path.includes('branding') || path.includes('config')?{}:[]);
    });
    for(payment of ['paid','convidado','transferred']) {
      await page.goto(`${base}/registration/qrcode/legacy`);
      const button=page.getByRole('button',{name:'Baixar ingresso (PDF)'});
      await button.waitFor();
      const before=receiptReads;const download=page.waitForEvent('download');await button.click();
      assert.match((await download).suggestedFilename(),/\.pdf$/);checks++;
      assert.equal(receiptReads,before+1);checks++;
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks++;
    }
    cancelled=true;const before=downloads;
    await page.getByRole('button',{name:'Baixar ingresso (PDF)'}).click();
    await page.getByText('Inscrição Pendente',{exact:true}).waitFor();
    assert.equal(downloads,before);checks++;
    assert.equal(await page.getByRole('button',{name:'Baixar ingresso (PDF)'}).count(),0);checks++;
    cancelled=false;owner=false;
    await page.goto(`${base}/registration/qrcode/legacy`);
    await page.getByText('Inscrição Pendente',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Baixar ingresso (PDF)'}).count(),0);checks++;
    assert.equal(await page.getByText('LEGACY-CODE',{exact:true}).count(),0);checks++;
    owner=true;privateDenied=true;
    await page.goto(`${base}/registration/validate/legacy`);
    await page.getByText('Corrida do Parque',{exact:true}).waitFor();
    assert.ok(publicReads>0);checks++;
    await page.goto(`${base}/registration/qrcode/group`);
    await page.getByRole('heading',{name:'Validação de Inscrição'}).waitFor();
    assert.equal(new URL(page.url()).pathname,'/registration/validate/group');checks++;
    await page.getByText('Inscrição Confirmada',{exact:true}).waitFor();
    await page.getByText('GROUP-CODE',{exact:true}).waitFor();checks++;
    await page.goto(`${base}/registration/validate/group`);
    await page.getByText('Inscrição Confirmada',{exact:true}).waitFor();
    await page.getByText('GROUP-CODE',{exact:true}).waitFor();checks++;
    assert.deepEqual(errors,[]);checks++;
    await context.close();
  }
  console.log(`${checks} verificações aprovadas nas páginas antigas (1366, 390 e 320 px).`);
} finally {await browser.close();}
