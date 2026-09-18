import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase, supabaseEnvIssues } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppLogo } from "@/components/AppLogo";
import { AppFooter } from "@/components/AppFooter";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles, User, Loader2 } from "lucide-react";
import { checkSupabaseConnection } from "@/integrations/supabase/diagnostics";

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

const isMissingUsernameRpc = (error: any) => {
  const text = String(error?.message || error?.details || "");
  return (
    error?.status === 404 ||
    error?.code === "404" ||
    error?.code === "PGRST202" ||
    text.includes("is_username_available") ||
    text.toLowerCase().includes("could not find the function")
  );
};

const getEmailValidationError = (value: string) => {
  const email = normalizeEmail(value);
  if (!email) return "Informe seu e-mail.";
  if (!BASIC_EMAIL_REGEX.test(email)) return "E-mail inválido. Exemplo: nome@gmail.com";
  const domain = email.split("@")[1] || "";
  if (!ALLOWED_EMAIL_DOMAINS.includes(domain)) {
    return "Use um provedor comum (gmail, hotmail, outlook, live, yahoo, icloud, bol ou uol).";
  }
  return "";
};

const getUsernameValidationError = (value: string) => {
  const username = normalizeUsername(value);
  if (!username) return "Escolha um nome de usuário.";
  if (!USERNAME_REGEX.test(username)) {
    return "Use 3–20 caracteres: letras minúsculas, números, ponto, underline ou hífen.";
  }
  return "";
};

const sanitizePin = (value: string) => value.replace(/\D/g, "").slice(0, 6);

const getPinValidationError = (value: string) => {
  if (!value) return "O PIN deve conter 6 números.";
  if (!/^\d{6}$/.test(value)) return "O PIN deve conter 6 números.";
  return "";
};

const isUsernameTaken = async (candidate: string) => {
  const normalized = normalizeUsername(candidate);
  if (!normalized || !USERNAME_REGEX.test(normalized)) return false;

  const { data, error } = await supabase.rpc("is_username_available", {
    p_username: normalized,
  });

  if (error) {
    if (isMissingUsernameRpc(error)) return false;
    throw error;
  }

  // data === true means username is free; taken when false.
  return data === false;
};

const Auth: React.FC = () => {
  const navigate = useNavigate();
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
  const loginFormRef = React.useRef<HTMLFormElement | null>(null);
  const signupFormRef = React.useRef<HTMLFormElement | null>(null);
  const [authFormsHeight, setAuthFormsHeight] = useState(0);
  const [connectionIssue, setConnectionIssue] = useState("");

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

  const validateIdentifierLocally = (identifier: string) => {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized) throw new Error("Informe seu usuário.");
    if (normalized.includes("@")) {
      if (!BASIC_EMAIL_REGEX.test(normalized)) throw new Error("E-mail inválido. Exemplo: nome@gmail.com");
      return normalized;
    }
    if (!USERNAME_REGEX.test(normalized)) throw new Error("Use um usuário válido ou um e-mail válido.");
    return normalized;
  };

  const getFriendlyAuthError = (error: any) => {
    const message = String(error?.message || "");
    const lower = message.toLowerCase();

    if (!navigator.onLine) return "Sem internet no dispositivo.";
    if (message.includes("Failed to fetch")) {
      return "Falha de conexão com o servidor. Verifique URL/chave e status do projeto.";
    }
    if (lower.includes("invalid api key") || lower.includes("apikey") || lower.includes("jwt")) {
      return "Chave do servidor inválida para este projeto.";
    }
    if (lower.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
    if (lower.includes("invalid login")) return "Credenciais inválidas.";
    return message || "Ocorreu um erro";
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      toast.error("Backend não configurado.");
      return;
    }

    setLoading(true);
    try {
      const identifier = validateIdentifierLocally(loginIdentifier);
      const { data, error } = await supabase.functions.invoke("auth-login", {
        body: { identifier, password },
      });
      if (error) {
        // Edge function returns generic 401 on bad credentials; surface a friendly message.
        throw new Error("Credenciais inválidas.");
      }
      const session = (data as any)?.session;
      if (!session?.access_token || !session?.refresh_token) {
        throw new Error("Credenciais inválidas.");
      }
      const { error: setError } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (setError) throw setError;

      toast.success("Login realizado");
      navigate("/", { replace: true });
    } catch (err: any) {
      console.error("[Auth] Login falhou", { error: err, loginIdentifier });
      toast.error(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      toast.error("Backend não configurado.");
      return;
    }
    if (!canSubmitSignup) return;

    setLoading(true);
    try {
      const normalizedUsername = normalizeUsername(username);
      if (await isUsernameTaken(normalizedUsername)) {
        throw new Error("Esse nome de usuário já está em uso.");
      }

      const { error } = await supabase.auth.signUp({
        email: normalizeEmail(signupEmail),
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { name: name.trim(), username: normalizedUsername },
        },
      });

      if (error) {
        if (error.message.includes("already registered")) {
          throw new Error("Esse e-mail já está em uso. Tente fazer login.");
        }
        if (error.message.toLowerCase().includes("profiles_username_lower_uniq")) {
          throw new Error("Esse nome de usuário já está em uso.");
        }
        throw error;
      }

      setName("");
      setUsername("");
      setSignupEmail("");
      setPassword("");
      setConfirmPassword("");
      setView("login");
      toast.success("Cadastro realizado. Confira seu e-mail para confirmar a conta antes de entrar.");
    } catch (err: any) {
      console.error("[Auth] Signup falhou", { error: err, signupEmail });
      toast.error(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      toast.error("Backend não configurado.");
      return;
    }
    if (!forgotIdentifier.trim()) return;

    setLoading(true);
    try {
      const identifier = validateIdentifierLocally(forgotIdentifier);
      const { error } = await supabase.functions.invoke("auth-reset-password", {
        body: { identifier, redirectTo: `${window.location.origin}/reset-password` },
      });
      if (error) throw error;
      // Generic message — do not disclose whether the account exists.
      toast.success("Se o usuário existir, enviaremos um link para redefinição do PIN.");
      setView("login");
    } catch (err: any) {
      console.error("[Auth] Reset de PIN falhou", { error: err, forgotIdentifier });
      toast.error(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const inputClasses =
    "h-14 rounded-2xl border-border/70 bg-[#fbfaf7] pl-11 pr-11 text-[0.95rem] shadow-[0_1px_0_rgba(14,59,43,0.02)] transition-all duration-200 placeholder:text-muted-foreground/55 hover:border-primary/25 focus:border-primary/55 focus:bg-white focus:ring-4 focus:ring-primary/10";

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

  React.useEffect(() => {
    if (!isSupabaseConfigured) {
      setConnectionIssue(supabaseEnvIssues.join(" "));
      return;
    }

    let mounted = true;
    const runConnectionCheck = async () => {
      const check = await checkSupabaseConnection();
      if (!mounted) return;
      if (!check.ok) {
        setConnectionIssue(check.message);
        console.error("[Auth] Supabase connectivity check failed", check);
      } else {
        setConnectionIssue("");
      }
    };

    runConnectionCheck();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f3eddd] px-3 py-3 sm:px-6 sm:py-6 lg:px-10 lg:py-10">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-24 top-[-8rem] h-80 w-80 rounded-full bg-[#d8bd70]/20 blur-3xl" />
        <div className="absolute -bottom-40 right-[-6rem] h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="auth-grain absolute inset-0 opacity-[0.22]" />
      </div>

      <section className="relative z-10 grid min-w-0 w-full max-w-[1120px] animate-fade-in overflow-hidden rounded-[2rem] border border-white/60 bg-white shadow-[0_30px_90px_-35px_rgba(12,54,40,0.38)] md:grid-cols-[0.92fr_1.08fr] md:rounded-[2.5rem]">
        <aside className="relative isolate min-w-0 overflow-hidden bg-[#0b3b2b] px-6 py-7 text-white sm:px-9 sm:py-9 md:flex md:min-h-[720px] md:flex-col md:justify-between md:p-12 lg:p-14">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full border border-white/10" />
            <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full border border-[#d6b968]/25" />
            <div className="absolute bottom-[-9rem] left-[-8rem] h-80 w-80 rounded-full bg-[#d6b968]/10 blur-2xl" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/10 to-transparent" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-4 md:block">
              <AppLogo size="lg" className="h-14 w-14 shrink-0 rounded-2xl bg-[#f5efdf] ring-1 ring-white/20 shadow-[0_16px_35px_-18px_rgba(0,0,0,0.55)] sm:h-16 sm:w-16 md:mb-8 md:h-20 md:w-20 md:rounded-3xl" />
              <div className="min-w-0">
                <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[#dcc882] md:mb-3">Planejamento financeiro</p>
                <h1 className="font-heading text-[1.55rem] font-bold leading-tight tracking-[-0.035em] min-[400px]:text-[1.85rem] sm:text-[2.15rem] md:max-w-sm md:text-[2.8rem] lg:text-[3.25rem]">
                  Meu Cartãozinho
                  <span className="sr-only"> — Gestão de Finanças e Cartões</span>
                </h1>
              </div>
            </div>
            <p className="mt-5 max-w-[31rem] font-heading text-[1.02rem] italic leading-relaxed text-white/80 sm:text-[1.08rem] md:mt-6 md:text-[1.22rem] md:leading-[1.75]">
              Nem todo futuro pode ser previsto. Mas todo futuro pode ser planejado.
            </p>
          </div>

          <div className="relative z-10 mt-8 hidden md:block">
            <div className="relative mb-10 h-36">
              <div className="absolute left-4 top-4 h-28 w-44 -rotate-6 rounded-[1.4rem] border border-white/10 bg-white/[0.06]" />
              <div className="absolute left-16 top-0 h-32 w-52 rotate-3 rounded-[1.5rem] border border-[#e1cc86]/30 bg-gradient-to-br from-white/[0.16] to-white/[0.04] p-5 shadow-2xl backdrop-blur-md">
                <div className="flex items-start justify-between">
                  <Sparkles className="h-5 w-5 text-[#e1cc86]" />
                  <span className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-white/55">Seu futuro</span>
                </div>
                <div className="mt-8 h-1.5 w-24 rounded-full bg-white/25" />
                <div className="mt-2 h-1.5 w-14 rounded-full bg-[#e1cc86]/65" />
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-white/10 pt-6 text-sm text-white/65">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[#e1cc86]">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <p><strong className="block font-semibold text-white/90">Simples, seguro e organizado</strong>Suas finanças em boas mãos.</p>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col bg-[#fffefa] px-5 py-7 sm:px-9 sm:py-9 md:min-h-[720px] md:justify-center md:px-12 md:py-12 lg:px-16">
          <div className="mx-auto min-w-0 w-full max-w-[440px]">
            <div className="mb-7">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-primary/60">
                {view === "forgot" ? "Recupere seu acesso" : view === "signup" ? "Comece agora" : "Bem-vindo de volta"}
              </p>
              <h2 className="mt-2 font-heading text-2xl font-bold tracking-[-0.025em] text-foreground sm:text-[1.75rem]">
                {view === "forgot" ? "Redefina seu PIN" : view === "signup" ? "Crie sua conta" : "Acesse sua conta"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {view === "forgot" ? "Vamos enviar as instruções de recuperação para você." : view === "signup" ? "Organize hoje as escolhas que constroem o seu amanhã." : "Entre para continuar cuidando do que importa para você."}
              </p>
            </div>

          {!!connectionIssue && (
            <div className="mb-5 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive">
              <p className="font-semibold">Falha de configuração/conexão do servidor</p>
              <p className="mt-1">{connectionIssue}</p>
            </div>
          )}

          {view !== "forgot" && (
            <div className="relative mb-7 grid grid-cols-2 rounded-2xl border border-border/45 bg-[#f4f0e6] p-1.5">
              <span
                className={`pointer-events-none absolute bottom-1.5 top-1.5 w-[calc(50%-0.375rem)] rounded-xl bg-primary shadow-[0_8px_20px_-10px_rgba(6,78,53,0.75)] transition-transform duration-300 ease-out ${
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
                  view === "login"
                    ? "relative translate-x-0 opacity-100"
                    : "pointer-events-none absolute inset-x-0 top-0 -translate-x-6 opacity-0"
                }`}
              >
                <div className="space-y-2">
                  <Label htmlFor="identifier">Usuário</Label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-primary/45" />
                    <Input
                      id="identifier"
                      type="text"
                      placeholder="Usuário ou e-mail"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      autoComplete="username"
                      required
                      className={`${inputClasses} placeholder:text-[0.92rem] sm:placeholder:text-base`}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">PIN (6 dígitos)</Label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-primary/45" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="******"
                      value={password}
                      onChange={(e) => setPassword(sanitizePin(e.target.value))}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoComplete="current-password"
                      required
                      className={inputClasses}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground/70 transition hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      aria-label={showPassword ? "Ocultar PIN" : "Mostrar PIN"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {password.length > 0 && pinError && <p className="text-xs text-destructive">{pinError}</p>}
                </div>
                <div className="text-right">
                  <button type="button" onClick={() => setView("forgot")} className="text-xs font-semibold text-primary underline-offset-4 transition hover:text-primary/75 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25">
                    Esqueci meu PIN
                  </button>
                </div>
                <Button type="submit" className="group h-14 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-[0_12px_28px_-14px_rgba(6,78,53,0.9)] transition-all hover:-translate-y-0.5 hover:bg-primary/95 hover:shadow-[0_16px_32px_-14px_rgba(6,78,53,0.95)]" disabled={loading}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Entrando...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">Entrar <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                  )}
                </Button>
              </form>

              <form
                ref={signupFormRef}
                onSubmit={handleSignup}
                className={`space-y-5 transition-all duration-500 ease-out ${
                  view === "signup"
                    ? "relative translate-x-0 opacity-100"
                    : "pointer-events-none absolute inset-x-0 top-0 translate-x-6 opacity-0"
                }`}
              >
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-primary/45" />
                    <Input id="name" type="text" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={100} className={inputClasses} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Nome de usuário</Label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-primary/45" />
                    <Input
                      id="username"
                      type="text"
                      placeholder="ex: marcosfilho"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      autoComplete="username"
                      required
                      minLength={3}
                      maxLength={20}
                      className={inputClasses}
                    />
                  </div>
                  {username.length > 0 && usernameError && <p className="text-xs text-destructive">{usernameError}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-primary/45" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      autoComplete="email"
                      required
                      maxLength={255}
                      className={inputClasses}
                    />
                  </div>
                  {signupEmail.length > 0 && signupEmailError && <p className="text-xs text-destructive">{signupEmailError}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">PIN (6 dígitos)</Label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-primary/45" />
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="******"
                      value={password}
                      onChange={(e) => setPassword(sanitizePin(e.target.value))}
                      required
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoComplete="new-password"
                      className={inputClasses}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground/70 transition hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      aria-label={showPassword ? "Ocultar PIN" : "Mostrar PIN"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {password.length > 0 && pinError && <p className="text-xs text-destructive">{pinError}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar PIN</Label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-primary/45" />
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="******"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(sanitizePin(e.target.value))}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoComplete="new-password"
                      required
                      className={`${inputClasses} ${passwordsMatch ? "border-green-400/60" : passwordsMismatch ? "border-destructive/60" : ""}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground/70 transition hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      aria-label={showConfirmPassword ? "Ocultar confirmação do PIN" : "Mostrar confirmação do PIN"}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordsMismatch && <p className="text-xs text-destructive">PINs não coincidem.</p>}
                  {passwordsMatch && <p className="text-xs text-green-600">PIN confirmado</p>}
                </div>

                <Button
                  type="submit"
                  className="group h-14 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-[0_12px_28px_-14px_rgba(6,78,53,0.9)] transition-all hover:-translate-y-0.5 hover:bg-primary/95"
                  disabled={loading || !canSubmitSignup}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Criando conta...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">Criar conta <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                  )}
                </Button>
              </form>
            </div>
          )}

          {view === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="forgot-identifier">Usuário ou e-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-primary/45" />
                  <Input
                    id="forgot-identifier"
                    type="text"
                    placeholder="Usuário ou e-mail"
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    required
                    className={`${inputClasses} placeholder:text-[0.92rem] sm:placeholder:text-base`}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Use o mesmo usuário ou e-mail do login.</p>
              </div>
              <Button type="submit" className="h-14 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-[0_12px_28px_-14px_rgba(6,78,53,0.9)]" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </span>
                ) : (
                  "Enviar link de recuperação"
                )}
              </Button>
              <button type="button" onClick={() => setView("login")} className="w-full text-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
                Voltar ao login
              </button>
            </form>
          )}
            <AppFooter useContainer={false} plain className="mt-8 w-full border-t border-border/60 p-0 pt-5 [&>div]:p-0" />
          </div>
        </div>
      </section>
    </main>
  );
};

export default Auth;
