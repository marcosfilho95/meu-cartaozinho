import bbLogo from "@/assets/banks/bb.webp";
import bradescoLogo from "@/assets/banks/bradesco.png";
import c6Logo from "@/assets/banks/c6.jpg";
import caixaLogo from "@/assets/banks/caixa.png";
import interLogo from "@/assets/banks/inter.jpg";
import itauLogo from "@/assets/banks/itau.jpg";
import mercadopagoLogo from "@/assets/banks/mercadopago.webp";
import nubankLogo from "@/assets/banks/nubank.png";
import picpayLogo from "@/assets/banks/picpay.webp";
import santanderLogo from "@/assets/banks/santander.png";

export const BANK_BRANDS = [
  "nubank",
  "bradesco",
  "bb",
  "c6",
  "inter",
  "santander",
  "itau",
  "caixa",
  "picpay",
  "mercadopago",
] as const;

export type BankBrand = (typeof BANK_BRANDS)[number];

export interface BankInfo {
  value: BankBrand;
  label: string;
  logo: string;
  accent: string;
}

export const BANK_OPTIONS: BankInfo[] = [
  { value: "nubank", label: "Nubank", logo: nubankLogo, accent: "from-[#8A05BE] to-[#B65AD8]" },
  { value: "bradesco", label: "Bradesco", logo: bradescoLogo, accent: "from-[#CC092F] to-[#E25171]" },
  { value: "bb", label: "Banco do Brasil", logo: bbLogo, accent: "from-[#F7C400] to-[#FFE05A]" },
  { value: "c6", label: "C6", logo: c6Logo, accent: "from-[#131313] to-[#3C3C3C]" },
  { value: "inter", label: "Inter", logo: interLogo, accent: "from-[#FF7A00] to-[#FFA347]" },
  { value: "santander", label: "Santander", logo: santanderLogo, accent: "from-[#EC0000] to-[#F56A6A]" },
  { value: "itau", label: "Itau", logo: itauLogo, accent: "from-[#EC7000] to-[#F4A245]" },
  { value: "caixa", label: "Caixa", logo: caixaLogo, accent: "from-[#005CA8] to-[#3A84C7]" },
  { value: "picpay", label: "PicPay", logo: picpayLogo, accent: "from-[#21C25E] to-[#6ADF91]" },
  { value: "mercadopago", label: "Mercado Pago", logo: mercadopagoLogo, accent: "from-[#009EE3] to-[#57BFE9]" },
];

export const BANK_MAP: Record<BankBrand, BankInfo> = BANK_OPTIONS.reduce(
  (acc, item) => {
    acc[item.value] = item;
    return acc;
  },
  {} as Record<BankBrand, BankInfo>,
);
