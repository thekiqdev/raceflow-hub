import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { BottomNav } from "@/components/runner/BottomNav";
import { ExploreEvents } from "@/components/runner/ExploreEvents";
import { MyRegistrations } from "@/components/runner/MyRegistrations";
import { Results } from "@/components/runner/Results";
import { Profile } from "@/components/runner/Profile";
import { Loader2 } from "lucide-react";

export default function RunnerDashboard() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl && ["home", "registrations", "results", "profile"].includes(tabFromUrl)) {
      return tabFromUrl;
    }
    return localStorage.getItem("runnerActiveTab") || "home";
  });
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl && ["home", "registrations", "results", "profile"].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
    setIsInitialized(true);
  }, [searchParams]);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem("runnerActiveTab", activeTab);
    }
  }, [activeTab, isInitialized]);

  const renderContent = () => {
    if (!isInitialized) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    try {
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
    } catch (error) {
      console.error("Error rendering dashboard content:", error);
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-destructive mb-4">Erro ao carregar o conteúdo</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-white rounded"
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="animate-fade-in">
        {renderContent()}
      </div>
      {isInitialized && <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />}
    </div>
  );
}
