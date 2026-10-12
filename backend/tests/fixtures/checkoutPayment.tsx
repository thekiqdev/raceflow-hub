import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { GroupRegistrationFlow } from '../../../src/components/registration/GroupRegistrationFlow';
import '../../../src/index.css';
const params=new URLSearchParams(location.search);
const router=createBrowserRouter([{path:'*',element:<GroupRegistrationFlow mode="page" open onOpenChange={()=>{}} buyerId="buyer" event={{id:'event',title:'Corrida de teste',pix_enabled:!params.has('cardOnly') && !params.has('noMethods'),credit_card_enabled:!params.has('noMethods')}}/>}]);
createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router}/></React.StrictMode>);
