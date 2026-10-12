import { it } from 'node:test';
import assert from 'node:assert/strict';
import { currentTicketIdentity,ticketVersion } from '../src/services/checkoutTicketIdentity.js';
it('ingresso anterior à migração conserva identidade e versão zero',()=>{
  const identity={fullName:'Original',cpf:'52998224725'};
  const row={snapshot:{identity}};
  assert.equal(currentTicketIdentity(row),identity);assert.equal(ticketVersion(row),0);
  assert.equal(currentTicketIdentity({...row,checkout_current_identity:null}),identity);
});
it('titular atual tem precedência sem modificar a fotografia da compra',()=>{
  const original={fullName:'Original'},current={fullName:'Atual'};
  const row={snapshot:{identity:original},checkout_current_identity:current,checkout_ticket_version:2};
  assert.equal(currentTicketIdentity(row),current);assert.equal(ticketVersion(row),2);
  assert.equal(row.snapshot.identity,original);
});
