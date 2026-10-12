import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation,Link } from "react-router-dom";
import {useAuth} from '@/contexts/AuthContext';
import { BottomNav } from "@/components/runner/BottomNav";
import { ExploreEvents } from "@/components/runner/ExploreEvents";
import { MyRegistrations } from "@/components/runner/MyRegistrations";
import { Results } from "@/components/runner/Results";
import { Profile } from "@/components/runner/Profile";
import { MissingAttributesAlert } from "@/components/runner/MissingAttributesAlert";
import { MissingAttributesModal } from "@/components/runner/MissingAttributesModal";
import { getCorredorPath, getCorredorTabFromPath } from "@/lib/utils/navigation";

const VALID_TABS = ["home", "registrations", "results", "profile"];

export default function RunnerDashboard({personalTickets=false}:{personalTickets?:boolean}={}) {
  const {user}=useAuth();
  const navigate = useNavigate();
  const { section: sectionParam } = useParams<{ section?: string }>();
  const location = useLocation();
  const [showMissingAttributesModal, setShowMissingAttributesModal] = useState(false);

  const activeTab = personalTickets?'registrations':getCorredorTabFromPath(location.pathname);

  useEffect(() => {
    if(personalTickets) return;
    if (!sectionParam || sectionParam === "") {
      navigate(getCorredorPath("home"), { replace: true });
      return;
    }
    const tab = getCorredorTabFromPath(location.pathname);
    if (!VALID_TABS.includes(tab)) {
      navigate(getCorredorPath("home"), { replace: true });
    }
  }, [sectionParam, location.pathname, navigate,personalTickets]);

  const handleSelectAttributes = () => {
    setShowMissingAttributesModal(true);
  };

  const handleAttributesSaved = () => {
    // Limpar flag de descarte do alerta para que ele possa aparecer novamente se houver mais pendências
    localStorage.removeItem("missingAttributesAlertDismissed");
    // Recarregar a página ou atualizar o estado conforme necessário
    window.location.reload();
  };

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <ExploreEvents />;
      case "registrations":
        return <MyRegistrations />;
      case "results":
        return <Results />;
      case "profile":
        return <Profile />;
      default:
        return <ExploreEvents />;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {personalTickets && !user?.roles?.includes('runner') && <Link className="block p-4 underline" to="/dashboard">Voltar à minha conta</Link>}
      <div className="animate-fade-in">
        {/* Alerta de atributos pendentes - aparece em todas as tabs */}
        <MissingAttributesAlert onSelectClick={handleSelectAttributes} />
        {renderContent()}
      </div>
      {user?.roles?.includes('runner') && <BottomNav activeTab={activeTab} />}
      <MissingAttributesModal
        open={showMissingAttributesModal}
        onOpenChange={setShowMissingAttributesModal}
        onSuccess={handleAttributesSaved}
      />
    </div>
  );
}
