import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Eye, EyeOff, Loader2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppLogo } from "@/components/AppLogo";
import { AppFooter } from "@/components/AppFooter";
import { toast } from "sonner";

const sanitizePin = (value: string) => value.replace(/\D/g, "").slice(0, 6);

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const pinValid = /^\d{6}$/.test(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const canSubmit = pinValid && password === confirmPassword;

  const inputClasses =
    "h-14 rounded-2xl border-border/70 bg-[#fbfaf7] pl-11 pr-11 transition-all placeholder:text-muted-foreground/55 hover:border-primary/25 focus:border-primary/55 focus:bg-white focus:ring-4 focus:ring-primary/10";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      setSuccess(true);
      toast.success("PIN atualizado com sucesso.");
      window.setTimeout(() => navigate("/"), 2000);
    } catch (err: any) {
      toast.error(err.message || "Ocorreu um erro");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3eddd] p-4">
        <div className="w-full max-w-sm animate-fade-in rounded-[2rem] border border-white/70 bg-card p-9 text-center shadow-elevated">
          <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/8 text-primary"><CheckCircle className="h-8 w-8" /></span>
          <h2 className="font-heading text-2xl font-bold text-foreground">PIN atualizado</h2>
          <p className="mt-2 text-sm text-muted-foreground">Tudo certo. Estamos levando você ao login.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f3eddd] p-3 sm:p-6">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#d8bd70]/20 blur-3xl" />
      <section className="relative grid w-full max-w-[920px] animate-fade-in overflow-hidden rounded-[2rem] border border-white/70 bg-card shadow-[0_30px_90px_-35px_rgba(12,54,40,0.38)] md:grid-cols-[0.72fr_1.28fr]">
        <aside className="relative overflow-hidden bg-[#0b3b2b] p-7 text-white sm:p-9 md:flex md:flex-col md:justify-between md:p-10">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full border border-[#d6b968]/25" />
          <div className="relative">
            <AppLogo size="lg" className="mb-6 h-16 w-16 rounded-2xl bg-[#f5efdf] ring-1 ring-white/20" />
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[#dcc882]">Acesso seguro</p>
            <h1 className="mt-3 font-heading text-3xl font-bold tracking-[-0.035em]">Meu Cartãozinho</h1>
          </div>
          <p className="relative mt-8 hidden font-heading text-sm italic leading-relaxed text-white/65 md:block">Planejar também é proteger o seu acesso.</p>
        </aside>

        <div className="p-6 sm:p-10 md:p-12">
          <div className="mb-7">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-primary/60">Recuperação de acesso</p>
            <h2 className="mt-2 font-heading text-2xl font-bold tracking-[-0.025em] text-foreground">Crie um novo PIN</h2>
            <p className="mt-2 text-sm text-muted-foreground">Escolha seis números fáceis de lembrar e difíceis de adivinhar.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-medium">
                Novo PIN
              </Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/45" />
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••"
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
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition hover:bg-primary/5 hover:text-primary"
                  aria-label={showPassword ? "Ocultar PIN" : "Mostrar PIN"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {!pinValid && password.length > 0 && <p className="text-xs text-destructive">O PIN deve conter 6 números.</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-new-password" className="text-sm font-medium">
                Confirmar PIN
              </Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/45" />
                <Input
                  id="confirm-new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(sanitizePin(e.target.value))}
                  required
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="new-password"
                  className={inputClasses}
                />
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && <p className="text-xs text-destructive">PIN inválido.</p>}
            </div>

            <Button
              type="submit"
              className="h-14 w-full rounded-2xl text-base"
              disabled={loading || !canSubmit}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </span>
              ) : (
                "Salvar novo PIN"
              )}
            </Button>
          </form>
          <AppFooter useContainer={false} plain className="mt-7 border-t border-border/60 p-0 pt-5 [&>div]:p-0" />
        </div>
      </section>
    </main>
  );
};

export default ResetPassword;

