import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, Eye, EyeOff, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/UserAvatar";
import { AppLogo } from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePrivacyMode } from "@/hooks/use-privacy-mode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
    <header className={cn("relative isolate overflow-hidden border-b border-[#cdb66e]/20 bg-[#0b3b2b] px-4 pb-7 pt-4 sm:pb-8", headerClassName)} style={headerStyle}>
      <div className="pointer-events-none absolute inset-0 auth-header-grid opacity-30" aria-hidden />
      <div className="pointer-events-none absolute -right-24 -top-44 h-80 w-80 rounded-full border border-white/10" aria-hidden />
      <div className="pointer-events-none absolute -right-8 -top-28 h-56 w-56 rounded-full border border-[#d6bd73]/20" aria-hidden />
      <div className={cn("relative mx-auto w-full max-w-6xl", containerClassName)} style={{ zIndex: 1 }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
            {showBack && (
              <Button
                variant="ghost"
                onClick={handleBack}
                className="h-10 shrink-0 gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-white/80 shadow-none hover:-translate-y-0.5 hover:bg-white/[0.12] hover:text-white"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
                <span className="hidden text-xs font-semibold sm:inline">Voltar</span>
              </Button>
            )}
            <AppLogo size="md" className="h-11 w-11 shrink-0 rounded-xl bg-[#f5efdf] ring-1 ring-white/20 shadow-[0_10px_24px_-16px_rgba(0,0,0,0.75)] sm:h-12 sm:w-12 sm:rounded-2xl" />
            <div className="min-w-0 flex-1">
              {greetingLine && (
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-[#d9c47f]/80">{greetingLine}</p>
              )}
              <h1 className="truncate font-heading text-[1.25rem] font-bold leading-tight tracking-[-0.025em] text-white sm:text-[1.55rem]">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {topActions}
            <Button
              variant="ghost"
              onClick={togglePrivacy}
              size="icon"
              className="h-10 w-10 rounded-xl border border-white/10 bg-white/[0.06] p-0 text-white/75 shadow-none hover:-translate-y-0.5 hover:bg-white/[0.12] hover:text-white"
              aria-label={isPrivate ? "Mostrar valores" : "Ocultar valores"}
              title={isPrivate ? "Mostrar valores" : "Ocultar valores"}
              aria-pressed={isPrivate}
            >
              {isPrivate ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-tour="profile-button"
                  className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] pl-1 pr-2 text-white/85 transition-all hover:-translate-y-0.5 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/15 sm:pr-3"
                  aria-label="Abrir menu da conta"
                >
                  <UserAvatar
                    avatarId={avatarId ?? undefined}
                    avatarUrl={avatarUrl ?? undefined}
                    name={resolvedUserName}
                    size={32}
                    pending={avatarPending}
                    className="border border-white/40"
                  />
                  <span className="hidden max-w-28 truncate text-xs font-semibold sm:block">{resolvedUserName}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-white/55" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl border-border/70 p-1.5 shadow-elevated">
                <DropdownMenuLabel className="px-2.5 py-2">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sua conta</span>
                  <span className="mt-0.5 block truncate text-sm text-foreground">{resolvedUserName}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/perfil")} className="cursor-pointer rounded-xl py-2.5">
                  <UserRound className="mr-2 h-4 w-4" /> Perfil
                </DropdownMenuItem>
                <DropdownMenuItem data-tour="logout-button" onClick={handleLogout} className="cursor-pointer rounded-xl py-2.5 text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {children}
      </div>
    </header>
  );
};
