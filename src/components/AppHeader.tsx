import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, LogOut, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/UserAvatar";
import { AppLogo } from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePrivacyMode } from "@/hooks/use-privacy-mode";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  greeting?: string;
  userName?: string;
  avatarId?: string | null;
  avatarUrl?: string | null;
  avatarPending?: boolean;
  showBack?: boolean;
  backTo?: string;
  preferHistoryBack?: boolean;
  /** @deprecated theme toggle removed */
  accentTheme?: unknown;
  /** @deprecated theme toggle removed */
  onToggleTheme?: () => void;
  topActions?: React.ReactNode;
  containerClassName?: string;
  headerClassName?: string;
  headerStyle?: React.CSSProperties;
  children?: React.ReactNode;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  greeting,
  userName,
  avatarId,
  avatarUrl,
  avatarPending = false,
  showBack = false,
  backTo = "/",
  preferHistoryBack = false,
  topActions,
  containerClassName,
  headerClassName,
  headerStyle,
  children,
}) => {
  const navigate = useNavigate();
  const { isPrivate, togglePrivacy } = usePrivacyMode();
  const resolvedUserName = (userName || "").trim() || "Usuário";
  const greetingLine = greeting ? `${greeting}, ${resolvedUserName}` : subtitle;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Até logo!");
  };

  const handleBack = () => {
    if (preferHistoryBack) {
      const idx = typeof window !== "undefined" ? window.history.state?.idx : 0;
      if (typeof idx === "number" && idx > 0) {
        navigate(-1);
        return;
      }
    }
    navigate(backTo);
  };

  return (
    <header className={cn("relative isolate overflow-hidden gradient-primary px-4 pb-8 pt-4 sm:pb-9", headerClassName)} style={headerStyle}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-white/[0.045]" aria-hidden />
      <div className="pointer-events-none absolute -right-28 -top-36 h-80 w-80 rounded-full bg-emerald-200/10 blur-3xl" aria-hidden />
      <div className="relative mx-auto max-w-2xl" style={{ zIndex: 1 }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
            {showBack && (
              <Button
                variant="ghost"
                onClick={handleBack}
                className="h-11 shrink-0 gap-2 rounded-2xl border border-white/15 bg-white/[0.08] px-3 text-primary-foreground shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/[0.16] hover:text-primary-foreground"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-5 w-5" strokeWidth={2.2} />
                <span className="hidden text-xs font-semibold sm:inline">Voltar</span>
              </Button>
            )}
            <AppLogo size="md" className="h-12 w-12 shrink-0 rounded-2xl ring-2 ring-white/30 shadow-lg" />
            <div className="h-9 w-px shrink-0 bg-white/20" aria-hidden />
            <button
              type="button"
              onClick={() => navigate("/perfil")}
              className="group shrink-0 rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
              aria-label="Abrir perfil"
            >
              <UserAvatar
                avatarId={avatarId ?? undefined}
                avatarUrl={avatarUrl ?? undefined}
                name={resolvedUserName}
                size={52}
                pending={avatarPending}
                className="border-2 border-white/75 shadow-lg"
              />
            </button>
            <div className="min-w-0 flex-1">
              {greetingLine && (
                <p className="text-[11px] font-semibold tracking-[0.04em] text-primary-foreground/70">{greetingLine}</p>
              )}
              <h1 className="break-words font-heading text-[1.45rem] font-bold leading-tight tracking-[-0.02em] text-primary-foreground sm:text-[1.65rem]">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 self-end sm:gap-2 lg:self-auto">
            {topActions}
            <Button
              variant="ghost"
              onClick={togglePrivacy}
              className="h-11 gap-2 rounded-2xl border border-white/15 bg-white/[0.08] px-3 text-primary-foreground/85 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/[0.16] hover:text-primary-foreground"
              aria-label={isPrivate ? "Mostrar valores" : "Ocultar valores"}
              title={isPrivate ? "Mostrar valores" : "Ocultar valores"}
              aria-pressed={isPrivate}
            >
              {isPrivate ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              <span className="hidden text-xs font-semibold xl:inline">Privacidade</span>
            </Button>
            <Button
              variant="ghost"
              data-tour="profile-button"
              onClick={() => navigate("/perfil")}
              className="h-11 gap-2 rounded-2xl border border-white/15 bg-white/[0.08] px-3 text-primary-foreground/85 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/[0.16] hover:text-primary-foreground"
              aria-label="Perfil"
            >
              <UserCircle2 className="h-5 w-5" />
              <span className="hidden text-xs font-semibold lg:inline">Perfil</span>
            </Button>
            <Button
              variant="ghost"
              data-tour="logout-button"
              onClick={handleLogout}
              className="h-11 gap-2 rounded-2xl border border-white/15 bg-white/[0.08] px-3 text-primary-foreground/85 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/[0.16] hover:text-primary-foreground"
              aria-label="Sair"
            >
              <LogOut className="h-5 w-5" />
              <span className="hidden text-xs font-semibold lg:inline">Sair</span>
            </Button>
          </div>
        </div>

        {children}
      </div>
    </header>
  );
};
