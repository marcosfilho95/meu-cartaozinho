import type { ReferenceRate } from "@/lib/goalProjections";

export type FixedIncomeIndexer = "cdi" | "selic" | "fixed" | "ipca";

export const getFixedIncomeAnnualRate = (
  indexer: FixedIncomeIndexer,
  ratePercent: number,
  references: ReferenceRate[],
) => {
  const rate = Math.max(Number(ratePercent) || 0, 0);
  if (indexer === "fixed") return rate;
  if (indexer === "ipca") return rate;
  const reference = references.find((item) => item.rate_key === indexer);
  return Math.max(Number(reference?.annual_rate) || 0, 0) * rate / 100;
};

export const estimateFixedIncome = ({
  principal,
  annualRate,
  startedAt,
  taxable,
  asOf = new Date(),
}: {
  principal: number;
  annualRate: number;
  startedAt: string;
  taxable: boolean;
  asOf?: Date;
}) => {
  const start = new Date(`${startedAt}T12:00:00`);
  const days = Number.isNaN(start.getTime()) ? 0 : Math.max(0, Math.floor((asOf.getTime() - start.getTime()) / 86_400_000));
  const grossYield = Math.max(principal, 0) * (Math.pow(1 + Math.max(annualRate, 0) / 100, days / 365) - 1);
  const irRate = !taxable ? 0 : days <= 180 ? 0.225 : days <= 360 ? 0.2 : days <= 720 ? 0.175 : 0.15;
  // IOF incide somente sobre o rendimento em resgates antes de 30 dias.
  const iofTable = [0, 0.96, 0.93, 0.9, 0.86, 0.83, 0.8, 0.76, 0.73, 0.7, 0.66, 0.63, 0.6, 0.56, 0.53, 0.5, 0.46, 0.43, 0.4, 0.36, 0.33, 0.3, 0.26, 0.23, 0.2, 0.16, 0.13, 0.1, 0.06, 0.03];
  const iofRate = !taxable || days >= 30 ? 0 : iofTable[days] || 0;
  const taxes = grossYield * (irRate + (1 - irRate) * iofRate);
  return {
    days,
    grossYield,
    estimatedTaxes: taxes,
    netYield: Math.max(grossYield - taxes, 0),
    estimatedValue: principal + Math.max(grossYield - taxes, 0),
  };
};
