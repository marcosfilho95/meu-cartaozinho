import React from "react";
import { useNavigate } from "react-router-dom";
import { UserAvatar } from "@/components/UserAvatar";
import { AppLogo } from "@/components/AppLogo";
import { AccentThemeSwitch } from "@/components/AccentThemeSwitch";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut, UserCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AccentTheme } from "@/lib/accentTheme";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  userName?: string;
  avatarId?: string | null;
  showBack?: boolean;
  backTo?: string;
  accentTheme?: AccentTheme;
  onToggleTheme?: () => void;
  children?: React.ReactNode;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  userName,
  avatarId,
  showBack = false,
  backTo = "/",
  accentTheme,
  onToggleTheme,
  children,
}) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Até logo!");
  };

  return (
    <header className="gradient-primary px-4 pb-8 pt-6">
      <div className="mx-auto max-w-lg">
        {/* Top row: back/logo + actions */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {showBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(backTo)}
                className="h-9 w-9 rounded-xl text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <AppLogo size="sm" />
          </div>

          <div className="flex items-center gap-1.5">
            {accentTheme && onToggleTheme && (
              <AccentThemeSwitch compact theme={accentTheme} onToggle={onToggleTheme} />
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/perfil")}
              className="h-9 w-9 rounded-xl text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10"
              aria-label="Perfil"
            >
              <UserCircle2 className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="h-9 w-9 rounded-xl text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10"
              aria-label="Sair"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Identity row: avatar + name + title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/perfil")}
            className="rounded-full transition-transform hover:scale-105 flex-shrink-0"
          >
            <UserAvatar avatarId={avatarId ?? undefined} size={48} />
          </button>
          <div className="min-w-0">
            {subtitle && (
              <p className="text-primary-foreground/70 text-xs font-medium">{subtitle}</p>
            )}
            <h1 className="font-heading text-xl font-bold text-primary-foreground truncate">
              {title}
            </h1>
          </div>
        </div>

        {children}
      </div>
    </header>
  );
};
