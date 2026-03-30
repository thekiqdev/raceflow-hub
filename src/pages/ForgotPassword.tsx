import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Mail } from "lucide-react";
import { requestPasswordReset } from "@/lib/api/passwordReset";
import { toast } from "sonner";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await requestPasswordReset({ email: email.trim() });
      
      if (response.success) {
        setEmailSent(true);
        toast.success("Se o e-mail estiver cadastrado, você receberá um link de recuperação de senha.");
      } else {
        toast.error(response.error || "Erro ao solicitar recuperação de senha");
      }
    } catch (error: any) {
      console.error("Error requesting password reset:", error);
      toast.error(error.message || "Erro ao solicitar recuperação de senha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">CRONOTEAM</CardTitle>
          <CardDescription className="text-center">
            Recuperação de Senha
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!emailSent ? (
            <>
              <p className="text-sm text-muted-foreground mb-6 text-center">
                Digite seu e-mail e enviaremos um link para redefinir sua senha.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Enviar Link de Recuperação
                    </>
                  )}
                </Button>
                <div className="text-center">
                  <Link
                    to="/auth"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Voltar para o login
                  </Link>
                </div>
              </form>
            </>
          ) : (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <Mail className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">E-mail Enviado!</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Enviamos um link de recuperação de senha para <strong>{email}</strong>
                </p>
                <p className="text-sm text-muted-foreground mb-6">
                  Verifique sua caixa de entrada e clique no link para redefinir sua senha.
                  O link expira em 1 dia (24 horas).
                </p>
              </div>
              <div className="space-y-2">
                <Button
                  onClick={() => setEmailSent(false)}
                  variant="outline"
                  className="w-full"
                >
                  Enviar para outro e-mail
                </Button>
                <Link to="/auth">
                  <Button variant="ghost" className="w-full">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para o login
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

