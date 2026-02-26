import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { User, LogIn, FileText, Trophy, UserCircle, LogOut, Calculator, Menu, Home, ClipboardList, Award } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getCorredorPath, getDashboardRoute } from "@/lib/utils/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LoginDialog } from "@/components/LoginDialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function Header() {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated } = useAuth();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const userProfile = user?.profile;
  const userName = userProfile?.full_name || user?.email || "Usuário";
  const isRunner = user?.roles?.includes('runner');

  return (
    <header className="bg-black text-white py-4 sticky top-0 z-50">
      <div className="container mx-auto px-4 flex items-center justify-between relative">
        {/* Menu Hambúrguer - Mobile (esquerda) */}
        <div className="md:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
                aria-label="Abrir menu"
              >
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[400px] bg-black text-white">
              <SheetHeader>
                <SheetTitle className="text-white">Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-4 mt-6">
                <Link
                  to="/events"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <Trophy className="w-5 h-5" />
                  <span>Eventos</span>
                </Link>
                <Link
                  to="/results"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <Trophy className="w-5 h-5" />
                  <span>Resultados</span>
                </Link>
                <Link
                  to="/orcamento"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <Calculator className="w-5 h-5" />
                  <span>Orçamento</span>
                </Link>
                <Link
                  to="/faq"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <FileText className="w-5 h-5" />
                  <span>FAQ</span>
                </Link>
                {isAuthenticated ? (
                  <>
                    <div className="border-t border-white/20 my-2"></div>
                    {isRunner ? (
                      <>
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            navigate(getCorredorPath("home"));
                          }}
                          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <Home className="w-5 h-5" />
                          <span>Início</span>
                        </button>
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            navigate(getCorredorPath("registrations"));
                          }}
                          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <ClipboardList className="w-5 h-5" />
                          <span>Inscrições</span>
                        </button>
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            navigate(getCorredorPath("results"));
                          }}
                          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <Award className="w-5 h-5" />
                          <span>Resultados</span>
                        </button>
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            navigate(getCorredorPath("profile"));
                          }}
                          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <UserCircle className="w-5 h-5" />
                          <span>Perfil</span>
                        </button>
                        <div className="border-t border-white/20 my-2"></div>
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            handleLogout();
                          }}
                          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <LogOut className="w-5 h-5" />
                          <span>Sair</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            navigate(getDashboardRoute(user));
                          }}
                          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <UserCircle className="w-5 h-5" />
                          <span>Dashboard</span>
                        </button>
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            handleLogout();
                          }}
                          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <LogOut className="w-5 h-5" />
                          <span>Sair</span>
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="border-t border-white/20 my-2"></div>
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setLoginDialogOpen(true);
                      }}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                    >
                      <LogIn className="w-5 h-5" />
                      <span>Entrar</span>
                    </button>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        {/* Logo - Centralizado no mobile */}
        <Link to="/" className="absolute left-1/2 transform -translate-x-1/2 md:relative md:left-0 md:transform-none flex items-center gap-2">
          <div className="border-2 border-white px-4 py-2">
            <span className="text-xl font-bold">CRONOTEAM</span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link
            to="/events"
            className="hover:text-gray-300 transition-colors flex items-center gap-2"
          >
            <Trophy className="w-4 h-4" />
            Eventos
          </Link>
          <Link
            to="/results"
            className="hover:text-gray-300 transition-colors flex items-center gap-2"
          >
            <Trophy className="w-4 h-4" />
            Resultados
          </Link>
          <Link
            to="/orcamento"
            className="hover:text-gray-300 transition-colors flex items-center gap-2"
          >
            <Calculator className="w-4 h-4" />
            Orçamento
          </Link>
          <Link
            to="/faq"
            className="hover:text-gray-300 transition-colors flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            FAQ
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {getInitials(userName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden md:inline">{userName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {isRunner ? (
                    <>
                      <DropdownMenuItem onClick={() => navigate(getCorredorPath("home"))}>
                        <Home className="mr-2 h-4 w-4" />
                        Início
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(getCorredorPath("registrations"))}>
                        <ClipboardList className="mr-2 h-4 w-4" />
                        Inscrições
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(getCorredorPath("results"))}>
                        <Award className="mr-2 h-4 w-4" />
                        Resultados
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(getCorredorPath("profile"))}>
                        <UserCircle className="mr-2 h-4 w-4" />
                        Perfil
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sair
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => navigate(getDashboardRoute(user))}>
                        <UserCircle className="mr-2 h-4 w-4" />
                        Dashboard
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sair
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button
              onClick={() => setLoginDialogOpen(true)}
              variant="ghost"
              size="icon"
              className="md:size-auto md:px-4 border border-white text-white bg-transparent hover:bg-white hover:text-black"
              aria-label="Entrar"
            >
              <LogIn className="h-5 w-5 md:mr-2 md:h-4 md:w-4" />
              <span className="hidden md:inline">Entrar</span>
            </Button>
          )}
        </div>
      </div>

      <LoginDialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen} />
    </header>
  );
}
