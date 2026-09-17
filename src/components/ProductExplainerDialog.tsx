import React from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type ProductExplainerDialogProps = {
  product: "cartaozinho" | "organizador";
};

const CONTENT = {
  cartaozinho: {
    eyebrow: "Controle compartilhado",
    title: "Entenda o Meu Cartãozinho",
    description: "Quando um cartão é compartilhado, cada compra precisa ter dono.",
    body: "Cadastre as pessoas que usam seu cartão, registre compras e parcelas e acompanhe quanto cada uma representa na fatura. Assim, você sabe quem gastou o quê e evita controles paralelos.",
  },
  organizador: {
    eyebrow: "Planilha financeira",
    title: "Entenda o Organizador",
    description: "Uma visão prática para cuidar do seu dinheiro todos os meses.",
    body: "Registre receitas e despesas, acompanhe o resultado do mês, defina limites e transforme o que sobra em planos. É sua planilha financeira com contexto para decidir melhor.",
  },
} as const;

export const ProductExplainerDialog: React.FC<ProductExplainerDialogProps> = ({ product }) => {
  const content = CONTENT[product];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-primary">
          <Info className="h-3.5 w-3.5" /> Entenda como funciona
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-3xl p-6">
        <DialogHeader className="text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">{content.eyebrow}</p>
          <DialogTitle className="font-heading text-xl">{content.title}</DialogTitle>
          <DialogDescription className="pt-1 text-sm font-medium text-foreground/80">{content.description}</DialogDescription>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-muted-foreground">{content.body}</p>
      </DialogContent>
    </Dialog>
  );
};
