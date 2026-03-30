import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { validateCompletionToken, setPasswordInvitation } from "@/lib/api/invitationCompletion";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function CompletarCadastro() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { refreshUser } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [runnerName, setRunnerName] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [invalidError, setInvalidError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setValidating(false);
        setTokenValid(false);
        setInvalidError("Link inválido. Use o link recebido no email.");
        return;
      }

      try {
        const result = await validateCompletionToken(token);
        setTokenValid(result.valid);
        if (result.valid) {
          setRunnerName(result.runnerName || "Corredor");
          setEventTitle(result.eventTitle || "Evento");
        } else {
          setInvalidError(result.error || "Link inválido ou expirado.");
        }
      } catch {
        setTokenValid(false);
        setInvalidError("Não foi possível validar o link. Tente novamente.");
      } finally {
        setValidating(false);
      }
    };

    validate();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    if (password.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres");
      return;
    }

    if (!token) {
      toast.error("Link inválido");
      return;
    }

    setLoading(true);

    try {
      const response = await setPasswordInvitation({ token, newPassword: password });

      if (response.success && response.data) {
        const { user, token: authToken } = response.data;
        localStorage.setItem("auth_token", authToken);
        localStorage.setItem("auth_user", JSON.stringify(user));
        setSuccess(true);
        toast.success("Senha definida com sucesso! Redirecionando...");
        await refreshUser();
        setTimeout(() => {
          navigate("/corredor/minhas-inscricoes?openMissingAttributes=1", { replace: true });
        }, 1500);
      } else {
        toast.error(response.error || response.message || "Erro ao definir senha");
      }
    } catch (error: any) {
      console.error("Error setting password:", error);
      toast.error(error.message || error?.error || "Erro ao definir senha");
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mb-4" />
              <p className="text-sm text-muted-foreground">Validando link...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Completar cadastro</CardTitle>
            <CardDescription className="text-center">
              Link inválido ou expirado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-center">
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <p className="text-sm text-muted-foreground">{invalidError}</p>
              <p className="text-sm text-muted-foreground">
                Use o link que você recebeu no email do convite. O link expira em 7 dias.
              </p>
              <div className="space-y-2 pt-2">
                <Link to="/auth">
                  <Button className="w-full">
                    Ir para o login
                  </Button>
                </Link>
                <Link to="/">
                  <Button variant="ghost" className="w-full">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar ao início
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="space-y-4 text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold">Cadastro completado!</h3>
              <p className="text-sm text-muted-foreground">
                Redirecionando para suas inscrições...
              </p>
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Completar cadastro</CardTitle>
          <CardDescription className="text-center">
            Olá, {runnerName}! Defina uma senha para acessar sua inscrição no evento <strong>{eventTitle}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Mínimo de 8 caracteres
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar senha</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Definir senha e acessar"
              )}
            </Button>
            <div className="text-center pt-2">
              <Link
                to="/auth"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" />
                Voltar para o login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
