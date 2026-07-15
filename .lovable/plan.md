# Redesign do Organizador Financeiro + Importação Inteligente

Escopo grande. Vou entregar em **4 fases sequenciais**, cada uma revisável de forma isolada. Nada quebra o que já funciona (Nubank CSV, Mercado Pago PDF, rotas atuais).

## Fase 1 — Fundação de design "financeira premium"

Objetivo: dar cara clean, calma e densa ao módulo `/financas` sem tocar em lógica.

- Novo design system escopado ao módulo (não afeta Meu Cartãozinho):
  - Fundo neutro quase-branco (dark mode: grafite frio).
  - Cards planos, borda 1px `border/40`, sombra quase nula, radius consistente.
  - Tipografia numérica tabular (`font-variant-numeric: tabular-nums`) para todos os valores.
  - Paleta com propósito: verde `emerald` para entradas, vermelho `rose` contido para saídas, grafite/azul para neutro, âmbar só para alertas.
  - Remoção de gradientes decorativos e "cards coloridos" do dashboard atual.
- `FinanceTopNav` e `FinanceBottomNav` reorganizados na ordem: **Resumo · Transações · Importar · Contas · Categorias · Planejamento · Relatórios**. "Importar" ganha destaque no bottom nav.
- `FinanceDashboard` reescrito com hierarquia clara:
  1. Header do mês (saldo do mês, entradas, saídas, resultado) — tipografia grande, sem cards coloridos.
  2. Ações primárias: **Importar extrato** e **Novo lançamento**.
  3. Próximas contas (7 dias).
  4. Maiores categorias do mês (barra horizontal enxuta).
  5. Evolução dos últimos 6 meses (mini-gráfico linha).
  6. Alertas (só aparece se houver algo).

## Fase 2 — Arquitetura de parsers extensível

Objetivo: preparar o terreno para novos bancos sem reescrever nada.

- `src/lib/finance/imports/registry.ts`: registro central de parsers, escolhe o melhor por confiança combinada (`fileName + mime + headers + keywords + padrões de data/valor`).
- Novos parsers plugáveis:
  - `genericCsvParser` (heurística de colunas: data/descrição/valor).
  - `genericTextParser` (linhas com data + valor no fim, para colar texto).
  - `nubankPdfParser` (fatura, se PDF tiver texto).
- Reforço no detector existente do Mercado Pago e Nubank CSV (mantém comportamento).
- Estrutura `ParserRegistry.register(parser)` deixa slot pronto para OFX/XLSX depois.
- Sugestão automática de **conta** a partir do parser:
  - Nubank CSV/PDF fatura → conta cartão Nubank.
  - Mercado Pago → conta Mercado Pago.
  - Se não existir, o resumo oferece "Criar conta X" em 1 clique.

## Fase 3 — Nova tela de Importação (didática)

Objetivo: usuário perde o mínimo de tempo, entende tudo.

Fluxo em 3 passos numerados numa mesma página:

**1. Enviar** — dropzone grande, aceita CSV/PDF/texto colado. Tabs "Arquivo" · "Colar texto".

**2. Analisar** — feedback ao vivo:
- Instituição detectada · Formato · Tipo de documento · Confiança.
- Resumo em cards discretos: total de linhas, entradas, saídas, possíveis duplicidades, transferências internas, conta sugerida.
- Erros didáticos com título + explicação + ação sugerida:
  - "Não consegui ler este PDF" · "Parece ser imagem/escaneado" · "Tente CSV ou cole o texto".
  - Botão "Ver texto extraído" (diagnóstico) quando disponível.

**3. Revisar e confirmar** — tabela densa e escaneável:
- Colunas: descrição limpa (com original em cinza abaixo), data, valor, categoria, conta, status, confiança, badges de duplicidade/transferência.
- Duplicidades **desmarcadas** por padrão; transferências destacadas em azul.
- Seleção múltipla + barra de ações em massa: aplicar categoria, aplicar conta, ignorar, confirmar selecionadas.
- Editar categoria abre popover com opção **"Aplicar para próximas compras deste estabelecimento"** (cria regra).

## Fase 4 — Classificação inteligente + aprendizado

Objetivo: acertar categoria sozinho na maior parte das vezes.

- Nova tabela `categorization_rules` (user_id, pattern, match_type, category_id) com RLS por usuário.
- Motor de classificação em camadas, nesta ordem:
  1. Regras aprendidas do usuário (`categorization_rules`).
  2. Histórico: mesma descrição normalizada já categorizada antes → usa a mesma categoria.
  3. Regras locais por palavras-chave (expandidas: iFood, Domino's, Uber, Enel, Cagece, Netflix, Spotify, Farmácia, Drogaria, postos, etc.).
  4. Fallback "Outros".
- Ao alterar categoria na revisão, oferece silenciosamente criar regra para o `merchantName` normalizado.
- Arquitetura preparada para um agente opcional (interface `CategoryClassifier` — implementação local por padrão, gancho para IA no futuro).

## Fora do escopo desta entrega

- Agente IA de importação em produção (só a interface pronta).
- Suporte real a OFX/XLSX (só o slot no registry).
- Onboarding tutorial guiado (microcopy sim, tour não).
- Mudanças no módulo Meu Cartãozinho — permanece intocado.

## Detalhes técnicos

- Nenhuma alteração em migrations existentes; apenas **1 nova migration** (`categorization_rules` + índices + RLS + GRANTs).
- Nenhuma quebra de rotas: `/financas/importacoes` continua o entry point, apenas com nova UI/UX interna.
- `FinanceDashboard`, `FinanceTopNav`, `FinanceBottomNav`, `ImportsPage` são reescritos; demais páginas ganham só ajuste de tokens visuais.
- Design tokens ficam em `src/index.css` (novas variáveis com prefixo `--finance-*`) e classes utilitárias em Tailwind — sem cores hardcoded nos componentes.
- Tudo TypeScript, sem dependências novas.

Confirma que posso seguir com as 4 fases nessa ordem? Se quiser começar só por uma (ex.: só Fase 3 — importação), me diz que ajusto.