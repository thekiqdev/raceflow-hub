import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Calendar, Users, Trophy, TrendingUp } from "lucide-react";
import heroImage from "@/assets/hero-running.jpg";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative h-[600px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={heroImage}
            alt="Runners in action"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/70" />
        </div>
        
        <div className="relative z-10 container mx-auto px-4 text-center text-white">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            RunEvents
          </h1>
          <p className="text-xl md:text-2xl mb-8 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
            A plataforma completa para gestão e inscrição em corridas de rua
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
            <Button
              size="lg"
              className="text-lg px-8 shadow-glow"
              onClick={() => navigate("/auth")}
            >
              Começar Agora
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/20 text-white"
              onClick={() => navigate("/events")}
            >
              Explorar Eventos
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gradient-to-b from-background to-muted/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Gerencie eventos, inscrições e pagamentos de forma simples e eficiente
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-gradient-card border-none shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
              <CardContent className="pt-6 text-center">
                <div className="w-16 h-16 bg-gradient-hero rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Gestão de Eventos</h3>
                <p className="text-muted-foreground">
                  Crie e gerencie seus eventos com facilidade total
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-card border-none shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
              <CardContent className="pt-6 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-secondary to-secondary/80 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Controle de Inscrições</h3>
                <p className="text-muted-foreground">
                  Gerencie inscrições e atletas de forma organizada
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-card border-none shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
              <CardContent className="pt-6 text-center">
                <div className="w-16 h-16 bg-gradient-accent rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trophy className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Relatórios Completos</h3>
                <p className="text-muted-foreground">
                  Estatísticas e relatórios detalhados em tempo real
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-card border-none shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
              <CardContent className="pt-6 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-primary to-destructive rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Análise Financeira</h3>
                <p className="text-muted-foreground">
                  Controle total sobre faturamento e comissões
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-hero">
        <div className="container mx-auto px-4 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Pronto para começar?
          </h2>
          <p className="text-lg mb-8 max-w-2xl mx-auto opacity-90">
            Crie sua conta gratuitamente e comece a organizar ou participar de corridas de rua hoje mesmo
          </p>
          <Button
            size="lg"
            variant="secondary"
            className="text-lg px-8 shadow-lg"
            onClick={() => navigate("/auth")}
          >
            Criar Conta Gratuita
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Index;
