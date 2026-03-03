import React, { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { AccentThemeSwitch } from "@/components/AccentThemeSwitch";
import { toast } from "sonner";
import { CreditCard, Mail, Lock, Eye, EyeOff, User, Loader2 } from "lucide-react";
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

const getEmailValidationError = (value: string) => {
  const email = normalizeEmail(value);
  if (!email) return "Informe seu email.";
  const basicRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basicRegex.test(email)) return "Email invalido. Exemplo: nome@gmail.com";
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

const getPasswordStrength = (password: string): { score: number; label: string } => {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= 6) score += 25;
  if (password.length >= 8) score += 15;
  if (/[A-Z]/.test(password)) score += 20;
  if (/[0-9]/.test(password)) score += 20;
  if (/[^A-Za-z0-9]/.test(password)) score += 20;
  if (score <= 25) return { score, label: "Fraca" };
  if (score <= 50) return { score, label: "Razoavel" };
  if (score <= 75) return { score, label: "Boa" };
  return { score, label: "Forte" };
};

const Auth: React.FC = () => {
  const [view, setView] = useState<View>("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => getStoredAccentTheme());

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const usernameError = useMemo(() => (view === "signup" ? getUsernameValidationError(username) : ""), [username, view]);
  const signupEmailError = useMemo(() => (view === "signup" ? getEmailValidationError(signupEmail) : ""), [signupEmail, view]);

  const canSubmitSignup =
    name.trim().length > 0 &&
    !usernameError &&
    !signupEmailError &&
    password.length >= 6 &&
    password === confirmPassword;

  const resolveLoginEmail = async (identifier: string) => {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized) throw new Error("Informe seu usuario.");
    if (normalized.includes("@")) throw new Error("Use apenas seu usuario.");
    if (!USERNAME_REGEX.test(normalized)) throw new Error("Use apenas seu usuario.");
    const { data, error } = await supabase.rpc("get_login_email_by_username", {
      p_username: normalized,
    });
    if (error) throw error;
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
          throw new Error("Usuario ou senha incorretos. Tente novamente.");
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
    if (!forgotEmail.trim()) return;
    const emailError = getEmailValidationError(forgotEmail);
    if (emailError) {
      toast.error(emailError);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(forgotEmail), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Link enviado para redefinicao de senha");
      setView("login");
    } catch (err: any) {
      toast.error(err.message || "Ocorreu um erro");
    } finally {
      setLoading(false);
    }
  };

  const inputClasses =
    "h-12 rounded-xl border-border/60 bg-card/80 pl-10 pr-10 transition-all duration-200 placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/30";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-accent/30 to-background p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="mb-4 flex justify-end">
          <div className="rounded-2xl border border-primary/20 bg-card/95 p-2 shadow-elevated backdrop-blur-sm">
            <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Escolha seu tema
            </p>
            <AccentThemeSwitch theme={accentTheme} onToggle={() => setAccentTheme((prev) => toggleAccentTheme(prev))} />
          </div>
        </div>
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl gradient-primary shadow-elevated">
            <CreditCard className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-[2.15rem] font-extrabold tracking-[-0.02em] text-foreground">Meu Cartãozinho</h1>
          <p className="mt-2 text-[0.95rem] font-semibold tracking-[0.01em] text-muted-foreground/90">Suas parcelas organizadas, mês a mês</p>
        </div>

        <div className="rounded-3xl border border-border/40 bg-card/90 p-6 shadow-elevated backdrop-blur-sm sm:p-8">
          {view !== "forgot" && (
            <div className="mb-6 flex gap-1 rounded-2xl bg-secondary/50 p-1">
              <button
                type="button"
                onClick={() => setView("login")}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                  view === "login" ? "gradient-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => setView("signup")}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                  view === "signup" ? "gradient-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Criar conta
              </button>
            </div>
          )}

          {view === "login" && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="identifier">Usuario</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                  <Input
                    id="identifier"
                    type="text"
                    placeholder="Usuário"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    required
                    className={inputClasses}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="........"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={inputClasses}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="text-right">
                <button type="button" onClick={() => setView("forgot")} className="text-xs font-medium text-primary hover:underline">
                  Esqueci minha senha
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
          )}

          {view === "signup" && (
            <form onSubmit={handleSignup} className="space-y-5">
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
                <Label htmlFor="signup-password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    maxLength={72}
                    className={inputClasses}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Forca da senha</span>
                      <span className="font-medium text-foreground">{strength.label}</span>
                    </div>
                    <Progress value={strength.score} className="h-2 rounded-full" />
                    {password.length < 6 && <p className="text-xs text-destructive">Minimo de 6 caracteres</p>}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Repita a senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className={`${inputClasses} ${passwordsMatch ? "border-green-400/60" : passwordsMismatch ? "border-destructive/60" : ""}`}
                  />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground">
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordsMismatch && <p className="text-xs text-destructive">As senhas nao coincidem</p>}
                {passwordsMatch && <p className="text-xs text-green-600">Senhas coincidem</p>}
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
          )}

          {view === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div>
                <h2 className="font-heading text-xl font-bold text-foreground">Recuperar senha</h2>
                <p className="mt-1 text-sm text-muted-foreground">Informe seu email para receber o link de redefinicao.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    className={inputClasses}
                  />
                </div>
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
      </div>
    </div>
  );
};

export default Auth;
