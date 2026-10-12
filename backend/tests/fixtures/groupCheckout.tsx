// Harness local: APIs são interceptadas pelo teste, nunca usa o banco/gateway real.
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { GroupRegistrationFlow } from '../../../src/components/registration/GroupRegistrationFlow';
import '../../../src/index.css';
function Fixture() {
  const [open,setOpen]=React.useState(true);
  return <><button onClick={()=>setOpen(true)}>Retomar inscrições</button><GroupRegistrationFlow
    open={open} onOpenChange={setOpen} buyerId="00000000-0000-4000-8000-000000000001"
    event={{id:'00000000-0000-4000-8000-000000000002',title:'Corrida de teste · 5 km',pix_enabled:true,credit_card_enabled:true}}/></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><Fixture/></BrowserRouter></React.StrictMode>);
