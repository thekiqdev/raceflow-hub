import { it } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutReturnPath } from '../../src/lib/utils/checkoutReturnPath.ts';
it('retorno de autenticação aceita somente rotas locais de compra por slug ou UUID',()=> {
  assert.equal(checkoutReturnPath({pathname:'/evento/corrida-2026/inscricao'}),'/evento/corrida-2026/inscricao');
  assert.equal(checkoutReturnPath({pathname:'/events/00000000-0000-4000-8000-000000000001/inscricao'}),'/events/00000000-0000-4000-8000-000000000001/inscricao');
  for(const pathname of ['https://externo.test','//externo.test','/evento/%2fexterno/inscricao','/evento/%5cexterno/inscricao','/auth','/evento/../inscricao','/evento/%/inscricao']) {
    assert.equal(checkoutReturnPath({pathname}),null,pathname);
  }
  for(const value of [null,undefined,'/evento/corrida/inscricao',{pathname:3},{}]) assert.equal(checkoutReturnPath(value),null);
});
it('preserva query segura de compra (cupom, ref, pedido, novo)',()=> {
  assert.equal(
    checkoutReturnPath({pathname:'/evento/corrida-2026/inscricao',search:'?cupom=LIDER1&ref=EHV892&pedido=order&novo=1&utm=x'}),
    '/evento/corrida-2026/inscricao?cupom=LIDER1&ref=EHV892&pedido=order&novo=1',
  );
  assert.equal(
    checkoutReturnPath({pathname:'/events/event/inscricao',search:'cupom=ABC'}),
    '/events/event/inscricao?cupom=ABC',
  );
  assert.equal(checkoutReturnPath({pathname:'/evento/corrida/inscricao',search:'?novo=yes'}),'/evento/corrida/inscricao');
  assert.equal(checkoutReturnPath({pathname:'/evento/corrida/inscricao',search:'?evil=1'}),'/evento/corrida/inscricao');
});
