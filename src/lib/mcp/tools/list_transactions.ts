import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_transactions",
  title: "Listar transações",
  description: "Lista as transações do usuário autenticado, opcionalmente filtradas por intervalo de datas, tipo, conta ou categoria.",
  inputSchema: {
    from_date: z.string().optional().describe("Data inicial no formato YYYY-MM-DD."),
    to_date: z.string().optional().describe("Data final no formato YYYY-MM-DD."),
    type: z.enum(["income", "expense", "transfer"]).optional(),
    account_id: z.string().uuid().optional(),
    category_id: z.string().uuid().optional(),
    limit: z.number().int().positive().optional().describe("Máximo de registros (padrão 50, máximo 500)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const limit = Math.min(input.limit ?? 50, 500);
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("transactions")
      .select("id,transaction_date,type,amount,status,notes,account_id,category_id,payee_id,payment_method,source")
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false })
      .limit(limit);
    if (input.from_date) query = query.gte("transaction_date", input.from_date);
    if (input.to_date) query = query.lte("transaction_date", input.to_date);
    if (input.type) query = query.eq("type", input.type);
    if (input.account_id) query = query.eq("account_id", input.account_id);
    if (input.category_id) query = query.eq("category_id", input.category_id);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { transactions: data ?? [] },
    };
  },
});