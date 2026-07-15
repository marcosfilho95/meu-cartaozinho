import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/UserAvatar";
import { AppLogo } from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  greeting?: string;
  userName?: string;
  avatarId?: string | null;
  avatarUrl?: string | null;
  showBack?: boolean;
  backTo?: string;
  preferHistoryBack?: boolean;
  /** @deprecated theme toggle removed */
  accentTheme?: unknown;
  /** @deprecated theme toggle removed */
  onToggleTheme?: () => void;
  topActions?: React.ReactNode;
  containerClassName?: string;
  children?: React.ReactNode;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  greeting,
  userName,
  avatarId,
  avatarUrl,
  showBack = false,
  backTo = "/",
  preferHistoryBack = false,
  topActions,
  containerClassName,
  children,
}) => {
  const navigate = useNavigate();
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
    <header className="gradient-primary px-4 pb-7 pt-5">
      <div className={cn("mx-auto max-w-2xl", containerClassName)}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {showBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBack}
                className="h-9 w-9 rounded-xl text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <AppLogo size="sm" />
          </div>

          <div className="flex items-center gap-1.5">
            {topActions}
            <Button
              variant="ghost"
              size="icon"
              data-tour="profile-button"
              onClick={() => navigate("/perfil")}
              className="h-9 w-9 rounded-xl text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground"
              aria-label="Perfil"
            >
              <UserCircle2 className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              data-tour="logout-button"
              onClick={handleLogout}
              className="h-9 w-9 rounded-xl text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground"
              aria-label="Sair"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/perfil")}
            className="flex-shrink-0 rounded-full transition-transform hover:scale-105"
          >
            <UserAvatar avatarId={avatarId ?? undefined} avatarUrl={avatarUrl ?? undefined} name={resolvedUserName} size={50} />
          </button>
          <div className="min-w-0">
            {greetingLine && (
              <p className="text-xs font-semibold tracking-[0.01em] text-primary-foreground/75">{greetingLine}</p>
            )}
            <h1 className="truncate font-heading text-[1.35rem] font-extrabold tracking-[-0.01em] text-primary-foreground">
              {title}
            </h1>
          </div>
        </div>

        {children}
      </div>
    </header>
  );
};
