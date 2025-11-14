import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
export function Header() {
  return <header className="bg-black text-white py-4 sticky top-0 z-50">
      <div className="container mx-auto px-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="border-2 border-white px-4 py-2">
            <span className="text-xl font-bold">CRONOTEAM</span>
            <div className="text-xs">CRONOMETRAGEM</div>
          </div>
        </Link>
        
        <nav className="hidden md:flex items-center gap-6">
          <Link to="/" className="hover:text-primary transition-colors">
            HOME
          </Link>
          <Link to="/events" className="hover:text-primary transition-colors">
            INSCRIÇÕES
          </Link>
          
          <Link to="/orcamento" className="hover:text-primary transition-colors">
            ORÇAMENTO
          </Link>
          <Link to="/faq" className="hover:text-primary transition-colors">
            DÚVIDAS
          </Link>
          <Link to="/" className="hover:text-primary transition-colors">
            RESULTADOS
          </Link>
        </nav>

        <Button className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          (85) 99108-4183
        </Button>
      </div>
    </header>;
}