import { supabase } from "@/integrations/supabase/client";

type CategoryKind = "expense" | "income" | "transfer";
type ParentDef = { name: string; kind: CategoryKind; color: string; icon: string };
type ChildDef = { name: string; kind: CategoryKind; parent: string; color: string; icon: string };

const UTF_FIXES: Record<string, string> = {
  "AlimentaÃ§Ã£o": "Alimentação",
  "EducaÃ§Ã£o": "Educação",
  "SaÃºde": "Saúde",
  "SalÃ¡rio": "Salário",
  "TransferÃªncias": "Transferências",
  "CondomÃ­nio": "Condomínio",
  "Ãgua": "Água",
  "Uber e TÃ¡xi": "Uber e Táxi",
  "Transporte PÃºblico": "Transporte Público",
  "FarmÃ¡cia": "Farmácia",
  "BÃ´nus": "Bônus",
  "CartÃ£o": "Cartão",
  "CartÃµes": "Cartões",
};

const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeKey = (name: string) => normalize(UTF_FIXES[name] || name);

const repairCategoryEncodingAndDuplicates = async (userId: string) => {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, kind, parent_id, created_at")
    .eq("user_id", userId);
  if (error) throw error;

  const rows = (data || []) as Array<{
    id: string;
    name: string;
    kind: CategoryKind;
    parent_id: string | null;
    created_at: string;
  }>;

  const grouped = new Map<string, typeof rows>();
  rows.forEach((row) => {
    const key = `${row.kind}:${normalizeKey(row.name)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  });

  for (const list of grouped.values()) {
    if (list.length <= 1) {
      const only = list[0];
      const fixedName = UTF_FIXES[only.name];
      if (fixedName && fixedName !== only.name) {
        const { error: renameError } = await supabase.from("categories").update({ name: fixedName }).eq("id", only.id);
        if (renameError && !renameError.message.includes("idx_categories_unique_normalized")) throw renameError;
      }
      continue;
    }

    const desiredName = UTF_FIXES[list[0].name] || list[0].name;
    const sorted = [...list].sort((a, b) => {
      const aScore = a.name === desiredName ? 0 : 1;
      const bScore = b.name === desiredName ? 0 : 1;
      if (aScore !== bScore) return aScore - bScore;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });

    const keeper = sorted[0];
    const duplicates = sorted.slice(1);

    if (keeper.name !== desiredName) {
      const { error: renameError } = await supabase.from("categories").update({ name: desiredName }).eq("id", keeper.id);
      if (renameError && !renameError.message.includes("idx_categories_unique_normalized")) throw renameError;
    }

    for (const duplicate of duplicates) {
      await supabase.from("categories").update({ parent_id: keeper.id }).eq("parent_id", duplicate.id);
      await supabase.from("transactions").update({ category_id: keeper.id }).eq("category_id", duplicate.id);
      await supabase.from("budgets").update({ category_id: keeper.id }).eq("category_id", duplicate.id);
      const { error: deleteError } = await supabase.from("categories").delete().eq("id", duplicate.id);
      if (deleteError) throw deleteError;
    }
  }
};

const PARENTS: ParentDef[] = [
  { name: "Casa", kind: "expense", color: "#5B8DEF", icon: "home" },
  { name: "Alimentação", kind: "expense", color: "#E85D75", icon: "utensils" },
  { name: "Transporte", kind: "expense", color: "#F0A030", icon: "car" },
  { name: "Saúde", kind: "expense", color: "#43B89C", icon: "heart" },
  { name: "Educação", kind: "expense", color: "#A78BFA", icon: "book-open" },
  { name: "Lazer", kind: "expense", color: "#EC6FCF", icon: "gamepad-2" },
  { name: "Assinaturas", kind: "expense", color: "#6DAFDB", icon: "repeat" },
  { name: "Impostos", kind: "expense", color: "#D4915E", icon: "tag" },
  { name: "Outros", kind: "expense", color: "#94A3B8", icon: "ellipsis" },
  { name: "Salário", kind: "income", color: "#34D399", icon: "banknote" },
  { name: "Renda Extra", kind: "income", color: "#FBBF24", icon: "briefcase" },
  { name: "Investimentos", kind: "income", color: "#38BDF8", icon: "trending-up" },
  { name: "Transferências", kind: "transfer", color: "#78839B", icon: "arrow-right-left" },
];

const CHILDREN: ChildDef[] = [
  { name: "Aluguel", kind: "expense", parent: "Casa", color: "#4A7FDB", icon: "home" },
  { name: "Condomínio", kind: "expense", parent: "Casa", color: "#6B9BF0", icon: "home" },
  { name: "Energia", kind: "expense", parent: "Casa", color: "#EAB308", icon: "sparkles" },
  { name: "Água", kind: "expense", parent: "Casa", color: "#22D3EE", icon: "sparkles" },
  { name: "Internet", kind: "expense", parent: "Casa", color: "#818CF8", icon: "wifi" },
  { name: "Mercado", kind: "expense", parent: "Alimentação", color: "#F87171", icon: "shopping-cart" },
  { name: "Restaurante", kind: "expense", parent: "Alimentação", color: "#D946A8", icon: "utensils" },
  { name: "Delivery", kind: "expense", parent: "Alimentação", color: "#FB923C", icon: "coffee" },
  { name: "Gasolina", kind: "expense", parent: "Transporte", color: "#E0A020", icon: "car" },
  { name: "Uber e Táxi", kind: "expense", parent: "Transporte", color: "#F59E42", icon: "car" },
  { name: "Transporte Público", kind: "expense", parent: "Transporte", color: "#10B981", icon: "car" },
  { name: "Farmácia", kind: "expense", parent: "Saúde", color: "#14B8A6", icon: "heart" },
  { name: "Consultas", kind: "expense", parent: "Saúde", color: "#6EE7B7", icon: "heart" },
  { name: "Exames", kind: "expense", parent: "Saúde", color: "#2DD4BF", icon: "heart" },
  { name: "Cursos", kind: "expense", parent: "Educação", color: "#C084FC", icon: "book-open" },
  { name: "Livros", kind: "expense", parent: "Educação", color: "#8B5CF6", icon: "book-open" },
  { name: "Viagens", kind: "expense", parent: "Lazer", color: "#F472B6", icon: "plane" },
  { name: "Streaming", kind: "expense", parent: "Assinaturas", color: "#60A5FA", icon: "phone" },
  { name: "IPTU", kind: "expense", parent: "Impostos", color: "#CD8A4E", icon: "tag" },
  { name: "IPVA", kind: "expense", parent: "Impostos", color: "#B07D4F", icon: "tag" },
  { name: "Freelance", kind: "income", parent: "Renda Extra", color: "#F59E0B", icon: "briefcase" },
  { name: "Bônus", kind: "income", parent: "Renda Extra", color: "#A3E635", icon: "sparkles" },
  { name: "Dividendos", kind: "income", parent: "Investimentos", color: "#06B6D4", icon: "trending-up" },
  { name: "Rendimentos", kind: "income", parent: "Investimentos", color: "#67E8F9", icon: "trending-up" },
  { name: "Entre Contas", kind: "transfer", parent: "Transferências", color: "#78839B", icon: "arrow-right-left" },
];

export const ensureDefaultCategories = async (userId: string) => {
  await repairCategoryEncodingAndDuplicates(userId);

  const { data: existing, error } = await supabase
    .from("categories")
    .select("id, name, kind, parent_id")
    .eq("user_id", userId);
  if (error) throw error;

  const rows = existing || [];
  const hasByName = (name: string, kind: CategoryKind, parentId: string | null) =>
    rows.some(
      (row: any) =>
        normalize(String(row.name || "")) === normalize(name) &&
        row.kind === kind &&
        (row.parent_id || null) === parentId,
    );

  const missingParents = PARENTS.filter((parent) => !hasByName(parent.name, parent.kind, null));
  if (missingParents.length > 0) {
    const { error: insertError } = await supabase.from("categories").insert(
      missingParents.map((item) => ({
        user_id: userId,
        name: item.name,
        kind: item.kind,
        color: item.color,
        icon: item.icon,
        is_system: true,
        parent_id: null,
      })),
    );
    if (insertError) throw insertError;
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from("categories")
    .select("id, name, kind, parent_id")
    .eq("user_id", userId);
  if (refreshError) throw refreshError;
  const current = refreshed || [];

  const parentIdByName = new Map<string, string>();
  current
    .filter((row: any) => !row.parent_id)
    .forEach((row: any) => parentIdByName.set(`${row.kind}:${normalize(String(row.name || ""))}`, row.id));

  const childMissing = CHILDREN.filter((child) => {
    const parentId = parentIdByName.get(`${child.kind}:${normalize(child.parent)}`);
    if (!parentId) return false;
    return !current.some(
      (row: any) =>
        normalize(String(row.name || "")) === normalize(child.name) &&
        row.kind === child.kind &&
        row.parent_id === parentId,
    );
  });

  if (childMissing.length === 0) return false;

  const payload = childMissing
    .map((child) => {
      const parentId = parentIdByName.get(`${child.kind}:${normalize(child.parent)}`);
      if (!parentId) return null;
      return {
        user_id: userId,
        name: child.name,
        kind: child.kind,
        parent_id: parentId,
        color: child.color,
        icon: child.icon,
        is_system: true,
      };
    })
    .filter(Boolean);

  if (payload.length === 0) return false;
  const { error: childError } = await supabase.from("categories").insert(payload as any[]);
  if (childError) throw childError;
  return true;
};
