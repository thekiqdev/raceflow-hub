import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { BottomNav } from "@/components/runner/BottomNav";
import { ExploreEvents } from "@/components/runner/ExploreEvents";
import { MyRegistrations } from "@/components/runner/MyRegistrations";
import { Results } from "@/components/runner/Results";
import { Profile } from "@/components/runner/Profile";

export default function RunnerDashboard() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl && ["home", "registrations", "results", "profile"].includes(tabFromUrl)) {
      return tabFromUrl;
    }
    return localStorage.getItem("runnerActiveTab") || "home";
  });

  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl && ["home", "registrations", "results", "profile"].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    localStorage.setItem("runnerActiveTab", activeTab);
  }, [activeTab]);

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
      <div className="animate-fade-in">
        {renderContent()}
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
