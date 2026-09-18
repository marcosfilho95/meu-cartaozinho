import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f3eddd] p-4">
      <div className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative w-full max-w-md rounded-[2rem] border border-white/70 bg-card p-8 text-center shadow-elevated sm:p-10">
        <AppLogo size="lg" className="mx-auto mb-7 h-16 w-16 rounded-2xl" />
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-primary/55">Erro 404</p>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-[-0.035em]">Este caminho não existe.</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">Talvez a página tenha mudado de lugar. Sua organização continua segura.</p>
        <Button asChild className="mt-7 w-full">
          <Link to="/"><ArrowLeft className="h-4 w-4" /> Voltar ao início</Link>
        </Button>
      </div>
    </main>
  );
};

export default NotFound;
