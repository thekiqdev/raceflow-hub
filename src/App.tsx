import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Events from "./pages/Events";
import EventDetails from "./pages/EventDetails";
import OrganizerDashboard from "./pages/OrganizerDashboard";
import RunnerDashboard from "./pages/RunnerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import AdminEventRegistrationsPage from "./pages/AdminEventRegistrationsPage";
import OrganizerEventRegistrationsPage from "./pages/OrganizerEventRegistrationsPage";
import Quote from "./pages/Quote";
import FAQ from "./pages/FAQ";
import RegistrationQRCode from "./pages/RegistrationQRCode";
import ValidateRegistration from "./pages/ValidateRegistration";
import Cadastro from "./pages/Cadastro";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import CompletarCadastro from "./pages/CompletarCadastro";
import Results from "./pages/Results";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/completar-cadastro" element={<CompletarCadastro />} />
          <Route path="/events" element={<Events />} />
          <Route path="/evento/:slug" element={<EventDetails />} />
          <Route path="/events/:id" element={<EventDetails />} /> {/* Compatibilidade com UUID */}
          <Route path="/results" element={<Results />} />
          <Route path="/orcamento" element={<Quote />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/registration/qrcode/:id" element={<RegistrationQRCode />} />
          <Route path="/registration/validate/:id" element={<ValidateRegistration />} />
          
          {/* Ponto de entrada único (Etapa 4): /dashboard redireciona por role via getDashboardRoute */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          
          {/* Admin: URLs em português (Etapa 1); requiredRole="admin" */}
          <Route path="/admin/dashboard" element={<Navigate to="/admin/visao-geral" replace />} />
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/evento/:eventId/inscritos" 
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminEventRegistrationsPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/:section" 
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminDashboard />
              </ProtectedRoute>
            } 
          />
          
          {/* Organizador: URLs em português (Etapa 2); requiredRole="organizer" */}
          <Route path="/organizer/dashboard" element={<Navigate to="/organizador/visao-geral" replace />} />
          <Route 
            path="/organizador" 
            element={
              <ProtectedRoute requiredRole="organizer">
                <OrganizerDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/organizador/evento/:eventId/inscritos" 
            element={
              <ProtectedRoute requiredRole="organizer">
                <OrganizerEventRegistrationsPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/organizador/:section" 
            element={
              <ProtectedRoute requiredRole="organizer">
                <OrganizerDashboard />
              </ProtectedRoute>
            } 
          />
          
          {/* Corredor: URLs em português (Etapa 3); requiredRole="runner" */}
          <Route path="/runner/dashboard" element={<Navigate to="/corredor/inicio" replace />} />
          <Route path="/runner/profile" element={<Navigate to="/corredor/perfil" replace />} />
          <Route 
            path="/corredor" 
            element={
              <ProtectedRoute requiredRole="runner">
                <RunnerDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/corredor/:section" 
            element={
              <ProtectedRoute requiredRole="runner">
                <RunnerDashboard />
              </ProtectedRoute>
            } 
          />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
