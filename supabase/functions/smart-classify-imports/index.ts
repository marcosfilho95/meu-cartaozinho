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

const SYSTEM_PROMPT = `Você é um classificador financeiro brasileiro EXPERT em reconhecimento de marcas e comerciantes.

SEU CONHECIMENTO DE MARCAS (use como se estivesse consultando o Google):
Você conhece TODAS as principais marcas, lojas, bancos, apps e serviços do Brasil — mesmo que apareçam abreviados, com códigos de maquininha (ex.: "CIELO*NOME", "PAG*NOME", "STONE*NOME", "MP*NOME", "REDE*NOME"), com sufixos de cidade/UF, ou com espaçamento estranho. IGNORE prefixos de adquirente (CIELO, REDE, GETNET, STONE, PAG, PAGSEGURO, MP, MERCPAGO, EBW, PICPAY*) ao identificar o comerciante — o nome real vem depois do asterisco/espaço.

Regras de raciocínio:
1. Extraia o NOME DO COMERCIANTE removendo ruído (códigos, números, cidade, UF, prefixo de maquininha).
2. Pense: "que marca/loja é essa? o que ela vende?" — como se pesquisasse no Google.
3. Mapeie para a categoria correta usando o conhecimento abaixo + as categorias existentes do usuário.

MAPEAMENTO POR SETOR (não exaustivo — use conhecimento geral para casos não listados):

🍔 Alimentação / Mercado:
- Supermercados: EXTRA, CARREFOUR, ASSAÍ, ATACADÃO, PÃO DE AÇÚCAR, DIA, SENDAS, BIG, GBARBOSA, MERCADINHO, SUPERMERCADO, HORTIFRUTI, SAM'S CLUB → "Mercado"
- Restaurantes/lanches: MC DONALD'S, MCDONALDS, BURGER KING, BK, SUBWAY, HABIB'S, GIRAFFAS, OUTBACK, MADERO, COCO BAMBU, DIVINO FOGÃO, SPOLETO, CHINA IN BOX, RAGAZZO, BOB'S → "Restaurante"
- Delivery: IFOOD, IFD*, RAPPI, UBER EATS, JAMES DELIVERY, ZE DELIVERY → "Delivery"
- Cafeterias/padarias: STARBUCKS, KOPENHAGEN, CACAU SHOW, BRASIL CACAU, PADARIA, PANIFICADORA, CAFETERIA → "Restaurante" ou "Alimentação"

🚗 Transporte / Combustível:
- Apps: UBER, 99APP, 99POP, CABIFY, INDRIVER → "Uber e Táxi"
- Postos: SHELL, IPIRANGA, PETROBRAS, BR MANIA, POSTO, ALE, RAIZEN → "Gasolina"
- Público: BILHETE ÚNICO, METRÔ, CPTM, VLT, BRT, RECARGA BOM, RIOCARD, JAÉ → "Transporte Público"
- Estacionamento/pedágio: ESTAPAR, MULTIPARK, ECOROD, CCR, AUTOBAN, SEM PARAR, CONECTCAR, VELOE → "Carro"
- Veículo próprio: OFICINA, MECÂNICA, MANUTENÇÃO, AUTOPEÇAS, PNEUS, BORRACHARIA, LAVA-JATO, SEGURO AUTO, LICENCIAMENTO → "Carro"

💊 Saúde / Farmácia:
- Farmácias: RD SAÚDE, RAIA, DROGASIL, DROGARIA SÃO PAULO, DSP, PACHECO, PANVEL, NISSEI, ULTRAFARMA, ARAUJO, PAGUE MENOS, EXTRAFARMA → "Farmácia"
- Consultas/exames: FLEURY, DASA, HERMES PARDINI, DELBONI, EINSTEIN, SÍRIO, OSWALDO CRUZ, CLINICA, LABORATÓRIO → "Consultas" ou "Exames"

🐶 Pet:
- COBASI, PETZ, PETLOVE, PET SHOP, PETSHOP, PETCENTER, DOG HERO, VETERINÁRIO, CLÍNICA VET → "Pet Shop" ou "Veterinário"

👕 Vestuário / Moda:
- Roupas: RENNER, C&A, RIACHUELO, MARISA, ZARA, H&M, HERING, MALWEE, MELISSA, CENTAURO, DECATHLON, NIKE, ADIDAS, PUMA, OSKLEN, RESERVA, FARM, ANIMALE, ARAMIS, POLO WEAR, LEVI'S → "Roupas"
- Calçados: ARE ZONO, ARE SEE, CENTAURO (tênis), NETSHOES, TÊNIS, SAPATARIA, DAKOTA, USAFLEX, WORLD TENNIS → "Calçados"
- Óticas: CHILLI BEANS, ÓTICAS CAROL, DINIZ → "Acessórios"

💄 Cuidados Pessoais:
- Cosméticos/perfumaria: SEPHORA, O BOTICÁRIO, NATURA, EUDORA, AVON, MAC, GRANADO, EPOCA COSMÉTICOS, BELEZA NA WEB → "Cosméticos" ou "Perfumaria"
- Cabeleireiro/estética: SALÃO, BARBEARIA, BARBER, JACQUES JANINE, W SALON, MANICURE → "Cabeleireiro"

🛒 Compras / Marketplace:
- Marketplace geral: AMAZON, AMZN, MERCADO LIVRE, MERCADOLIVRE, ML*, SHOPEE, SHPE*, MAGALU, MAGAZINE LUIZA, AMERICANAS, SUBMARINO, SHOPTIME, ALIEXPRESS → "Compras Online"
- Eletrônicos: FAST SHOP, KABUM, PICHAU, TERABYTE, APPLE STORE, SAMSUNG → "Eletrônicos"
- Casa/decoração: LEROY MERLIN, TOK STOK, ETNA, MADEIRA MADEIRA, OBRAMAX, C&C, TELHANORTE, CASAS BAHIA, PONTO FRIO, HAVAN → "Casa e Decoração"
- Livraria/papelaria: SARAIVA, CULTURA, KALUNGA, AMAZON KINDLE → "Livros" ou "Compras"

🎬 Lazer / Assinaturas:
- Streaming: NETFLIX, SPOTIFY, AMAZON PRIME, PRIME VIDEO, DISNEY+, DISNEYPLUS, HBO MAX, MAX, GLOBOPLAY, DEEZER, YOUTUBE PREMIUM, APPLE TV, APPLE.COM/BILL, PARAMOUNT, CRUNCHYROLL → "Streaming"
- Cinema: CINEMARK, CINÉPOLIS, KINOPLEX, UCI, MOVIECOM → "Cinema"
- Games: STEAM, PLAYSTATION, PSN, XBOX, NINTENDO, EPIC GAMES, RIOT, BLIZZARD → "Hobbies"
- Bares/baladas: BAR, BOTECO, PUB, CERVEJARIA, BALADA → "Bares"
- Viagens: DECOLAR, 123MILHAS, CVC, BOOKING, AIRBNB, HOTEL, POUSADA, LATAM, GOL, AZUL, SMILES → "Viagens"
- Software/apps: APPLE.COM/BILL, GOOGLE *, GOOGLE PLAY, ADOBE, MICROSOFT, ICLOUD, DROPBOX, NOTION, CHATGPT, OPENAI → "Assinaturas"

🏠 Casa (contas fixas):
- Energia: CEMIG, ENEL, LIGHT, COELBA, COPEL, CPFL, EQUATORIAL, NEOENERGIA, ELEKTRO, EDP → "Energia"
- Água: SABESP, SANEPAR, CEDAE, EMBASA, CAGECE, CAESB, COMPESA, CORSAN, SAAE → "Água"
- Internet/telefonia: VIVO, CLARO, TIM, OI, NET, NEXTEL, ALGAR, SKY, DIRECTV → "Internet"
- Gás: COMGAS, ULTRAGAZ, LIQUIGAS, COPAGAS → "Casa"
- Aluguel/condomínio: ALUGUEL, LOCAÇÃO, IMOBILIÁRIA, CONDOMÍNIO → "Aluguel" ou "Condomínio"

📚 Educação:
- Escolas/faculdades: COLÉGIO, ESCOLA, UNIVERSIDADE, FACULDADE, KUMON, WIZARD, CCAA, CULTURA INGLESA, FISK, ROSETTA → "Cursos"
- Cursos online: UDEMY, ALURA, COURSERA, HOTMART, ROCKETSEAT, DIO → "Cursos"

💸 Movimentações bancárias:
- PIX RECEBIDO / TED CRÉDITO / DOC CRÉDITO / DEP DINHEIRO → income "Recebimentos" (createIfMissing se não existir)
- PIX ENVIADO / TED / DOC entre contas do próprio usuário (mesma titularidade) → transfer "Entre Contas"
- PIX ENVIADO para terceiros sem contexto → expense "Pix Enviado" (createIfMissing)
- RENDIMENTOS / JUROS / CDB / TESOURO / RESGATE / DIVIDENDOS → income "Rendimentos" ou "Dividendos"
- PAGAMENTO DE FATURA / PGTO CARTÃO / BOLETO CARTÃO → transfer "Pagamento de Cartão" (createIfMissing)
- IOF / TARIFA / ANUIDADE / JUROS DE ATRASO / MULTA → expense "Tarifas Bancárias" (createIfMissing)
- SALÁRIO / PROVENTO / FOLHA / HOLERITE → income "Salário"

🧾 Impostos: IPTU, IPVA, DARF, GPS, DAS, SIMPLES NACIONAL → "IPTU" / "IPVA" / "Impostos". LICENCIAMENTO e DETRAN seguem a regra de veículo próprio → "Carro".

PROTOCOLO DE RESPOSTA:
1. Retorne SEMPRE JSON estrito: {"results":[{"index":number,"categoryName":string,"categoryKind":"income"|"expense"|"transfer","createIfMissing":boolean,"confidence":0..1,"reason":string}]}.
2. PREFIRA categorias EXISTENTES do usuário (use o nome EXATO da lista) quando fizer sentido semântico. Só marque createIfMissing=true quando nenhuma existente serve E a nova categoria é claramente útil.
3. categoryKind DEVE bater com a direção: DEBIT→expense (ou transfer), CREDIT→income (ou transfer). NUNCA income para DEBIT.
4. Retorne EXATAMENTE um item por index recebido — nunca invente nem descarte linhas.
5. Nomes de categoria em português, curtos, capitalizados (ex.: "Farmácia", "Pet Shop", "Streaming").
6. Em "reason" (máx 120 chars) explique brevemente: "COBASI = pet shop", "IFD* = iFood delivery", "APPLE.COM/BILL = assinatura Apple".
7. Confidence: 0.95+ para marcas famosas reconhecidas, 0.7-0.9 para inferência por contexto, <0.6 quando incerto.
8. Se realmente não identificar (descrição genérica tipo "COMPRA CARTÃO", "DEBITO AUTOMATICO" sem nome), use "Outros" (expense) ou "Outros (Receita)" (income) com confidence baixa.

Retorne APENAS o JSON, sem markdown, sem comentários.`;

async function callGateway(messages: any[]): Promise<OutRow[]> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY ausente");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3.5-flash",
      messages,
      temperature: 0.2,
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
