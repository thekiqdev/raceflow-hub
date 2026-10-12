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
