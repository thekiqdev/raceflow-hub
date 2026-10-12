import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm,rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadEnvironmentFiles,isEnvironmentFlagEnabled } from '../src/config/environment.js';

it('carrega backend antes da raiz e preserva configuração explícita do processo',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'cronoteam-env-test-'));
  try {
    const backend=path.join(dir,'backend.env'),root=path.join(dir,'root.env');
    await writeFile(backend,'MULTI_REGISTRATION_CHECKOUT_ENABLED=true\nPRIORITY=backend\n');
    await writeFile(root,'MULTI_REGISTRATION_CHECKOUT_ENABLED=false\nROOT_FALLBACK=loaded\n');
    const env:NodeJS.ProcessEnv={PRIORITY:'process'};
    loadEnvironmentFiles([backend,root],env);
    assert.equal(env.PRIORITY,'process');assert.equal(env.ROOT_FALLBACK,'loaded');
    assert.equal(isEnvironmentFlagEnabled('MULTI_REGISTRATION_CHECKOUT_ENABLED',env),true);
    const disabled:NodeJS.ProcessEnv={MULTI_REGISTRATION_CHECKOUT_ENABLED:'false'};
    loadEnvironmentFiles([backend,root],disabled);
    assert.equal(isEnvironmentFlagEnabled('MULTI_REGISTRATION_CHECKOUT_ENABLED',disabled),false);
    const fallback:NodeJS.ProcessEnv={};loadEnvironmentFiles([path.join(dir,'missing'),backend],fallback);
    assert.equal(isEnvironmentFlagEnabled('MULTI_REGISTRATION_CHECKOUT_ENABLED',fallback),true);
  } finally {
    await rm(path.join(dir,'backend.env'),{force:true});
    await rm(path.join(dir,'root.env'),{force:true});
    await rmdir(dir);
  }
});
it('ativação exige true; aceita espaços/maiúsculas e nunca usa a flag do frontend como autorização',()=>{
  const key='MULTI_REGISTRATION_CHECKOUT_ENABLED';
  for(const value of ['true',' TRUE ','True']) assert.equal(isEnvironmentFlagEnabled(key,{[key]:value}),true);
  for(const value of [undefined,'false','','1','yes']) assert.equal(isEnvironmentFlagEnabled(key,{[key]:value}),false);
  assert.equal(isEnvironmentFlagEnabled(key,{VITE_MULTI_REGISTRATION_CHECKOUT_ENABLED:'true'}),false);
});
