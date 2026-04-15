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
    "pl-10 pr-10 h-12 rounded-xl border-border/60 bg-card/80 transition-all duration-200 focus:ring-2 focus:ring-primary/30 focus:border-primary focus:shadow-md placeholder:text-muted-foreground/60";

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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-accent/30 to-background p-4">
        <div className="text-center animate-fade-in">
          <CheckCircle className="mx-auto mb-4 h-16 w-16 text-primary" />
          <h2 className="font-heading text-xl font-bold text-foreground">PIN atualizado!</h2>
          <p className="mt-2 text-sm text-muted-foreground">Redirecionando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-accent/30 to-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <AppLogo size="lg" className="mx-auto mb-4" />
          <h1 className="font-heading text-2xl font-bold text-foreground">Novo PIN</h1>
          <p className="mt-2 text-sm text-muted-foreground">Escolha um novo PIN de 6 números para sua conta</p>
        </div>

        <div className="rounded-3xl border border-border/40 bg-card/90 p-6 shadow-elevated backdrop-blur-sm sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-medium">
                Novo PIN
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
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
                  className={inputClasses}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 transition-colors hover:text-foreground"
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
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
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
                  className={inputClasses}
                />
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && <p className="text-xs text-destructive">PIN inválido.</p>}
            </div>

            <Button
              type="submit"
              className="h-12 w-full rounded-xl gradient-primary text-base font-semibold text-primary-foreground shadow-md"
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
        </div>
        <AppFooter />
      </div>
    </div>
  );
};

export default ResetPassword;

