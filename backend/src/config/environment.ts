import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Prioridade: ambiente do processo > backend/.env > .env da raiz, independente do cwd. */
export function loadEnvironmentFiles(files:string[],target:NodeJS.ProcessEnv=process.env) {
  for(const file of files) dotenv.config({path:file,processEnv:target as Record<string,string>,override:false});
}

// Mesmo caminho relativo em src/config e dist/config.
const backendRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
loadEnvironmentFiles([path.join(backendRoot,'.env'),path.resolve(backendRoot,'../.env')]);

export function isEnvironmentFlagEnabled(name:string,env:NodeJS.ProcessEnv=process.env) {
  return env[name]?.trim().toLowerCase()==='true';
}
