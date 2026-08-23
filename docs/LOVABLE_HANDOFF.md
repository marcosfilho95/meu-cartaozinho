# Handoff — Organizador financeiro mensal

## Estado desta implementação

O handoff do Lovable foi continuado localmente. A experiência principal foi redesenhada para o uso mensal descrito em `PRODUCT_VISION.md`.

### Concluído

- Home redesenhada, sem “Pendências”, “Tudo em dia” ou “Menos é mais”.
- Cabeçalho de visão financeira com navegação entre meses.
- Indicadores reais de receitas, despesas, resultado e taxa de economia.
- Evolução dos últimos seis meses e cards dos módulos com dados reais.
- Painel `/financas` redesenhado com visão mensal, orçamento, categorias, fixas versus variáveis, evolução e projeção de planos.
- Fluxo `/financas/fechamento` em quatro etapas: receitas, gastos, planos e resultado.
- Entrada principal simplificada para valor manual, texto ou print.
- Importação de CSV/PDF preservada como “Importação avançada”.
- Parcelas removidas do Organizador; cada total informado gera um único lançamento.
- Despesas fixas copiáveis entre meses, com edição dos próximos meses, pausa, encerramento e opção de ignorar somente o mês atual.
- Meta mensal de gastos exibida com progresso e comparação.
- Caixinhas mantidas e enriquecidas com progresso, valor restante e previsão de conclusão.
- Meu Cartãozinho sincronizado como uma única receita prevista mensal e idempotente.
- Regra de recebimento aplicada a partir de maio/2026: o saldo de cada mês do Cartãozinho entra como receita no Organizador dois meses depois.
- Opção de cartão Amazon Prime adicionada com marca visual própria.
- Motor determinístico de indicadores e dicas conectado às telas.
- Testes do motor financeiro e da agregação do Cartãozinho adicionados.

## Arquivos centrais

- `src/pages/Home.tsx` — Home mensal.
- `src/pages/finance/FinanceDashboard.tsx` — painel e gráficos.
- `src/pages/finance/MonthlyClosingPage.tsx` — fechamento guiado.
- `src/components/finance/AddTransactionDialog.tsx` — entrada manual.
- `src/components/finance/SmartAddDialog.tsx` — texto e print com revisão.
- `src/pages/finance/RecurrencesPage.tsx` — despesas fixas.
- `src/lib/financeInsights.ts` — cálculos e insights determinísticos.
- `src/lib/finance/cartaozinhoSync.ts` — agregação mensal do Meu Cartãozinho.
- `src/lib/finance/fixedBills.ts` — geração e fechamento das despesas fixas.
- `src/assets/banks/amazon-prime.png` — ícone do Amazon Prime.

## Banco de dados

Foi criada a migration:

`supabase/migrations/20260823150000_ensure_monthly_sync_idempotency.sql`

Ela protege a sincronização mensal contra duplicatas usando índices únicos parciais para os identificadores externos do Meu Cartãozinho e das despesas fixas.

A migration foi aplicada e verificada no projeto Supabase oficial configurado no repositório (`udqadiqnallwsdqqnuji`). O índice `idx_transactions_monthly_automation_unique` está ativo.

O `.env` local aponta para outro projeto (`bockojhtmjrtfvkgfocf`), que não está disponível na conta Supabase conectada. Esse ambiente não foi alterado; antes de usá-lo em produção, é necessário confirmar qual projeto deve fornecer os dados do aplicativo.

A migration `20260823170000_shift_cartaozinho_income_by_two_months.sql` também foi aplicada ao projeto oficial para corrigir lançamentos automáticos existentes. No ambiente alternativo, o próprio sincronizador faz a mesma correção ao abrir o Organizador.

## Validação executada

- Typecheck completo sem erros.
- Build de produção concluído.
- 109 testes automatizados aprovados.
- ESLint dos arquivos alterados sem erros bloqueantes. Permanecem avisos de tipagem `any` já presentes em componentes antigos e avisos não bloqueantes do bundle.

## O que ainda exige ação manual

1. Confirmar se o ambiente publicado usa o projeto Supabase oficial do repositório ou o projeto alternativo presente no `.env` local.
2. Fazer uma revisão visual navegando pela Home, painel, fechamento e telas responsivas. A automação visual não pôde ser executada porque não havia um navegador conectado à sessão local.
3. Se desejado, cadastrar/confirmar no banco as categorias usadas pelos fluxos — especialmente “Meu Cartãozinho” — em ambientes com dados diferentes.

## Fora do escopo desta rodada

- Open Finance: não foi integrado. Recomenda-se avaliar provedor, custos, LGPD, consentimento e requisitos regulatórios antes de implementar.
- Reescrita dos parsers de CSV/PDF: a funcionalidade existente foi mantida como avançada; casos específicos de bancos devem ser tratados depois com amostras reais anonimizadas.
- Notificações: não foram adicionadas, pois o produto foi orientado ao fechamento mensal sob demanda.
- Classificação autônoma por IA: a IA continua como ajuda de entrada e revisão; os insights financeiros são determinísticos para evitar recomendações inventadas.

## Critério de aceite sugerido

Com um usuário autenticado e dados de teste:

1. abrir um mês na Home;
2. entrar em “Fechar mês”;
3. adicionar uma receita e uma despesa por valor manual;
4. adicionar dados por texto ou print e revisar antes de salvar;
5. confirmar uma despesa fixa do mês;
6. validar que o Meu Cartãozinho aparece uma única vez como receita prevista;
7. concluir o fechamento e conferir os mesmos totais no painel;
8. voltar ao mês anterior e confirmar que os indicadores mudam com o período.
