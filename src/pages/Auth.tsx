import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getDashboardRoute } from "@/lib/utils/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { maskCpf, maskEmailOrCpf, maskPhone } from "@/lib/utils/masks";
import { getPublicBranding } from "@/lib/api/systemSettings";
import { validatePhone as validatePhoneStrict, PHONE_VALIDATION_MESSAGE, validateFullName, FULL_NAME_VALIDATION_MESSAGE, validateBirthDateRange, BIRTH_DATE_VALIDATION_MESSAGE, validateGender, GENDER_VALIDATION_MESSAGE, normalizeGender } from "@/lib/utils/profileValidation";
import { normalizePhoneDigits, normalizePersonName } from "@/lib/utils/profileNormalization";
import { normalizeBirthDateForCompare } from "@/lib/utils/validators";
import { useCpfBrasilLookup } from "@/hooks/useCpfBrasilLookup";
import type { LookupCpfData } from "@/lib/api/auth";
import { toast } from "sonner";

const Auth = () => {
  const navigate = useNavigate();
  const { login, register, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginCpfOnly, setLoginCpfOnly] = useState(false);

  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [genderLockedFromLookup, setGenderLockedFromLookup] = useState(false);
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [cpfLookupProof, setCpfLookupProof] = useState<string | null>(null);
  /** CPF encontrado na API — aguarda confirmação da data de nascimento antes de liberar o proof. */
  const [pendingApiLookup, setPendingApiLookup] = useState<{
    data: LookupCpfData;
    proof: string;
  } | null>(null);

  const birthDateRef = useRef(birthDate);
  useEffect(() => {
    birthDateRef.current = birthDate;
  }, [birthDate]);

  const clearLookupCompletedRef = useRef(() => {});

  const applyApiLookupSuccess = useCallback((data: LookupCpfData, proof: string) => {
    const apiBd = normalizeBirthDateForCompare(data.birth_date);
    setFullName(data.full_name);
    setBirthDate(apiBd);
    const recognizedGender = data.gender === "M" || data.gender === "F";
    setGender(recognizedGender ? data.gender : "");
    setGenderLockedFromLookup(Boolean(data.gender_locked && recognizedGender));
    setCpfLookupProof(proof);
    setPendingApiLookup(null);
  }, []);

  const onLookupSuccess = useCallback(
    (data: LookupCpfData, proof: string) => {
      const userBd = normalizeBirthDateForCompare(birthDateRef.current);
      const apiBd = normalizeBirthDateForCompare(data.birth_date);

      if (!userBd) {
        // Consulta só com CPF: pede a data para confirmar sem expor dados ainda via proof.
        setPendingApiLookup({ data, proof });
        setCpfLookupProof(null);
        setFullName("");
        setGender("");
        setGenderLockedFromLookup(false);
        clearLookupCompletedRef.current();
        return;
      }

      if (userBd !== apiBd) {
        toast.error(
          "A data de nascimento não confere com o CPF consultado. Verifique e tente novamente."
        );
        clearLookupCompletedRef.current();
        setPendingApiLookup(null);
        setFullName("");
        setGender("");
        setGenderLockedFromLookup(false);
        setCpfLookupProof(null);
        return;
      }

      applyApiLookupSuccess(data, proof);
    },
    [applyApiLookupSuccess]
  );

  const onLookupInvalidate = useCallback(() => {
    setFullName("");
    setBirthDate("");
    setGender("");
    setGenderLockedFromLookup(false);
    setCpfLookupProof(null);
    setPendingApiLookup(null);
  }, []);

  const onManualEntry = useCallback((proof: string) => {
    // Not-found: libera preenchimento manual e preserva a data já informada.
    setPendingApiLookup(null);
    setGenderLockedFromLookup(false);
    setFullName("");
    setGender("");
    setCpfLookupProof(proof);
  }, []);

  const { lookupLoading, lookupError, manualLookup, cpfAlreadyRegistered, clearLookupCompleted, isManualMode } =
    useCpfBrasilLookup({
      cpfMasked: cpf,
      onSuccess: onLookupSuccess,
      onInvalidate: onLookupInvalidate,
      onManualEntry,
    });

  useEffect(() => {
    clearLookupCompletedRef.current = clearLookupCompleted;
  }, [clearLookupCompleted]);

  // Confirma CPF encontrado quando o usuário informa a data após a consulta.
  useEffect(() => {
    if (!pendingApiLookup) return;
    const userBd = normalizeBirthDateForCompare(birthDate);
    if (!userBd) return;
    const apiBd = normalizeBirthDateForCompare(pendingApiLookup.data.birth_date);
    if (userBd === apiBd) {
      applyApiLookupSuccess(pendingApiLookup.data, pendingApiLookup.proof);
    }
  }, [birthDate, pendingApiLookup, applyApiLookupSuccess]);

  const cpfProofReady = Boolean(cpfLookupProof);
  const fieldsReadOnlyFromApi = cpfProofReady && !isManualMode;

  const { user } = useAuth();

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(getDashboardRoute(user));
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    getPublicBranding().then((res) => {
      if (res.success && res.data) {
        setLoginCpfOnly(res.data.login_cpf_only === true);
      }
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const success = await login(loginEmail, loginPassword);
      if (success) {
        setTimeout(() => {
          const currentUser = JSON.parse(localStorage.getItem("auth_user") || "{}");
          navigate(getDashboardRoute(currentUser as any));
        }, 100);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!lgpdConsent) {
      return;
    }

    if (!cpfLookupProof) {
      toast.error("Consulte o CPF para continuar");
      return;
    }

    const normalizedName = normalizePersonName(fullName);
    const fullNameCheck = validateFullName(normalizedName);
    if (!fullNameCheck.valid) {
      toast.error(fullNameCheck.message ?? FULL_NAME_VALIDATION_MESSAGE);
      return;
    }

    const birthDateCheck = validateBirthDateRange(birthDate);
    if (!birthDateCheck.valid) {
      toast.error(birthDateCheck.message ?? BIRTH_DATE_VALIDATION_MESSAGE);
      return;
    }

    const genderCheck = validateGender(gender);
    if (!genderCheck.valid) {
      toast.error(genderCheck.message ?? GENDER_VALIDATION_MESSAGE);
      return;
    }

    setLoading(true);

    try {
      const success = await register({
        email: signupEmail,
        password: signupPassword,
        full_name: normalizedName,
        cpf: cpf.replace(/\D/g, ""),
        phone: normalizePhoneDigits(phone),
        birth_date: birthDate,
        gender: normalizeGender(gender) as "M" | "F" | "O",
        lgpd_consent: lgpdConsent,
        cpf_lookup_proof: cpfLookupProof,
      });

      if (success) {
        setTimeout(() => {
          const currentUser = JSON.parse(localStorage.getItem("auth_user") || "{}");
          navigate(getDashboardRoute(currentUser as any));
        }, 100);
      }
    } finally {
      setLoading(false);
    }
  };

  const canSubmitSignUp =
    Boolean(cpfLookupProof) &&
    validateFullName(normalizePersonName(fullName)).valid &&
    validateBirthDateRange(birthDate).valid &&
    validateGender(gender).valid &&
    validatePhoneStrict(phone).valid &&
    Boolean(signupEmail) &&
    signupPassword.length >= 6 &&
    lgpdConsent;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">CRONOTEAM</CardTitle>
          <CardDescription className="text-center">
            Plataforma de gestão de corridas de rua
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={isSignUp ? "signup" : "login"} onValueChange={(v) => setIsSignUp(v === "signup")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar Conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">{loginCpfOnly ? "CPF" : "E-mail ou CPF"}</Label>
                  <Input
                    id="login-email"
                    type="text"
                    inputMode={loginCpfOnly ? "numeric" : "email"}
                    autoComplete="username"
                    placeholder={loginCpfOnly ? "000.000.000-00" : "seu@email.com ou 000.000.000-00"}
                    value={loginEmail}
                    onChange={(e) =>
                      setLoginEmail(loginCpfOnly ? maskCpf(e.target.value) : maskEmailOrCpf(e.target.value))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                    Esqueceu sua senha?
                  </Link>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Entrar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="space-y-4">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-cpf">CPF *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="signup-cpf"
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={(e) => setCpf(maskCpf(e.target.value))}
                      maxLength={14}
                      required
                      disabled={loading}
                      className="flex-1"
                    />
                  </div>
                  {lookupLoading && (
                    <p className="text-xs text-muted-foreground">Consultando dados…</p>
                  )}
                  {lookupError && (
                    <div className="space-y-2">
                      <p className="text-sm text-destructive">{lookupError}</p>
                      {cpfAlreadyRegistered && (
                        <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                          Recuperar senha
                        </Link>
                      )}
                    </div>
                  )}
                  {!cpfProofReady && !pendingApiLookup && (
                    <p className="text-xs text-muted-foreground">
                      Informe o CPF e clique em Consultar.
                    </p>
                  )}
                  {isManualMode && cpfProofReady && (
                    <p className="text-xs text-muted-foreground">
                      Preencha nome, sexo e a data de nascimento.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-birthdate">Data de nascimento *</Label>
                  <Input
                    id="signup-birthdate"
                    type="date"
                    value={birthDate}
                    readOnly={fieldsReadOnlyFromApi}
                    onChange={(e) => !fieldsReadOnlyFromApi && setBirthDate(e.target.value)}
                    required
                    max={new Date().toISOString().split("T")[0]}
                    className={fieldsReadOnlyFromApi ? "bg-muted" : ""}
                  />
                  {pendingApiLookup && !cpfProofReady && (
                    <p className="text-xs text-muted-foreground">
                      Deve ser a mesma data que consta no seu documento de identificação.
                    </p>
                  )}
                  {isManualMode && cpfProofReady && (
                    <p className="text-xs text-muted-foreground">
                      Informe a data do seu documento.
                    </p>
                  )}
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => manualLookup()}
                    disabled={
                      loading ||
                      lookupLoading ||
                      cpf.replace(/\D/g, "").length !== 11
                    }
                  >
                    {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Consultar"}
                  </Button>
                </div>

                {cpfProofReady && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Nome completo *</Label>
                      <Input
                        id="signup-name"
                        placeholder={isManualMode ? "Seu nome completo" : "Preenchido após confirmar CPF e data"}
                        value={fullName}
                        readOnly={fieldsReadOnlyFromApi}
                        onChange={(e) => !fieldsReadOnlyFromApi && setFullName(e.target.value)}
                        required
                        className={fieldsReadOnlyFromApi ? "bg-muted" : ""}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-gender">Sexo *</Label>
                      {genderLockedFromLookup && fieldsReadOnlyFromApi ? (
                        <Input
                          id="signup-gender"
                          value={gender === "M" ? "Masculino" : "Feminino"}
                          readOnly
                          placeholder="—"
                          required
                          className="bg-muted"
                        />
                      ) : (
                        <select
                          id="signup-gender"
                          value={gender}
                          onChange={(e) => setGender(e.target.value)}
                          required
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Selecione</option>
                          <option value="M">Masculino</option>
                          <option value="F">Feminino</option>
                          <option value="O">Outro / Não informar</option>
                        </select>
                      )}
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="signup-phone">Telefone *</Label>
                  <Input
                    id="signup-phone"
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                    maxLength={15}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="lgpd"
                    checked={lgpdConsent}
                    onCheckedChange={(checked) => setLgpdConsent(checked as boolean)}
                  />
                  <Label htmlFor="lgpd" className="text-sm leading-relaxed cursor-pointer">
                    Aceito os termos de uso e política de privacidade (LGPD)
                  </Label>
                </div>
                <Button type="submit" className="w-full" disabled={loading || !lgpdConsent || !canSubmitSignUp}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
