import amazonPrimeLogo from "@/assets/banks/amazon-prime.png";
import bbLogo from "@/assets/banks/bb.webp";
import bradescoLogo from "@/assets/banks/bradesco.png";
import c6Logo from "@/assets/banks/c6.jpg";
import caixaLogo from "@/assets/banks/caixa.png";
import interLogo from "@/assets/banks/inter.webp";
import itauLogo from "@/assets/banks/itauu.png";
import mercadopagoLogo from "@/assets/banks/mercadopago.png";
import nubankLogo from "@/assets/banks/nubank.png";
import picpayLogo from "@/assets/banks/picpay.webp";
import santanderLogo from "@/assets/banks/santander.png";
import btgLogo from "@/assets/banks/btg.svg";
import xpLogo from "@/assets/banks/xp.svg";
import neonLogo from "@/assets/banks/neon.svg";
import pagbankLogo from "@/assets/banks/pagbank.svg";
import panLogo from "@/assets/banks/pan.svg";
import safraLogo from "@/assets/banks/safra.svg";
import originalLogo from "@/assets/banks/original.svg";
import willLogo from "@/assets/banks/will.svg";
import othersLogo from "@/assets/banks/others.svg";

export const BANK_BRANDS = [
  "nubank",
  "amazonprime",
  "bradesco",
  "bb",
  "c6",
  "inter",
  "santander",
  "itau",
  "caixa",
  "picpay",
  "mercadopago",
  "btg",
  "xp",
  "neon",
  "pagbank",
  "pan",
  "safra",
  "original",
  "will",
  "others",
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
  { value: "amazonprime", label: "Amazon Prime", logo: amazonPrimeLogo, accent: "from-[#FF5A00] to-[#FF9900]" },
  { value: "bradesco", label: "Bradesco", logo: bradescoLogo, accent: "from-[#CC092F] to-[#E25171]" },
  { value: "bb", label: "Banco do Brasil", logo: bbLogo, accent: "from-[#F7C400] to-[#FFE05A]" },
  { value: "c6", label: "C6", logo: c6Logo, accent: "from-[#131313] to-[#3C3C3C]" },
  { value: "inter", label: "Inter", logo: interLogo, accent: "from-[#FF7A00] to-[#FFA347]" },
  { value: "santander", label: "Santander", logo: santanderLogo, accent: "from-[#EC0000] to-[#F56A6A]" },
  { value: "itau", label: "Itau", logo: itauLogo, accent: "from-[#EC7000] to-[#F4A245]" },
  { value: "caixa", label: "Caixa", logo: caixaLogo, accent: "from-[#005CA8] to-[#3A84C7]" },
  { value: "picpay", label: "PicPay", logo: picpayLogo, accent: "from-[#21C25E] to-[#6ADF91]" },
  { value: "mercadopago", label: "Mercado Pago", logo: mercadopagoLogo, accent: "from-[#009EE3] to-[#57BFE9]" },
  { value: "btg", label: "BTG Pactual", logo: btgLogo, accent: "from-[#06244D] to-[#2A5A9A]" },
  { value: "xp", label: "XP", logo: xpLogo, accent: "from-[#111111] to-[#444444]" },
  { value: "neon", label: "Neon", logo: neonLogo, accent: "from-[#00A9E8] to-[#74D8FF]" },
  { value: "pagbank", label: "PagBank", logo: pagbankLogo, accent: "from-[#08A66A] to-[#62D6A1]" },
  { value: "pan", label: "Banco PAN", logo: panLogo, accent: "from-[#00A7DF] to-[#65D7F7]" },
  { value: "safra", label: "Safra", logo: safraLogo, accent: "from-[#008ACB] to-[#70C8EF]" },
  { value: "original", label: "Banco Original", logo: originalLogo, accent: "from-[#F15A24] to-[#FF9B73]" },
  { value: "will", label: "Will Bank", logo: willLogo, accent: "from-[#FFD900] to-[#FFF09A]" },
  { value: "others", label: "Outros", logo: othersLogo, accent: "from-[#64748B] to-[#A5B4FC]" },
];

export const BANK_MAP: Record<BankBrand, BankInfo> = BANK_OPTIONS.reduce(
  (acc, item) => {
    acc[item.value] = item;
    return acc;
  },
  {} as Record<BankBrand, BankInfo>,
);
