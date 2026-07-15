// Classifica lote de linhas importadas usando Lovable AI (Gemini).
// Retorna, para cada linha, categoria sugerida (nome + tipo) e se deve criar categoria nova.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InRow {
  index: number;
  description: string;
  merchant?: string | null;
  amount: number;
  direction: "CREDIT" | "DEBIT";
  sourceType?: string | null; // BANK | CREDIT_CARD
  isTransfer?: boolean;
}

interface OutRow {
  index: number;
  categoryName: string;
  categoryKind: "income" | "expense" | "transfer";
  createIfMissing: boolean;
  confidence: number;
  reason?: string;
}

const SYSTEM_PROMPT = `Você é um classificador financeiro brasileiro. Recebe uma lista de linhas de extrato/fatura e uma lista de categorias existentes do usuário. Para cada linha, decida a MELHOR categoria.

Regras:
- Retorne SEMPRE JSON estrito: {"results":[{"index":number,"categoryName":string,"categoryKind":"income"|"expense"|"transfer","createIfMissing":boolean,"confidence":0..1,"reason":string}]}.
- Prefira uma categoria EXISTENTE do usuário quando fizer sentido (use o nome exato). Só marque createIfMissing=true quando nenhuma existente serve e a categoria nova é claramente útil (ex.: "Pet" para COBASI, PETZ; "Farmácia" para RD/DROGASIL/PACHECO; "Streaming" para NETFLIX/SPOTIFY).
- Reconheça padrões brasileiros:
  * PIX RECEBIDO / TED CRÉDITO / DEP → income, categoria "Recebimentos" ou "Transferências recebidas" (createIfMissing se não existir).
  * PIX ENVIADO entre contas do próprio usuário → transfer, categoria "Entre Contas".
  * PIX ENVIADO para terceiros → expense, categoria por contexto ou "Pix enviado".
  * RENDIMENTOS / JUROS / CDB → income, "Rendimentos".
  * PAGAMENTO DE FATURA / CARTÃO → transfer, "Pagamento de Cartão".
  * Luz/CEMIG/ENEL/COELBA → expense, "Contas de Casa" ou "Energia".
  * Água/SAAE/SABESP/CAGECE → "Água".
  * Internet/VIVO/CLARO/TIM/NET → "Internet" ou "Telefonia".
  * Mercado/EXTRA/CARREFOUR/ASSAI/MERCADINHO → "Alimentação" ou "Mercado".
  * IFOOD/RAPPI/UBER EATS → "Alimentação" ou "Delivery".
  * UBER/99/POSTO/SHELL/IPIRANGA → "Transporte" ou "Combustível".
  * COBASI/PETZ/PETSHOP → "Pet".
  * RD SAUDE/DROGASIL/DROGARIA/PACHECO/PANVEL → "Farmácia".
  * NETFLIX/SPOTIFY/PRIME/DISNEY → "Streaming".
  * AMAZON/MERCADO LIVRE/SHOPEE/MAGALU → "Compras" ou "Compras online".
- categoryKind DEVE bater com a direção: DEBIT→expense (ou transfer), CREDIT→income (ou transfer). Nunca income para DEBIT.
- Nunca invente linhas nem descarte nenhuma. Retorne EXATAMENTE um item por index recebido.
- Nomes de categoria em português, curtos, capitalizados (ex.: "Alimentação", "Pet", "Farmácia").

Retorne APENAS o JSON, sem markdown.`;

async function callGateway(messages: any[]): Promise<OutRow[]> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY ausente");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
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
    parsed = match ? JSON.parse(match[0]) : { results: [] };
  }
  const arr = Array.isArray(parsed?.results) ? parsed.results : [];
  return arr
    .filter((r: any) => typeof r?.index === "number" && typeof r?.categoryName === "string" && r.categoryName.trim())
    .map((r: any) => ({
      index: Number(r.index),
      categoryName: String(r.categoryName).trim().slice(0, 60),
      categoryKind: r.categoryKind === "income" ? "income" : r.categoryKind === "transfer" ? "transfer" : "expense",
      createIfMissing: Boolean(r.createIfMissing),
      confidence: typeof r.confidence === "number" ? r.confidence : 0.7,
      reason: typeof r.reason === "string" ? r.reason.slice(0, 200) : undefined,
    })) as OutRow[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Método não permitido", { status: 405, headers: corsHeaders });

  try {
    const body = await req.json();
    const rows: InRow[] = Array.isArray(body?.rows) ? body.rows : [];
    const categories: Array<{ name: string; kind: string }> = Array.isArray(body?.categories) ? body.categories : [];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chunk em blocos de 40 pra manter latência baixa e evitar payload gigante.
    const CHUNK = 40;
    const all: OutRow[] = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const userMsg = {
        categoriesExistentes: categories.map((c) => ({ nome: c.name, tipo: c.kind })),
        linhas: slice.map((r) => ({
          index: r.index,
          descricao: r.description,
          comerciante: r.merchant || null,
          valor: r.amount,
          direcao: r.direction,
          origem: r.sourceType || null,
          transferencia: Boolean(r.isTransfer),
        })),
      };
      const results = await callGateway([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(userMsg) },
      ]);
      all.push(...results);
    }

    return new Response(JSON.stringify({ results: all }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Erro desconhecido" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});