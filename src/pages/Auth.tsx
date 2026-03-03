import React, { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccentThemeSwitch } from "@/components/AccentThemeSwitch";
import { AppLogo } from "@/components/AppLogo";
import { AppFooter } from "@/components/AppFooter";
import { toast } from "sonner";
import { Mail, Lock, Eye, EyeOff, User, Loader2 } from "lucide-react";
import { AccentTheme, getStoredAccentTheme, toggleAccentTheme } from "@/lib/accentTheme";

type View = "login" | "signup" | "forgot";

const USERNAME_REGEX = /^[a-z0-9._-]{3,20}$/;
const ALLOWED_EMAIL_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "bol.com.br",
  "uol.com.br",
];

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizeUsername = (value: string) => value.trim().toLowerCase();
const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let usernameRpcAvailable: boolean | null = null;
const isMissingUsernameRpc = (error: any) => {
  const text = String(error?.message || error?.details || "");
  return (
    error?.status === 404 ||
    error?.code === "404" ||
    error?.code === "PGRST202" ||
    text.includes("get_login_email_by_username") ||
    text.toLowerCase().includes("could not find the function")
  );
};

const getEmailValidationError = (value: string) => {
  const email = normalizeEmail(value);
  if (!email) return "Informe seu email.";
  if (!BASIC_EMAIL_REGEX.test(email)) return "Email invalido. Exemplo: nome@gmail.com";
  const domain = email.split("@")[1] || "";
  if (!ALLOWED_EMAIL_DOMAINS.includes(domain)) {
    return "Use um provedor comum (gmail, hotmail, outlook, live, yahoo, icloud, bol ou uol).";
  }
  return "";
};

const getUsernameValidationError = (value: string) => {
  const username = normalizeUsername(value);
  if (!username) return "Escolha um nome de usuario.";
  if (!USERNAME_REGEX.test(username)) {
    return "Use 3-20 caracteres: letras minusculas, numeros, ponto, underline ou hifen.";
  }
  return "";
};

const sanitizePin = (value: string) => value.replace(/\D/g, "").slice(0, 6);

const getPinValidationError = (value: string) => {
  if (!value) return "O PIN deve conter 6 números.";
  if (!/^\d{6}$/.test(value)) return "O PIN deve conter 6 números.";
  return "";
};

const Auth: React.FC = () => {
  const [view, setView] = useState<View>("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => getStoredAccentTheme());
  const loginFormRef = React.useRef<HTMLFormElement | null>(null);
  const signupFormRef = React.useRef<HTMLFormElement | null>(null);
  const [authFormsHeight, setAuthFormsHeight] = useState(0);

  const pinError = useMemo(() => (view !== "forgot" ? getPinValidationError(password) : ""), [password, view]);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const usernameError = useMemo(() => (view === "signup" ? getUsernameValidationError(username) : ""), [username, view]);
  const signupEmailError = useMemo(() => (view === "signup" ? getEmailValidationError(signupEmail) : ""), [signupEmail, view]);

  const canSubmitSignup =
    name.trim().length > 0 &&
    !usernameError &&
    !signupEmailError &&
    !pinError &&
    password === confirmPassword;

  const resolveLoginEmail = async (identifier: string) => {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized) throw new Error("Informe seu usuario.");
    if (normalized.includes("@")) {
      if (!BASIC_EMAIL_REGEX.test(normalized)) throw new Error("Email invalido. Exemplo: nome@gmail.com");
      return normalized;
    }
    if (!USERNAME_REGEX.test(normalized)) throw new Error("Use um usuario valido ou um email valido.");
    if (usernameRpcAvailable === false) {
      throw new Error("Login por usuário não está habilitado neste projeto. Entre com e-mail.");
    }
    const { data, error } = await supabase.rpc("get_login_email_by_username", {
      p_username: normalized,
    });
    if (error) {
      if (isMissingUsernameRpc(error)) {
        usernameRpcAvailable = false;
        throw new Error("Login por usuário não está habilitado neste projeto. Entre com e-mail.");
      }
      throw error;
    }
    usernameRpcAvailable = true;
    if (!data) throw new Error("Usuario nao encontrado.");
    return data;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const email = await resolveLoginEmail(loginIdentifier);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message.includes("Invalid login")) {
          throw new Error("PIN inválido.");
        }
        throw error;
      }
      toast.success("Login realizado");
    } catch (err: any) {
      toast.error(err.message || "Ocorreu um erro");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitSignup) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: normalizeEmail(signupEmail),
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { name: name.trim(), username: normalizeUsername(username) },
        },
      });
      if (error) {
        if (error.message.includes("already registered")) {
          throw new Error("Esse email ja esta em uso. Tente fazer login.");
        }
        if (error.message.toLowerCase().includes("profiles_username_lower_uniq")) {
          throw new Error("Esse nome de usuario ja esta em uso.");
        }
        throw error;
      }
      toast.success("Conta criada com sucesso");
    } catch (err: any) {
      toast.error(err.message || "Ocorreu um erro");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) return;
    setLoading(true);
    try {
      const email = await resolveLoginEmail(forgotIdentifier);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Link enviado para redefinicao do PIN");
      setView("login");
    } catch (err: any) {
      toast.error(err.message || "Ocorreu um erro");
    } finally {
      setLoading(false);
    }
  };

  const inputClasses =
    "h-12 rounded-xl border-border/60 bg-card/80 pl-10 pr-10 transition-all duration-200 placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-inset focus:ring-primary/35";

  React.useEffect(() => {
    if (view === "forgot") return;
    const updateHeight = () => {
      const activeForm = view === "login" ? loginFormRef.current : signupFormRef.current;
      if (activeForm) setAuthFormsHeight(activeForm.offsetHeight);
    };
    updateHeight();
    const timer = window.setTimeout(updateHeight, 220);
    return () => window.clearTimeout(timer);
  }, [view, loading, usernameError, signupEmailError, passwordsMismatch, passwordsMatch]);

  return (
    <div className="flex min-h-screen items-start justify-center overflow-y-auto bg-gradient-to-br from-background via-accent/30 to-background p-4 md:items-center">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in py-4">
        <div className="mb-8 text-center">
          <AppLogo size="lg" className="mx-auto mb-4" />
          <h1 className="font-heading text-[2.15rem] font-extrabold tracking-[-0.02em] text-foreground">Meu Cartãozinho</h1>
          <p className="mt-2 text-[0.95rem] font-semibold tracking-[0.01em] text-muted-foreground/90">Suas parcelas organizadas, mês a mês</p>
        </div>

        <div className="rounded-3xl border border-border/40 bg-card/90 p-6 shadow-elevated backdrop-blur-sm sm:p-8">
          <div className="mb-4">
            <div className="w-full rounded-2xl border border-primary/15 bg-secondary/40 px-3 py-2 shadow-sm backdrop-blur-sm">
              <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Escolha seu tema
              </p>
              <div className="flex justify-center">
                <AccentThemeSwitch theme={accentTheme} onToggle={() => setAccentTheme((prev) => toggleAccentTheme(prev))} />
              </div>
            </div>
          </div>
          {view !== "forgot" && (
            <div className="relative mb-6 grid grid-cols-2 rounded-2xl bg-secondary/55 p-1">
              <span
                className={`pointer-events-none absolute bottom-1 top-1 w-[calc(50%-0.25rem)] rounded-xl gradient-primary shadow-sm transition-transform duration-300 ease-out ${
                  view === "signup" ? "translate-x-full" : "translate-x-0"
                }`}
              />
              <button
                type="button"
                onClick={() => setView("login")}
                className={`relative z-10 rounded-xl py-2.5 text-sm font-semibold transition-colors duration-300 ${
                  view === "login" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => setView("signup")}
                className={`relative z-10 rounded-xl py-2.5 text-sm font-semibold transition-colors duration-300 ${
                  view === "signup" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Criar conta
              </button>
            </div>
          )}

          {view !== "forgot" && (
            <div className="relative overflow-hidden transition-[height] duration-500 ease-out" style={{ height: authFormsHeight || "auto" }}>
              <form
                ref={loginFormRef}
                onSubmit={handleLogin}
                className={`space-y-5 transition-all duration-500 ease-out ${
                  view === "login" ? "relative translate-x-0 opacity-100" : "pointer-events-none absolute inset-x-0 top-0 -translate-x-6 opacity-0"
                }`}
              >
                <div className="space-y-2">
                  <Label htmlFor="identifier">Usuário</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                    id="identifier"
                    type="text"
                    placeholder="Usuário ou e-mail"
                    value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      required
                      className={`${inputClasses} placeholder:text-[0.92rem] sm:placeholder:text-base`}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Você pode entrar com seu @usuário ou com seu e-mail</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">PIN (6 digitos)</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••"
                      value={password}
                      onChange={(e) => setPassword(sanitizePin(e.target.value))}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      required
                      className={inputClasses}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {pinError && <p className="text-xs text-destructive">{pinError}</p>}
                </div>
                <div className="text-right">
                  <button type="button" onClick={() => setView("forgot")} className="text-xs font-medium text-primary hover:underline">
                    Esqueci meu PIN
                  </button>
                </div>
                <Button type="submit" className="h-12 w-full rounded-xl gradient-primary text-base font-semibold text-primary-foreground" disabled={loading}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Entrando...
                    </span>
                  ) : (
                    "Entrar"
                  )}
                </Button>
              </form>

              <form
                ref={signupFormRef}
                onSubmit={handleSignup}
                className={`space-y-5 transition-all duration-500 ease-out ${
                  view === "signup" ? "relative translate-x-0 opacity-100" : "pointer-events-none absolute inset-x-0 top-0 translate-x-6 opacity-0"
                }`}
              >
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input id="name" type="text" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} className={inputClasses} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Nome de usuario</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      id="username"
                      type="text"
                      placeholder="ex: marcosfilho"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      required
                      minLength={3}
                      maxLength={20}
                      className={inputClasses}
                    />
                  </div>
                  {usernameError && <p className="text-xs text-destructive">{usernameError}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                      maxLength={255}
                      className={inputClasses}
                    />
                  </div>
                  {signupEmailError ? (
                    <p className="text-xs text-destructive">{signupEmailError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Aceitamos: gmail, hotmail, outlook, live, yahoo, icloud, bol e uol.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">PIN (6 digitos)</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••"
                      value={password}
                      onChange={(e) => setPassword(sanitizePin(e.target.value))}
                      required
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      className={inputClasses}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {pinError && <p className="text-xs text-destructive">{pinError}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar PIN</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(sanitizePin(e.target.value))}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      required
                      className={`${inputClasses} ${passwordsMatch ? "border-green-400/60" : passwordsMismatch ? "border-destructive/60" : ""}`}
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground">
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordsMismatch && <p className="text-xs text-destructive">PIN inválido.</p>}
                  {passwordsMatch && <p className="text-xs text-green-600">PIN confirmado</p>}
                </div>
                <Button type="submit" className="h-12 w-full rounded-xl gradient-primary text-base font-semibold text-primary-foreground" disabled={loading || !canSubmitSignup}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Criando conta...
                    </span>
                  ) : (
                    "Criar conta"
                  )}
                </Button>
              </form>
            </div>
          )}

          {view === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div>
                <h2 className="font-heading text-xl font-bold text-foreground">Recuperar PIN</h2>
                <p className="mt-1 text-sm text-muted-foreground">Informe seu email para receber o link de redefinicao.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="forgot-identifier">Usuário ou e-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                  <Input
                    id="forgot-identifier"
                    type="text"
                    placeholder="Usuário OU e-mail"
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    required
                    className={`${inputClasses} placeholder:text-[0.92rem] sm:placeholder:text-base`}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Use o mesmo usuário ou e-mail do login.</p>
              </div>
              <Button type="submit" className="h-12 w-full rounded-xl gradient-primary text-base font-semibold text-primary-foreground" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </span>
                ) : (
                  "Enviar link de recuperacao"
                )}
              </Button>
              <button type="button" onClick={() => setView("login")} className="w-full text-center text-sm font-medium text-primary hover:underline">
                Voltar ao login
              </button>
            </form>
          )}
        </div>
        <AppFooter useContainer={false} className="w-full p-0 pb-0 pt-3" />
      </div>
    </div>
  );
};

export default Auth;
