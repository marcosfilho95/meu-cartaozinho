/**
 * Generates installments for a purchase.
 * The last installment adjusts to ensure the total matches exactly.
 */
export function generateInstallments(params: {
  totalAmount: number;
  installmentsCount: number;
  dueDay: number;
  startMonth: string; // YYYY-MM
}) {
  const { totalAmount, installmentsCount, dueDay, startMonth } = params;
  const baseAmount = Math.floor((totalAmount / installmentsCount) * 100) / 100;
  const installments: Array<{
    installmentNumber: number;
    refMonth: string;
    dueDay: number;
    amount: number;
  }> = [];

  let remaining = totalAmount;

  for (let i = 0; i < installmentsCount; i++) {
    const refMonth = addMonths(startMonth, i);
    const isLast = i === installmentsCount - 1;
    const amount = isLast ? Math.round(remaining * 100) / 100 : baseAmount;
    remaining -= amount;

    installments.push({
      installmentNumber: i + 1,
      refMonth,
      dueDay,
      amount,
    });
  }

  return installments;
}

export function addMonths(yearMonth: string, months: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + months, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${months[month - 1]} ${year}`;
}

export function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
