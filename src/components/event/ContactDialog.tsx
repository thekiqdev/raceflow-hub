import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, HelpCircle, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle?: string;
}

type ContactStep = "select" | "form";
type ContactType = "event" | "platform" | null;

export const ContactDialog = ({ open, onOpenChange, eventTitle }: ContactDialogProps) => {
  const [step, setStep] = useState<ContactStep>("select");
  const [contactType, setContactType] = useState<ContactType>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const { toast } = useToast();

  // Form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      checkAuth();
      resetForm();
      setStep("select");
      setContactType(null);
    }
  }, [open]);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setIsLoggedIn(true);
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      
      if (profile) {
        setUserProfile(profile);
        setName(profile.full_name || "");
        setPhone(profile.phone || "");
        setEmail(user.email || "");
      }
    } else {
      setIsLoggedIn(false);
      setUserProfile(null);
    }
  };

  const resetForm = () => {
    setName("");
    setPhone("");
    setEmail("");
    setSubject("");
    setMessage("");
  };

  const handleSelectType = (type: ContactType) => {
    setContactType(type);
    setStep("form");
    if (type === "event" && eventTitle) {
      setSubject(`Dúvida sobre: ${eventTitle}`);
    } else if (type === "platform") {
      setSubject("Dúvida sobre a plataforma");
    }
  };

  const handleBack = () => {
    setStep("select");
    setContactType(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // TODO: Implementar envio do contato para o backend
      // Por enquanto, apenas simulamos o envio
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: "Mensagem enviada!",
        description: "Sua mensagem foi enviada com sucesso. Entraremos em contato em breve.",
      });
      
      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast({
        title: "Erro ao enviar",
        description: "Ocorreu um erro ao enviar sua mensagem. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {step === "select" ? "Entre em Contato" : "Enviar Mensagem"}
          </DialogTitle>
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground mb-6">
              Selecione o tipo de dúvida para ser direcionado ao setor responsável:
            </p>
            
            <Button
              variant="outline"
              className="w-full h-auto py-6 flex flex-col items-center gap-2 group"
              onClick={() => handleSelectType("event")}
            >
              <MessageSquare className="h-8 w-8 text-primary" />
              <div className="text-center">
                <div className="font-semibold">Dúvidas sobre o Evento</div>
                <div className="text-xs text-muted-foreground group-hover:text-white transition-colors">
                  Fale diretamente com o organizador do evento
                </div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full h-auto py-6 flex flex-col items-center gap-2 group"
              onClick={() => handleSelectType("platform")}
            >
              <HelpCircle className="h-8 w-8 text-primary" />
              <div className="text-center">
                <div className="font-semibold">Dúvidas sobre a Plataforma</div>
                <div className="text-xs text-muted-foreground group-hover:text-white transition-colors">
                  Fale com o suporte da plataforma
                </div>
              </div>
            </Button>
          </div>
        )}

        {step === "form" && (
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>

            {isLoggedIn && userProfile && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Seus dados:</p>
                <div className="text-sm space-y-1">
                  <p><strong>Nome:</strong> {userProfile.full_name}</p>
                  <p><strong>Email:</strong> {email}</p>
                  <p><strong>Telefone:</strong> {userProfile.phone}</p>
                </div>
              </div>
            )}

            {!isLoggedIn && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome completo"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    required
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="subject">Assunto *</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Assunto da mensagem"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Mensagem *</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Descreva sua dúvida..."
                className="min-h-[120px]"
                required
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Enviando..." : "Enviar Mensagem"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
