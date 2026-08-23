export type CardBrandTheme = {
  accent: string;
  soft: string;
  background: string;
};

const THEMES: Record<string, CardBrandTheme> = {
  nubank: { accent: "#8a05be", soft: "rgba(138, 5, 190, 0.10)", background: "linear-gradient(135deg, #8a05be 0%, #5b0878 52%, #260532 100%)" },
  amazonprime: { accent: "#ff6500", soft: "rgba(255, 101, 0, 0.10)", background: "linear-gradient(135deg, #ff7a00 0%, #b94700 52%, #27150a 100%)" },
  bradesco: { accent: "#cc092f", soft: "rgba(204, 9, 47, 0.10)", background: "linear-gradient(135deg, #d4153d 0%, #8d0928 52%, #300814 100%)" },
  bb: { accent: "#f7c400", soft: "rgba(247, 196, 0, 0.12)", background: "linear-gradient(135deg, #172b67 0%, #0d1a43 58%, #07102d 100%)" },
  c6: { accent: "#1a1a1a", soft: "rgba(26, 26, 26, 0.08)", background: "linear-gradient(135deg, #303030 0%, #111827 55%, #020617 100%)" },
  inter: { accent: "#ff7a00", soft: "rgba(255, 122, 0, 0.10)", background: "linear-gradient(135deg, #ff7a00 0%, #ad4300 54%, #321500 100%)" },
  santander: { accent: "#ec0000", soft: "rgba(236, 0, 0, 0.09)", background: "linear-gradient(135deg, #ec1c24 0%, #9d0b18 54%, #32070b 100%)" },
  itau: { accent: "#ec7000", soft: "rgba(236, 112, 0, 0.10)", background: "linear-gradient(135deg, #ec7000 0%, #7c2d12 52%, #1e1b4b 100%)" },
  caixa: { accent: "#005ca8", soft: "rgba(0, 92, 168, 0.10)", background: "linear-gradient(135deg, #0875b9 0%, #07527e 55%, #06263d 100%)" },
  picpay: { accent: "#21c25e", soft: "rgba(33, 194, 94, 0.10)", background: "linear-gradient(135deg, #21c25e 0%, #08783a 52%, #03321d 100%)" },
  mercadopago: { accent: "#009ee3", soft: "rgba(0, 158, 227, 0.10)", background: "linear-gradient(135deg, #009ee3 0%, #086b9e 52%, #062d46 100%)" },
};

const FALLBACK_THEMES: CardBrandTheme[] = [
  { accent: "#0f766e", soft: "rgba(15, 118, 110, 0.10)", background: "linear-gradient(135deg, #0f766e 0%, #064e3b 55%, #022c22 100%)" },
  { accent: "#2563eb", soft: "rgba(37, 99, 235, 0.10)", background: "linear-gradient(135deg, #2563eb 0%, #1e3a8a 55%, #172554 100%)" },
  { accent: "#7c3aed", soft: "rgba(124, 58, 237, 0.10)", background: "linear-gradient(135deg, #7c3aed 0%, #4c1d95 55%, #2e1065 100%)" },
];

export const getCardBrandTheme = (brand?: string | null, fallbackIndex = 0) =>
  THEMES[brand || ""] || FALLBACK_THEMES[fallbackIndex % FALLBACK_THEMES.length];
