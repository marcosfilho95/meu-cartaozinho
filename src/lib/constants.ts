// Category icons mapped to lucide-react icon names
export const CATEGORY_ICONS: Record<string, string> = {
  utensils: "Utensils",
  car: "Car",
  home: "Home",
  heart: "Heart",
  "book-open": "BookOpen",
  "gamepad-2": "Gamepad2",
  shirt: "Shirt",
  repeat: "Repeat",
  ellipsis: "Ellipsis",
  banknote: "Banknote",
  briefcase: "Briefcase",
  "trending-up": "TrendingUp",
  "plus-circle": "PlusCircle",
  "arrow-right-left": "ArrowRightLeft",
  tag: "Tag",
  "shopping-cart": "ShoppingCart",
  coffee: "Coffee",
  gift: "Gift",
  plane: "Plane",
  phone: "Phone",
  wifi: "Wifi",
  baby: "Baby",
  dog: "Dog",
  wrench: "Wrench",
  sparkles: "Sparkles",
};

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  checking: "Conta Corrente",
  savings: "Poupança",
  credit_card: "Cartão de Crédito",
  investment: "Investimento",
  loan: "Empréstimo",
};

export const ACCOUNT_TYPE_ICONS: Record<string, string> = {
  cash: "Wallet",
  checking: "Building2",
  savings: "PiggyBank",
  credit_card: "CreditCard",
  investment: "TrendingUp",
  loan: "HandCoins",
};

export const TRANSACTION_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Atrasado",
  canceled: "Cancelado",
};

export const TRANSACTION_STATUS_COLORS: Record<string, string> = {
  pending: "text-warning",
  paid: "text-success",
  overdue: "text-destructive",
  canceled: "text-muted-foreground",
};

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export const formatDate = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(date));

export const formatShortDate = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(date));
