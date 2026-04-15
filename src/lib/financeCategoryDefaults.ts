import { supabase } from "@/integrations/supabase/client";

type CategoryKind = "expense" | "income" | "transfer";
type ParentDef = { name: string; kind: CategoryKind; color: string; icon: string };
type ChildDef = { name: string; kind: CategoryKind; parent: string; color: string; icon: string };

const PARENTS: ParentDef[] = [
  { name: "Casa", kind: "expense", color: "#45B7D1", icon: "home" },
  { name: "Alimentação", kind: "expense", color: "#FF6B6B", icon: "utensils" },
  { name: "Transporte", kind: "expense", color: "#4ECDC4", icon: "car" },
  { name: "Saúde", kind: "expense", color: "#96CEB4", icon: "heart" },
  { name: "Educação", kind: "expense", color: "#FFEAA7", icon: "book-open" },
  { name: "Lazer", kind: "expense", color: "#DDA0DD", icon: "gamepad-2" },
  { name: "Assinaturas", kind: "expense", color: "#BB8FCE", icon: "repeat" },
  { name: "Impostos", kind: "expense", color: "#F0B27A", icon: "tag" },
  { name: "Outros", kind: "expense", color: "#AEB6BF", icon: "ellipsis" },
  { name: "Salário", kind: "income", color: "#2ECC71", icon: "banknote" },
  { name: "Renda Extra", kind: "income", color: "#27AE60", icon: "briefcase" },
  { name: "Investimentos", kind: "income", color: "#1ABC9C", icon: "trending-up" },
  { name: "Transferências", kind: "transfer", color: "#85929E", icon: "arrow-right-left" },
];

const CHILDREN: ChildDef[] = [
  { name: "Aluguel", kind: "expense", parent: "Casa", color: "#45B7D1", icon: "home" },
  { name: "Condomínio", kind: "expense", parent: "Casa", color: "#45B7D1", icon: "home" },
  { name: "Energia", kind: "expense", parent: "Casa", color: "#45B7D1", icon: "sparkles" },
  { name: "Água", kind: "expense", parent: "Casa", color: "#45B7D1", icon: "sparkles" },
  { name: "Internet", kind: "expense", parent: "Casa", color: "#45B7D1", icon: "wifi" },
  { name: "Mercado", kind: "expense", parent: "Alimentação", color: "#FF6B6B", icon: "shopping-cart" },
  { name: "Restaurante", kind: "expense", parent: "Alimentação", color: "#FF6B6B", icon: "utensils" },
  { name: "Delivery", kind: "expense", parent: "Alimentação", color: "#FF6B6B", icon: "coffee" },
  { name: "Gasolina", kind: "expense", parent: "Transporte", color: "#4ECDC4", icon: "car" },
  { name: "Uber e Táxi", kind: "expense", parent: "Transporte", color: "#4ECDC4", icon: "car" },
  { name: "Transporte Público", kind: "expense", parent: "Transporte", color: "#4ECDC4", icon: "car" },
  { name: "Farmácia", kind: "expense", parent: "Saúde", color: "#96CEB4", icon: "heart" },
  { name: "Consultas", kind: "expense", parent: "Saúde", color: "#96CEB4", icon: "heart" },
  { name: "Exames", kind: "expense", parent: "Saúde", color: "#96CEB4", icon: "heart" },
  { name: "Cursos", kind: "expense", parent: "Educação", color: "#FFEAA7", icon: "book-open" },
  { name: "Livros", kind: "expense", parent: "Educação", color: "#FFEAA7", icon: "book-open" },
  { name: "Viagens", kind: "expense", parent: "Lazer", color: "#DDA0DD", icon: "plane" },
  { name: "Streaming", kind: "expense", parent: "Assinaturas", color: "#BB8FCE", icon: "phone" },
  { name: "IPTU", kind: "expense", parent: "Impostos", color: "#F0B27A", icon: "tag" },
  { name: "IPVA", kind: "expense", parent: "Impostos", color: "#F0B27A", icon: "tag" },
  { name: "Freelance", kind: "income", parent: "Renda Extra", color: "#27AE60", icon: "briefcase" },
  { name: "Bônus", kind: "income", parent: "Renda Extra", color: "#27AE60", icon: "sparkles" },
  { name: "Dividendos", kind: "income", parent: "Investimentos", color: "#1ABC9C", icon: "trending-up" },
  { name: "Rendimentos", kind: "income", parent: "Investimentos", color: "#1ABC9C", icon: "trending-up" },
  { name: "Entre Contas", kind: "transfer", parent: "Transferências", color: "#85929E", icon: "arrow-right-left" },
];

export const ensureDefaultCategories = async (userId: string) => {
  const { data: existing, error } = await supabase
    .from("categories")
    .select("id, name, kind, parent_id")
    .eq("user_id", userId);
  if (error) throw error;

  const rows = existing || [];
  const normalize = (s: string) =>
    s.trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
    .forEach((row: any) => parentIdByName.set(`${row.kind}:${String(row.name || "").toLowerCase()}`, row.id));

  const childMissing = CHILDREN.filter((child) => {
    const parentId = parentIdByName.get(`${child.kind}:${child.parent.toLowerCase()}`);
    if (!parentId) return false;
    return !current.some(
      (row: any) =>
        String(row.name || "").trim().toLowerCase() === child.name.toLowerCase() &&
        row.kind === child.kind &&
        row.parent_id === parentId,
    );
  });

  if (childMissing.length === 0) return false;

  const payload = childMissing
    .map((child) => {
      const parentId = parentIdByName.get(`${child.kind}:${child.parent.toLowerCase()}`);
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

