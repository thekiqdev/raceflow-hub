import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/** Montado apenas na página de compra, dentro do data router da aplicação. */
export function CheckoutLeaveGuard({unsaved}:{unsaved:boolean}) {
  const blocker=useBlocker(unsaved);
  useEffect(()=> {
    if(blocker.state!=='blocked') return;
    if(window.confirm('Há alterações ainda não salvas. Deseja sair e descartar essas alterações?')) blocker.proceed();
    else blocker.reset();
  },[blocker]);
  return null;
}
