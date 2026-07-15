# Architecture

## Visao geral

O projeto e uma SPA React com Supabase como backend. A autenticacao acontece no cliente usando `supabase.auth`; apos sessao valida, as rotas privadas sao renderizadas em `AppRoutes`.

Arquiteturalmente existem dois dominios:

- Cartoes e parcelas: dominio original, baseado em `cards`, `purchases` e `installments`.
- Financeiro pessoal: dominio novo, baseado em `accounts`, `transactions`, `categories`, `budgets`, `goals` e `recurrences`.

O ponto de integracao principal entre eles e `syncAllCardPurchasesToFinance`, chamado dentro de `FinanceLayout`.

## Camadas

### Entrada da aplicacao

- `src/main.tsx`: inicializa tema, renderiza React e registra/desregistra service worker.
- `src/App.tsx`: providers globais, router, auth guard e definicao de rotas.

### Paginas

- `src/pages/*`: telas do dominio original e perfil/auth.
- `src/pages/finance/*`: telas do organizador financeiro.

### Componentes

- `src/components/ui/*`: base shadcn/Radix.
- `src/components/*`: componentes de cartoes, header, footer, avatar e dialogs.
- `src/components/finance/*`: componentes especificos do modulo financeiro.

### Bibliotecas de dominio

- `src/lib/installments.ts`: regras de parcelas/faturas do modulo original.
- `src/lib/financeShared.ts`: tipos e seletores auxiliares de transacoes financeiras.
- `src/lib/financeSelectors.ts`: agregacoes para dashboard.
- `src/lib/financeDefaults.ts`: contas padrao.
- `src/lib/financeCategoryDefaults.ts`: categorias padrao e reparo de encoding/duplicidades.
- `src/lib/financeGoalDefaults.ts`: metas padrao.
- `src/lib/financeCardSync.ts`: sincronizacao de compras/cartoes para transacoes.
- `src/lib/*Cache.ts`: caches locais por usuario/tela.

### Dados

- `src/integrations/supabase/client.ts`: cliente Supabase.
- `src/integrations/supabase/types.ts`: tipos gerados do banco.
- `supabase/migrations/*`: schema, funcoes, RLS, indices e ajustes incrementais.

## Fluxo de autenticacao

1. `AppRoutes` registra `onAuthStateChange`.
2. `getSession()` carrega a sessao inicial.
3. Sem sessao, renderiza `Auth`.
4. Com sessao, renderiza rotas privadas.
5. Links de recuperacao redirecionam para `/reset-password`.

## Fluxo financeiro atual

1. Usuario entra em `/financas`.
2. `FinanceLayout` carrega header/nav e chama sincronizacao das compras antigas.
3. `FinanceDashboard` garante contas/categorias/metas padrao.
4. Transacoes sao buscadas por `fetchFinanceTransactions`.
5. Seletores calculam receitas, despesas, pendencias, categorias e historico.
6. Dialog `AddTransactionDialog` grava em `transactions` e atualiza saldo se status for pago.
7. Listas e dashboard escutam evento `finance-sync-updated` para recarregar.

## Fluxo de cartoes atual

1. Usuario cria cartao em `AddCardDialog`.
2. Usuario cria compra em `AddPurchaseDialog`.
3. A compra gera linhas em `installments`.
4. Dashboard de cartoes agrupa parcelas por mes/ciclo.
5. Detalhe de cartao permite acompanhar status de parcelas.
6. Financeiro tenta refletir esses dados como transacoes.

## Regras importantes

- `user_id` e obrigatorio para isolamento de dados.
- RLS esta habilitado nas tabelas privadas principais.
- Dinheiro e `NUMERIC` no banco.
- Datas mensais usam chaves `YYYY-MM` em alguns pontos (`ref_month`, `start_month`).
- Algumas funcoes calculam ciclo de fatura a partir de dia de vencimento.
- `deleted_at` em `transactions` indica soft delete.

## Riscos arquiteturais

- Logica financeira espalhada entre paginas, dialogs e libs.
- Tipos Supabase existem, mas muitos componentes usam `any`.
- Cliente executa bootstrap de dados padrao; triggers antigas tambem criam categorias.
- Encoding quebrado em seeds pode criar duplicidades sem normalizacao.
- Falta camada explicita para importacao/revisao de arquivos.
- Falta representacao de fatura de cartao como entidade propria no modulo financeiro novo.

## Direcao alvo

Para manter simplicidade:

- Concentrar regra financeira em `src/lib/finance/*` gradualmente.
- Manter UI simples em paginas, chamando funcoes de dominio testaveis.
- Usar `transactions` como livro-caixa consolidado.
- Manter `cards/purchases/installments` ate migracao segura ou convivencia estavel.
- Criar importacao em pipeline separado antes de tocar no banco final.
- Adicionar tabelas novas apenas quando a UI precisar delas.

