import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const base=process.env.CHECKOUT_UI_TEST_URL || 'http://127.0.0.1:5186';
assert.equal(new URL(base).hostname,'127.0.0.1');

function ageYears(birth,ref=new Date('2026-06-15')) {
  const dob=new Date(`${birth}T12:00:00`);
  let age=ref.getFullYear()-dob.getFullYear();
  if(ref.getMonth()<dob.getMonth() || (ref.getMonth()===dob.getMonth() && ref.getDate()<dob.getDate())) age--;
  return age;
}
function evaluate(person,category) {
  if(!person?.ready) return {eligible:false,message:'Complete a identificação deste participante antes de escolher a categoria.'};
  const gender=String(person.gender ?? '').toUpperCase();
  const normalized=gender==='M'||gender==='MASCULINO'?'masculino':gender==='F'||gender==='FEMININO'?'feminino':null;
  const categoryGender=category.gender || 'ambos';
  if(categoryGender!=='ambos' && categoryGender!==normalized) {
    return {eligible:false,message:categoryGender==='masculino'?'Categoria exclusiva para masculino.':'Categoria exclusiva para feminino.'};
  }
  const hasMin=!!(category.min_age && category.min_age>0);
  const hasMax=!!(category.max_age && category.max_age>0);
  if(hasMin || hasMax) {
    if(!person.birth_date) return {eligible:false,message:'Informe a data de nascimento para esta categoria.'};
    const age=ageYears(person.birth_date);
    if(hasMin && age<category.min_age) return {eligible:false,message:`Idade mínima desta categoria: ${category.min_age} anos.`};
    if(hasMax && age>category.max_age) return {eligible:false,message:`Idade máxima desta categoria: ${category.max_age} anos.`};
  }
  return {eligible:true};
}

const browser=await chromium.launch({channel:'msedge',headless:true});
let checks=0;
try {
  const page=await (await browser.newContext({viewport:{width:1365,height:900}})).newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let order=null;
  const people=new Map();
  const categories=[
    {id:'cat-geral',event_id:'event',name:'Categoria geral',price:100,gender:'ambos',min_age:null,max_age:null,modality_ids:['mod'],batches:[],custom_fields:[]},
    {id:'cat-fem',event_id:'event',name:'Feminino 18-39',price:90,gender:'feminino',min_age:18,max_age:39,modality_ids:['mod'],batches:[],custom_fields:[]},
    {id:'cat-masc40',event_id:'event',name:'Masculino 40+',price:80,gender:'masculino',min_age:40,max_age:null,modality_ids:['mod'],batches:[],custom_fields:[]},
  ];
  const kits=[{id:'kit',name:'Kit único',price:0,category_ids:categories.map(c=>c.id),products:[]}];
  await page.route('**/*',async route=> {
    const request=route.request(),url=new URL(request.url());
    if(url.origin===base && !url.pathname.startsWith('/api/')) {await route.continue();return;}
    if(!url.pathname.includes('/api/')) {await route.abort();return;}
    const path=url.pathname.split('/api/')[1],method=request.method(),body=request.postDataJSON();
    const ok=data=>route.fulfill({json:{success:true,data}});
    const bad=(message,status=409)=>route.fulfill({status,json:{success:false,error:message}});
    if(path.startsWith('categories/event/')) return ok(categories);
    if(path.endsWith('/kits')) return ok(kits);
    if(path.startsWith('modalities/event/')) return ok([{id:'mod',name:'Corrida',distance:'5 km'}]);
    if(path==='checkout-orders' && method==='POST') {
      order ??={id:'order',event_id:body.event_id,status:'draft',version:1,total_cents:0,items:[]};return ok(order);
    }
    if(path==='checkout-participants/check-cpf') return ok({registered:false});
    if(path==='checkout-participants' && method==='POST') {
      const id=body.cpf;
      if(body.excluded_participant_ids?.includes(id)) return bad('Este participante já está no pedido.');
      const p={id,registered:false,cpf_masked:`***.***.${id.slice(6,9)}-**`,ready:false,delivery_mode:'buyer',manual_entry_allowed:true,
        birth_date:body.birth_date || null,gender:null,gender_locked:false,expires_at:'2099-01-01'};
      people.set(id,p);return ok(p);
    }
    if(path.startsWith('checkout-participants/')) {
      const id=path.split('/')[1];
      if(path.endsWith('/eligibility-batch')) {
        const person=people.get(id);
        return ok({results:(body?.category_ids ?? []).map(category_id=>{
          const category=categories.find(c=>c.id===category_id) || {id:category_id,gender:'ambos'};
          return {category_id,...evaluate(person,category)};
        })});
      }
      if(path.endsWith('/eligibility')) {
        const person=people.get(id);
        const category=categories.find(c=>c.id===body.category_id) || {gender:'ambos'};
        return ok(evaluate(person,category));
      }
      if(method==='PATCH') {
        const p={...people.get(id),...body,ready:true};
        people.set(id,p);return ok(p);
      }
      return ok(people.get(id));
    }
    if(path==='checkout-orders/order' && method==='GET') return ok(order);
    if(path==='checkout-orders/order/items') {
      order={...order,status:'draft',version:order.version+1,total_cents:0,items:body.items.map((i,n)=>({...i,id:`item${n}`,position:n}))};return ok(order);
    }
    throw new Error(`API inesperada: ${method} ${path}`);
  });

  await page.goto(`${base}/backend/tests/fixtures/groupCheckout.html`);
  const button=(name)=>page.getByRole('button',{name,exact:true});
  await button('Adicionar outro participante').waitFor();

  async function addGuest(cpf,name,birth,gender) {
    await button('Adicionar outro participante').click();
    await page.getByLabel('CPF do participante').fill(cpf);await button('Consultar CPF').click();
    await page.getByLabel('Data de nascimento').fill(birth);await button('Conferir dados').click();
    await page.getByLabel('Nome completo').fill(name);await page.getByLabel('Sexo',{exact:true}).selectOption(gender);
    await button('Salvar participante').click();await button('Adicionar outro participante').waitFor();
    await page.waitForTimeout(800);
  }

  // Homem adulto jovem: vê geral, não vê feminino nem 40+.
  await addGuest('52998224725','João Silva','1995-01-01','M');
  const manPanel=page.locator('#choices-52998224725');
  await manPanel.waitFor({state:'visible'});
  await manPanel.getByText('Conferindo categorias disponíveis…').waitFor({state:'hidden'}).catch(()=>{});
  await manPanel.getByRole('radio',{name:'Categoria geral',exact:true}).waitFor();
  assert.equal(await manPanel.getByRole('radio',{name:'Categoria geral',exact:true}).count(),1);checks++;
  assert.equal(await manPanel.getByRole('radio',{name:'Feminino 18-39',exact:true}).count(),0);checks++;
  assert.equal(await manPanel.getByRole('radio',{name:'Masculino 40+',exact:true}).count(),0);checks++;
  await manPanel.getByRole('radio',{name:'Categoria geral',exact:true}).locator('..').click();
  await page.waitForTimeout(700);
  if(await manPanel.getByRole('radio',{name:'Kit único',exact:true}).count()) {
    await manPanel.getByRole('radio',{name:'Kit único',exact:true}).locator('..').click();
    await page.waitForTimeout(500);
  }
  await manPanel.getByRole('button',{name:'Concluir participante',exact:true}).click();
  await page.getByRole('button',{name:/João Silva.*Escolhas completas/}).waitFor();

  // Mulher 30 anos: vê geral + feminino; não vê masculino 40+.
  await addGuest('16899535009','Maria Corredora','1996-06-01','F');
  // addGuest pode expandir; se já estiver na lista, abrir o card.
  if(!await page.locator('#choices-16899535009').isVisible()) {
    await page.getByRole('button',{name:/Maria Corredora.*Não iniciado/}).click();
  }
  await page.locator('#choices-16899535009').waitFor({state:'visible'});
  const womanPanel=page.locator('#choices-16899535009');
  await womanPanel.getByText('Conferindo categorias disponíveis…').waitFor({state:'hidden'}).catch(()=>{});
  await womanPanel.getByRole('radio',{name:'Categoria geral',exact:true}).waitFor();
  assert.equal(await womanPanel.getByRole('radio',{name:'Feminino 18-39',exact:true}).count(),1);checks++;
  assert.equal(await womanPanel.getByRole('radio',{name:'Masculino 40+',exact:true}).count(),0);checks++;

  // Cópia da origem (geral) para a mulher funciona.
  await womanPanel.getByRole('button',{name:'Copiar de outro participante',exact:true}).click();
  await page.locator('[aria-label="Escolher origem da cópia"]').getByRole('radio',{name:/João Silva/}).check();
  await page.locator('[aria-label="Escolher origem da cópia"]').getByRole('button',{name:'OK',exact:true}).click();
  await page.waitForTimeout(1300);
  assert.equal(order.items.find(i=>i.participant_id==='16899535009')?.choices?.category_id,'cat-geral');checks++;

  // Troca a mulher para categoria feminina e conclui.
  await womanPanel.getByRole('button',{name:/Categoria:/}).click();
  page.once('dialog',dialog=>dialog.accept());
  await womanPanel.getByRole('radio',{name:'Feminino 18-39',exact:true}).locator('..').click();
  await page.waitForTimeout(700);
  if(await womanPanel.getByRole('radio',{name:'Kit único',exact:true}).count()) {
    await womanPanel.getByRole('radio',{name:'Kit único',exact:true}).locator('..').click();
    await page.waitForTimeout(500);
  }
  await womanPanel.getByRole('button',{name:'Concluir participante',exact:true}).click();
  await page.getByRole('button',{name:/Maria Corredora.*Escolhas completas/}).waitFor();
  assert.equal(order.items.find(i=>i.participant_id==='16899535009')?.choices?.category_id,'cat-fem');checks++;

  // Menor de idade: feminino 18-39 some; geral permanece.
  await addGuest('11144477735','Ana Jovem','2012-01-01','F');
  const teenPanel=page.locator('#choices-11144477735');
  if(!await teenPanel.isVisible()) await page.getByRole('button',{name:/Ana Jovem.*Não iniciado/}).click();
  await teenPanel.waitFor({state:'visible'});
  await teenPanel.getByText('Conferindo categorias disponíveis…').waitFor({state:'hidden'}).catch(()=>{});
  await teenPanel.getByRole('radio',{name:'Categoria geral',exact:true}).waitFor();
  assert.equal(await teenPanel.getByRole('radio',{name:'Feminino 18-39',exact:true}).count(),0);checks++;

  // Copiar categoria feminina da Maria para a menor deve falhar na elegibilidade.
  await teenPanel.getByRole('button',{name:'Copiar de outro participante',exact:true}).click();
  await page.locator('[aria-label="Escolher origem da cópia"]').getByRole('radio',{name:/Maria Corredora/}).check();
  await page.locator('[aria-label="Escolher origem da cópia"]').getByRole('button',{name:'OK',exact:true}).click();
  await page.getByText(/Idade mínima desta categoria: 18 anos/i).waitFor();checks++;
  assert.equal(order.items.find(i=>i.participant_id==='11144477735')?.choices?.category_id,undefined);checks++;
  assert.deepEqual(errors,[]);checks++;
  console.log(`${checks} verificações de elegibilidade de categoria aprovadas.`);
} finally {await browser.close();}
