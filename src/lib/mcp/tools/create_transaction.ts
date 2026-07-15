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
  name: "create_transaction",
  title: "Criar transação",
  description: "Cria uma nova transação (receita, despesa ou transferência) para o usuário autenticado.",
  inputSchema: {
    account_id: z.string().uuid().describe("ID da conta associada (use list_accounts)."),
    type: z.enum(["income", "expense", "transfer"]).describe("Tipo de transação."),
    amount: z.number().positive().describe("Valor positivo em BRL."),
    transaction_date: z.string().describe("Data no formato YYYY-MM-DD."),
    category_id: z.string().uuid().optional().describe("ID da categoria (use list_categories)."),
    notes: z.string().optional().describe("Descrição/observações."),
    status: z.enum(["pending", "cleared", "reconciled"]).optional(),
    payment_method: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: ctx.getUserId(),
        account_id: input.account_id,
        type: input.type,
        amount: input.amount,
        transaction_date: input.transaction_date,
        category_id: input.category_id ?? null,
        notes: input.notes ?? null,
        status: input.status ?? "cleared",
        payment_method: input.payment_method ?? null,
        source: "mcp",
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Transação criada: ${data.id}` }],
      structuredContent: { transaction: data },
    };
  },
});