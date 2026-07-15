// Smart parser: text / paste / image -> transações estruturadas via Lovable AI (Gemini)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Mode = "text" | "paste" | "image";

interface ParsedTx {
  type: "income" | "expense";
  amount: number;
  description: string;
  date: string; // YYYY-MM-DD
  payment_method?: "pix" | "boleto" | "credit" | "debit" | "cash" | null;
  category_hint?: string | null;
  installments?: number | null;
  confidence?: number;
}

const SYSTEM_PROMPT = `Você é um extrator financeiro. Recebe texto livre, texto colado (fatura/extrato) ou imagem (comprovante/print) em português brasileiro e retorna transações estruturadas.

Regras:
- Sempre retorne JSON estrito no formato: {"transactions":[{...}]}
- "type": "expense" para gastos/pagamentos/compras, "income" para receitas/salário/pix recebido.
- "amount": número positivo em reais (float). Nunca negativo.
- "description": curta e clara (ex.: "Mercado Extra", "Uber", "Salário").
- "date": YYYY-MM-DD. Se não houver data explícita, use a data de hoje passada no contexto.
- "payment_method": um de pix, boleto, credit, debit, cash — ou null se não souber.
- "category_hint": sugestão livre em português (ex.: "Alimentação", "Transporte") ou null.
- "installments": número de parcelas se identificado (ex.: 3), senão null.
- "confidence": 0..1.
- Se for uma fatura com várias linhas, retorne cada transação como um item.
- Ignore linhas de "pagamento de fatura" e totais.
- Nunca invente valores. Se o texto for ambíguo, retorne "transactions": [] e nada mais.

Retorne APENAS o JSON, sem markdown.`;

async function callGateway(messages: any[]): Promise<ParsedTx[]> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY ausente");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Muitas requisições. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
    throw new Error(`AI gateway ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : { transactions: [] };
  }
  const arr = Array.isArray(parsed?.transactions) ? parsed.transactions : [];
  return arr
    .filter((t: any) => t && typeof t.amount === "number" && t.amount > 0 && t.description)
    .map((t: any) => ({
      type: t.type === "income" ? "income" : "expense",
      amount: Number(t.amount),
      description: String(t.description).slice(0, 200),
      date: typeof t.date === "string" ? t.date : new Date().toISOString().slice(0, 10),
      payment_method: t.payment_method ?? null,
      category_hint: t.category_hint ?? null,
      installments: t.installments && Number(t.installments) > 1 ? Number(t.installments) : null,
      confidence: typeof t.confidence === "number" ? t.confidence : 0.7,
    }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Método não permitido", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const mode: Mode = body.mode;
    const today = new Date().toISOString().slice(0, 10);
    const contextLine = `Data de hoje: ${today}. Moeda: BRL.`;

    let userContent: any;

    if (mode === "text" || mode === "paste") {
      const text: string = String(body.text || "").trim();
      if (!text) throw new Error("Texto vazio");
      const instruction = mode === "text"
        ? `Extraia UMA ou MAIS transações desta descrição livre do usuário:\n\n"""${text}"""`
        : `O usuário colou o texto abaixo (pode ser fatura, extrato, comprovante). Extraia todas as transações relevantes:\n\n"""${text}"""`;
      userContent = `${contextLine}\n\n${instruction}`;
    } else if (mode === "image") {
      const dataUrl: string = String(body.imageDataUrl || "");
      if (!dataUrl.startsWith("data:")) throw new Error("Imagem inválida");
      userContent = [
        { type: "text", text: `${contextLine}\n\nAnalise este comprovante/print e extraia a(s) transação(ões).` },
        { type: "image_url", image_url: { url: dataUrl } },
      ];
    } else {
      throw new Error("Modo inválido");
    }

    const transactions = await callGateway([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ]);

    return new Response(JSON.stringify({ transactions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Erro desconhecido" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});