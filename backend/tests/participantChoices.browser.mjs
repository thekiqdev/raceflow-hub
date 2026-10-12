import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
const base=process.env.CHECKOUT_UI_TEST_URL || 'http://127.0.0.1:5186';
assert.equal(new URL(base).hostname,'127.0.0.1');
const browser=await chromium.launch({channel:'msedge',headless:true});
await mkdir('tmp/ux-stage-c',{recursive:true});
let checks=0;
try {
  for(const width of [1366,390,320]) {
    const page=await browser.newPage({viewport:{width,height:844}});
    await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await page.goto(`${base}/backend/tests/fixtures/participantChoices.html`);
    const radio=name=>page.getByRole('radio',{name,exact:true});
    const choose=name=>radio(name).locator('..').click();
    const values=async()=>JSON.parse(await page.getByLabel('Escolhas JSON').textContent());
    await page.getByText('Etapa 1 de',{exact:false}).waitFor();
    await page.getByLabel('Buscar em categoria').fill('Categoria 8');await choose('Categoria 8');
    await page.getByRole('button',{name:/Categoria: Categoria 8/}).click();
    await page.getByLabel('Buscar em categoria').fill('');
    assert.equal(await radio('Categoria 8').isChecked(),true);checks++;
    await page.getByRole('button',{name:'Ver todas as opções (8)'}).click();
    assert.equal(await page.getByRole('group',{name:'Categoria',exact:true}).getByRole('radio').count(),8);checks++;
    await page.getByRole('button',{name:'Continuar',exact:true}).click();
    await choose('Kit camiseta');
    await choose('M');
    await page.getByRole('button',{name:/Camiseta: M/}).click();
    assert.equal(await radio('P').isDisabled(),true);checks++;
    await radio('M').focus();await page.keyboard.press('ArrowRight');
    await page.getByRole('button',{name:/Camiseta: G/}).waitFor();
    assert.equal((await values()).product_selections?.[0]?.variant_id,'g');checks++;
    await page.getByRole('button',{name:/Extras/}).click();
    await page.getByLabel('Informação individual').fill('Resposta pessoal');
    await page.getByRole('button',{name:/Categoria: Categoria 8/}).click();
    page.once('dialog',dialog=>dialog.dismiss());await choose('Categoria 1');
    assert.equal((await values()).category_id,'cat8');assert.equal((await values()).custom_field_values.answer,'Resposta pessoal');checks++;
    await page.screenshot({path:`tmp/ux-stage-c/choices-${width}.png`,fullPage:true});
    assert.ok(await page.locator('main > div').evaluate(el=>el.scrollWidth<=el.clientWidth+1));checks++;
    page.once('dialog',dialog=>dialog.accept());await choose('Categoria 1');
    const changed=await values();assert.equal(changed.category_id,'cat1');assert.equal(changed.kit_id,undefined);assert.equal(changed.custom_field_values,undefined);assert.equal(changed.product_selections,undefined);checks++;
    await page.close();
  }
  console.log(`${checks} verificações de escolhas, teclado, busca, estoque e troca de categoria aprovadas.`);
} finally {await browser.close();}
