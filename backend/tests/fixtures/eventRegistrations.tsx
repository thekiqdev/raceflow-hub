import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {EventRegistrationsPanel} from '../../../src/components/event-registrations/EventRegistrationsPanel';
import '../../../src/index.css';
createRoot(document.getElementById('root')!).render(<BrowserRouter><EventRegistrationsPanel eventId="event" rolePage={new URLSearchParams(location.search).get('role')==='organizer'?'organizer':'admin'} backPath="/"/></BrowserRouter>);
