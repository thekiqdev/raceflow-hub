import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter,Routes,Route } from 'react-router-dom';
import { AuthProvider } from '../../../src/contexts/AuthContext';
import { CheckoutPurchases } from '../../../src/components/registration/CheckoutPurchases';
import CheckoutTicketPage from '../../../src/pages/CheckoutTicketPage';
import ValidateRegistration from '../../../src/pages/ValidateRegistration';
import '../../../src/index.css';
const mode=new URLSearchParams(window.location.search).get('mode');
createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthProvider><BrowserRouter><Routes>
  <Route path="/ingresso" element={<CheckoutTicketPage/>}/>
  <Route path="/registration/validate/:id" element={<ValidateRegistration/>}/>
  <Route path="*" element={mode==='ticket'?<CheckoutTicketPage/>:<main className="mx-auto max-w-5xl p-4 sm:p-8"><CheckoutPurchases eventId={mode==='organizer'?'event':undefined}/></main>}/>
</Routes></BrowserRouter></AuthProvider></React.StrictMode>);
