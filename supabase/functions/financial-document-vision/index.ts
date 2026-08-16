const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Você extrai dados factuais de imagens de extratos bancários e faturas de cartão brasileiros.

Retorne APENAS JSON estrito neste formato:
{"institution":"NUBANK|MERCADO_PAGO|PICPAY|C6|BRADESCARD|BRADESCO|UNKNOWN","document_type":"BANK_STATEMENT|CREDIT_CARD_STATEMENT|UNKNOWN","due_date":"YYYY-MM-DD|null","statement_month":"YYYY-MM|null","totals":{"total_credits":number|null,"total_debits":number|null,"statement_total":number|null},"warnings":[string],"transactions":[{"external_id":string|null,"description_original":string,"merchant_name":string|null,"amount":number,"direction":"CREDIT|DEBIT","transaction_date":"YYYY-MM-DD","posting_date":"YYYY-MM-DD|null","due_date":"YYYY-MM-DD|null","statement_month":"YYYY-MM|null","competence_month":"YYYY-MM|null","source_type":"BANK_ACCOUNT|CREDIT_CARD","card_last4":string|null,"installment_current":number|null,"installment_total":number|null,"category_hint":string|null,"confidence":number,"reason":string,"needs_review":boolean,"page_number":number}]}

Regras obrigatórias:
- Extraia somente linhas visíveis. Nunca invente descrição, data ou valor.
- amount é sempre positivo; direction representa entrada/crédito ou saída/débito.
- Em fatura de cartão, compras são DEBIT e pagamentos/estornos são CREDIT.
- Não descarte pagamento de fatura, estorno, tarifa, rendimento, aplicação ou resgate; a aplicação classificará essas linhas depois.
- PIX/TED sem contexto, texto ilegível e resgate com rendimento misturado devem ter needs_review=true.
- purchase/transaction_date é a data original da compra. posting_date é a data de lançamento, se o documento mostrar ambas.
- due_date é o vencimento da fatura, não a data da compra.
- statement_month é o mês da fatura; competence_month normalmente é o mês da compra.
- Preserve description_original como aparece no documento.
- Se uma linha continuar em outra imagem/página, una quando houver evidência; não duplique.
- page_number deve usar o número informado junto de cada imagem.
- Totais só podem ser preenchidos quando estiverem impressos no documento.
- Confiança entre 0 e 1. Marque needs_review abaixo de 0.7.
- Bradescard pode aparecer como Amazon/Prime; ainda assim não limite a detecção a bancos conhecidos.`;

const safeDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
const safeMonth = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? value : null;
const safeNumber = (value: unknown) => Number.isFinite(Number(value)) ? Math.abs(Number(value)) : null;

const sanitize = (raw: any, allowedPages: Set<number>) => {
  const transactions = Array.isArray(raw?.transactions) ? raw.transactions.flatMap((tx: any) => {
    const amount = safeNumber(tx?.amount);
    const description = String(tx?.description_original || "").replace(/[\r\n]+/g, " ").trim().slice(0, 300);
    const date = safeDate(tx?.transaction_date);
    if (!amount || !description || !date) return [];
    const page = allowedPages.has(Number(tx?.page_number)) ? Number(tx.page_number) : Math.min(...allowedPages);
    const confidence = Math.max(0, Math.min(1, Number(tx?.confidence) || 0.55));
    return [{
      external_id: tx?.external_id ? String(tx.external_id).slice(0, 160) : null,
      description_original: description,
      merchant_name: tx?.merchant_name ? String(tx.merchant_name).slice(0, 160) : null,
      amount,
      direction: tx?.direction === "CREDIT" ? "CREDIT" : "DEBIT",
      transaction_date: date,
      posting_date: safeDate(tx?.posting_date),
      due_date: safeDate(tx?.due_date),
      statement_month: safeMonth(tx?.statement_month),
      competence_month: safeMonth(tx?.competence_month),
      source_type: tx?.source_type === "CREDIT_CARD" ? "CREDIT_CARD" : "BANK_ACCOUNT",
      card_last4: /^\d{4}$/.test(String(tx?.card_last4 || "")) ? String(tx.card_last4) : null,
      installment_current: Number.isInteger(Number(tx?.installment_current)) ? Number(tx.installment_current) : null,
      installment_total: Number.isInteger(Number(tx?.installment_total)) ? Number(tx.installment_total) : null,
      category_hint: tx?.category_hint ? String(tx.category_hint).slice(0, 80) : null,
      confidence,
      reason: String(tx?.reason || "Extraído da imagem.").slice(0, 200),
      needs_review: Boolean(tx?.needs_review) || confidence < 0.7,
      page_number: page,
    }];
  }) : [];
  const allowedInstitutions = ["NUBANK", "MERCADO_PAGO", "PICPAY", "C6", "BRADESCARD", "BRADESCO", "UNKNOWN"];
  const allowedDocuments = ["BANK_STATEMENT", "CREDIT_CARD_STATEMENT", "UNKNOWN"];
  return {
    institution: allowedInstitutions.includes(raw?.institution) ? raw.institution : "UNKNOWN",
    document_type: allowedDocuments.includes(raw?.document_type) ? raw.document_type : "UNKNOWN",
    due_date: safeDate(raw?.due_date),
    statement_month: safeMonth(raw?.statement_month),
    totals: {
      total_credits: safeNumber(raw?.totals?.total_credits),
      total_debits: safeNumber(raw?.totals?.total_debits),
      statement_total: safeNumber(raw?.totals?.statement_total),
    },
    warnings: Array.isArray(raw?.warnings) ? raw.warnings.map((w: unknown) => String(w).slice(0, 200)).slice(0, 20) : [],
    transactions,
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Método não permitido", { status: 405, headers: corsHeaders });
  try {
    const body = await req.json();
    const images = Array.isArray(body?.images) ? body.images.slice(0, 3) : [];
    if (!images.length) throw new Error("Nenhuma imagem recebida.");
    let totalBytes = 0;
    const content: any[] = [{
      type: "text",
      text: `Arquivo: ${String(body?.fileName || "documento").slice(0, 120)}. As imagens abaixo trazem o número real da página.`,
    }];
    const allowedPages = new Set<number>();
    for (const item of images) {
      const dataUrl = String(item?.dataUrl || "");
      if (!/^data:image\/(jpeg|png|webp);base64,/i.test(dataUrl)) throw new Error("Imagem inválida.");
      totalBytes += dataUrl.length;
      if (totalBytes > 7_000_000) throw new Error("Lote de imagens muito grande.");
      const pageNumber = Math.max(1, Number(item?.pageNumber) || 1);
      allowedPages.add(pageNumber);
      content.push({ type: "text", text: `Página ${pageNumber}:` });
      content.push({ type: "image_url", image_url: { url: dataUrl } });
    }

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("LOVABLE_API_KEY ausente");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content }],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      if (response.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
      if (response.status === 429) throw new Error("Muitas requisições à IA. Tente novamente em instantes.");
      throw new Error(`Falha na visão (${response.status}): ${detail.slice(0, 160)}`);
    }
    const gateway = await response.json();
    const answer = String(gateway?.choices?.[0]?.message?.content || "{}");
    let parsed: any;
    try { parsed = JSON.parse(answer); } catch {
      const match = answer.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }
    return new Response(JSON.stringify(sanitize(parsed, allowedPages)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || "Falha ao ler documento." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
