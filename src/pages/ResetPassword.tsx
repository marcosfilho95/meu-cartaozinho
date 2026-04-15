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

const getPasswordError = (value: string) => {
  if (!value) return "";
  if (value.length < 8) return "A senha deve ter no mínimo 8 caracteres.";
  if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) return "A senha deve conter letras e números.";
  return "";
};

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const passwordError = getPasswordError(password);
  const passwordValid = password.length >= 8 && !passwordError;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const canSubmit = passwordValid && password === confirmPassword;

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
      toast.success("Senha atualizada com sucesso.");
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
          <h2 className="font-heading text-xl font-bold text-foreground">Senha atualizada!</h2>
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
          <h1 className="font-heading text-2xl font-bold text-foreground">Nova senha</h1>
          <p className="mt-2 text-sm text-muted-foreground">Escolha uma nova senha para sua conta (mínimo 8 caracteres, letras e números)</p>
        </div>

        <div className="rounded-3xl border border-border/40 bg-card/90 p-6 shadow-elevated backdrop-blur-sm sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-medium">
                Nova senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  maxLength={128}
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
              {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-new-password" className="text-sm font-medium">
                Confirmar senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  id="confirm-new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  maxLength={128}
                  className={inputClasses}
                />
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && <p className="text-xs text-destructive">As senhas não coincidem.</p>}
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
                "Salvar nova senha"
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

