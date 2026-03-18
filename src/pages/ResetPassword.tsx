import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { resetPassword, validateResetToken } from "@/lib/api/passwordReset";
import { toast } from "sonner";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  // Debug: log token
  useEffect(() => {
    if (token) {
      console.log('🔍 [ResetPassword] Token da URL:', {
        token: token.substring(0, 20) + '...',
        tokenLength: token.length,
        fullToken: token,
      });
    } else {
      console.log('❌ [ResetPassword] Token não encontrado na URL');
    }
  }, [token]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        console.log('❌ [ResetPassword] Token não encontrado na URL');
        setValidating(false);
        setTokenValid(false);
        return;
      }

      console.log('🔍 [ResetPassword] Iniciando validação do token:', {
        tokenFromUrl: token.substring(0, 20) + '...',
        tokenLength: token.length,
      });

      try {
        const response = await validateResetToken(token);
        console.log('🔍 [ResetPassword] Resposta da validação:', {
          success: response.success,
          valid: response.valid,
          message: response.message,
        });
        setTokenValid(response.valid);
      } catch (error: any) {
        console.error("❌ [ResetPassword] Erro ao validar token:", error);
        setTokenValid(false);
      } finally {
        setValidating(false);
      }
    };

    validateToken();
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
      toast.error("Token inválido");
      return;
    }

    setLoading(true);

    try {
      const response = await resetPassword({
        token,
        newPassword: password,
      });

      if (response.success) {
        setSuccess(true);
        toast.success("Senha alterada com sucesso!");
        setTimeout(() => {
          navigate("/auth");
        }, 3000);
      } else {
        toast.error(response.error || "Erro ao redefinir senha");
      }
    } catch (error: any) {
      console.error("Error resetting password:", error);
      toast.error(error.message || "Erro ao redefinir senha");
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
              <p className="text-sm text-muted-foreground">Validando token...</p>
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
            <CardTitle className="text-2xl font-bold text-center">CRONOTEAM</CardTitle>
            <CardDescription className="text-center">
              Token Inválido ou Expirado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-center">
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  O link de recuperação de senha é inválido ou expirou.
                </p>
                <p className="text-sm text-muted-foreground mb-6">
                  Os links de recuperação expiram em 1 dia (24 horas). Solicite um novo link.
                </p>
              </div>
              <div className="space-y-2">
                <Link to="/forgot-password">
                  <Button className="w-full">
                    Solicitar Novo Link
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button variant="ghost" className="w-full">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para o login
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
              <div>
                <h3 className="text-lg font-semibold mb-2">Senha Redefinida com Sucesso!</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Sua senha foi alterada com sucesso. Você será redirecionado para a página de login em instantes.
                </p>
              </div>
              <Link to="/auth">
                <Button className="w-full">
                  Ir para o Login
                </Button>
              </Link>
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
          <CardTitle className="text-2xl font-bold text-center">CRONOTEAM</CardTitle>
          <CardDescription className="text-center">
            Redefinir Senha
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-6 text-center">
            Digite sua nova senha abaixo.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova Senha</Label>
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
              <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
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
                  Redefinindo...
                </>
              ) : (
                "Redefinir Senha"
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
        </CardContent>
      </Card>
    </div>
  );
}

