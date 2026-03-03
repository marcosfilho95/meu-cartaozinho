import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

type TourStep = {
  id: string;
  route: string;
  title: string;
  description: string;
  selector?: string;
};

const TOUR_KEY_PREFIX = "first-login-tour:v3";

const STEPS: TourStep[] = [
  {
    id: "welcome",
    route: "/",
    title: "Bem-vindo ao Meu Cartaozinho",
    description: "Este guia rapido mostra as principais funcoes. Leva menos de 1 minuto.",
  },
  {
    id: "theme",
    route: "/",
    selector: '[data-tour="theme-switch"]',
    title: "Troca de tema",
    description: "Use este botao para alternar entre os temas da interface.",
  },
  {
    id: "new-card",
    route: "/",
    selector: '[data-tour="new-card-button"]',
    title: "Criar cartao",
    description: "Comece por aqui: cadastre o primeiro cartao para organizar suas parcelas.",
  },
  {
    id: "profile-nav",
    route: "/",
    selector: '[data-tour="profile-button"]',
    title: "Botao Perfil",
    description: "Agora vamos abrir a tela de perfil para personalizar seu nome/avatar.",
  },
  {
    id: "profile-screen",
    route: "/perfil",
    selector: '[data-tour="profile-title"]',
    title: "Tela de perfil",
    description: "Aqui voce ajusta seus dados e salva com o botao ao final da pagina.",
  },
  {
    id: "purchases-nav",
    route: "/",
    selector: '[data-tour="purchases-button"]',
    title: "Botao Minhas Compras",
    description: "Por este atalho voce acompanha e remove compras ja cadastradas.",
  },
  {
    id: "purchases-screen",
    route: "/compras",
    selector: '[data-tour="purchases-title"]',
    title: "Tela Minhas Compras",
    description: "Esta pagina lista compras e parcelas para consulta rapida.",
  },
  {
    id: "dashboard-summary",
    route: "/",
    selector: '[data-tour="month-summary"]',
    title: "Resumo do mes",
    description: "Aqui voce ve total, parcelas ativas e distribuicao em grafico.",
  },
  {
    id: "logout",
    route: "/",
    selector: '[data-tour="logout-button"]',
    title: "Sair da conta",
    description: "Use este botao quando quiser encerrar a sessao com seguranca.",
  },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

interface FirstLoginTourProps {
  userId: string | null | undefined;
}

export const FirstLoginTour: React.FC<FirstLoginTourProps> = ({ userId }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const step = STEPS[stepIndex];
  const storageKey = useMemo(() => (userId ? `${TOUR_KEY_PREFIX}:${userId}` : null), [userId]);
  const isLastStep = stepIndex >= STEPS.length - 1;

  useEffect(() => {
    if (!storageKey) return;
    const alreadySeen = localStorage.getItem(storageKey) === "1";
    setActive(!alreadySeen);
    setStepIndex(0);
  }, [storageKey]);

  useEffect(() => {
    if (!active || !step) return;
    if (location.pathname !== step.route) navigate(step.route);
  }, [active, step, location.pathname, navigate]);

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (!active || !step?.selector) {
      setTargetRect(null);
      return;
    }

    const updateTarget = () => {
      const target = document.querySelector(step.selector as string) as HTMLElement | null;
      if (!target) {
        setTargetRect(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        setTargetRect(null);
        return;
      }
      setTargetRect(rect);
    };

    updateTarget();
    const interval = window.setInterval(updateTarget, 180);
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [active, step?.selector, location.pathname]);

  const finishTour = () => {
    if (storageKey) localStorage.setItem(storageKey, "1");
    setActive(false);
    setStepIndex(0);
    setTargetRect(null);
  };

  const nextStep = () => {
    if (isLastStep) {
      finishTour();
      return;
    }
    setStepIndex((prev) => prev + 1);
  };

  const prevStep = () => setStepIndex((prev) => Math.max(0, prev - 1));

  if (!active || !step) return null;

  const vw = viewport.width || window.innerWidth;
  const vh = viewport.height || window.innerHeight;
  const isMobile = vw < 640;
  const cardWidth = Math.min(isMobile ? vw - 16 : 380, vw - 16);
  const estimatedCardHeight = isMobile ? 250 : 230;
  const padding = 8;

  let cardLeft = (vw - cardWidth) / 2;
  let cardTop = Math.max(padding, vh - estimatedCardHeight - padding);

  if (targetRect) {
    const desiredLeft = targetRect.left + targetRect.width / 2 - cardWidth / 2;
    cardLeft = clamp(desiredLeft, padding, Math.max(padding, vw - cardWidth - padding));

    const belowTop = targetRect.bottom + 12;
    const aboveTop = targetRect.top - estimatedCardHeight - 12;
    const canFitBelow = belowTop + estimatedCardHeight <= vh - padding;
    cardTop = canFitBelow ? belowTop : Math.max(padding, aboveTop);
    cardTop = clamp(cardTop, padding, Math.max(padding, vh - estimatedCardHeight - padding));
  }

  return (
    <>
      <div className="fixed inset-0 z-[120] bg-slate-950/60" />

      {targetRect && (
        <div
          className="pointer-events-none fixed z-[121] rounded-xl border-2 border-white/90"
          style={{
            top: `${Math.max(4, targetRect.top - 6)}px`,
            left: `${Math.max(4, targetRect.left - 6)}px`,
            width: `${targetRect.width + 12}px`,
            height: `${targetRect.height + 12}px`,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
          }}
        />
      )}

      <button
        type="button"
        onClick={finishTour}
        className="fixed right-3 top-3 z-[123] rounded-lg border border-white/30 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"
      >
        Pular tutorial
      </button>

      <div
        className="fixed z-[122] rounded-2xl border border-border bg-card p-4 shadow-2xl"
        style={{
          top: `${cardTop}px`,
          left: `${cardLeft}px`,
          width: `${cardWidth}px`,
          maxHeight: isMobile ? "72vh" : "76vh",
          overflowY: "auto",
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tutorial {stepIndex + 1}/{STEPS.length}
          </p>
          <button type="button" onClick={finishTour} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
            Pular
          </button>
        </div>
        <h3 className="font-heading text-lg font-bold text-foreground">{step.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>

        <div className="mt-3 flex items-center gap-1.5">
          {STEPS.map((item, idx) => (
            <span
              key={item.id}
              className={`h-1.5 rounded-full transition-all ${idx === stepIndex ? "w-5 bg-primary" : "w-2 bg-border"}`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button variant="outline" onClick={prevStep} disabled={stepIndex === 0}>
            Voltar
          </Button>
          <Button className="gradient-primary text-primary-foreground" onClick={nextStep}>
            {isLastStep ? "Concluir" : "Proximo"}
          </Button>
        </div>
      </div>
    </>
  );
};
