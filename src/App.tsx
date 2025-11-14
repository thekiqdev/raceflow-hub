import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Events from "./pages/Events";
import EventDetails from "./pages/EventDetails";
import OrganizerDashboard from "./pages/OrganizerDashboard";
import RunnerProfile from "./pages/RunnerProfile";
import RunnerDashboard from "./pages/RunnerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Quote from "./pages/Quote";
import FAQ from "./pages/FAQ";
import RegistrationQRCode from "./pages/RegistrationQRCode";
import ValidateRegistration from "./pages/ValidateRegistration";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:id" element={<EventDetails />} />
          <Route path="/organizer/dashboard" element={<OrganizerDashboard />} />
          <Route path="/runner/profile" element={<RunnerProfile />} />
          <Route path="/runner/dashboard" element={<RunnerDashboard />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/orcamento" element={<Quote />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/registration/qrcode/:id" element={<RegistrationQRCode />} />
          <Route path="/registration/validate/:id" element={<ValidateRegistration />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
