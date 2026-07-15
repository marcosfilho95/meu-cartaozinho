# Current State

Data da auditoria: 2026-07-15

## Resumo

O projeto "Meu Cartaozinho" ja e uma aplicacao React/Vite autenticada com Supabase. A base original controla cartoes, compras parceladas e faturas mensais. Sobre ela ja existe um modulo financeiro em `/financas` com contas, categorias, transacoes, orcamento, metas e dashboard com graficos.

A direcao mais segura para um produto simples e funcional e consolidar o modulo financeiro existente como o organizador do dia a dia, mantendo o modulo de cartoes e melhorando a experiencia de entrada rapida, pendencias, recorrencias e acompanhamento mensal.

## Stack atual

- Frontend: React 18, TypeScript, Vite.
- UI: Tailwind CSS, shadcn/Radix UI, lucide-react.
- Estado e cache: React state, TanStack Query em alguns fluxos, cache local por `localStorage`.
- Graficos: Recharts.
- Backend/dados: Supabase Auth, Postgres, RLS, migrations SQL.
- Testes: Vitest + Testing Library.
- PWA: manifest e service worker em `public/`.

## Rotas e funcionalidades existentes

- `/`: Home autenticada com resumo rapido e atalhos para "Meu Cartaozinho" e "Organizador Financeiro".
- `/cards`: dashboard de cartoes, total mensal, distribuicao por cartao e lista de cartoes.
- `/cartao/:cardId`: detalhe de cartao e parcelas.
- `/compras`: compras/ordens parceladas.
- `/perfil`: perfil do usuario, avatar e dados basicos.
- `/financas`: dashboard financeiro com modo simples/completo.
- `/financas/transacoes`: lista de transacoes por ciclo de fatura ou calendario, busca, filtros e marcar como pago.
- `/financas/contas`: cadastro/edicao/remocao de contas.
- `/financas/categorias`: cadastro/edicao/remocao de categorias.
- `/financas/orcamento`: orcamento mensal por categoria.
- `/reset-password`: recuperacao de senha.

## Componentes reutilizaveis

- Layout/navegacao: `AppHeader`, `AppFooter`, `NavLink`, `FinanceLayout`, `FinanceTopNav`, `FinanceBottomNav`.
- Cartoes: `AddCardDialog`, `AddPurchaseDialog`, `CardSummary`, `InstallmentList`, `PurchaseNotificationsPopover`, `BankLogo`.
- Financeiro: `QuickTransactionFab`, `AddTransactionDialog`, `GoalsSection`, `AddGoalDialog`, `ExpenseDistributionBar`, `CategoryTable`.
- UI base: componentes shadcn em `src/components/ui/*`.
- Hooks: `useUserHeaderProfile`, `useFinanceRouteTransition`, `useMobile`, `useToast`.

## Modelo de banco atual

### Autenticacao e perfil

- `profiles`: dados do usuario, email, nome, username e avatar.

### Modulo original de cartoes

- `cards`: cartoes do usuario, bandeira/banco, cor e dia de vencimento padrao.
- `purchases`: compras parceladas por cartao, descricao, valor total, parcelas, mes inicial, pessoa e observacoes.
- `installments`: parcelas geradas por compra/cartao, mes de referencia, valor, status e data de pagamento.
- `card_subgroups`: grupos/subgrupos de cartoes/compras criados em migration posterior.

### Modulo financeiro

- `accounts`: contas, carteiras, poupancas, cartoes de credito, investimentos e emprestimos.
- `categories`: categorias por tipo (`income`, `expense`, `transfer`) com hierarquia por `parent_id`.
- `payees`: favorecidos/pagadores, ainda pouco explorado na UI.
- `transactions`: transacoes financeiras com conta, categoria, status, vencimento, tipo, recorrencia, flags de revisao/conciliacao e soft delete.
- `recurrences`: modelos recorrentes com frequencia e payload.
- `budgets`: orcamento mensal por categoria.
- `goals`: metas financeiras.
- `goal_transactions`: historico de reserva/retirada de metas.
- `tags` e `transaction_tags`: etiquetas.
- `attachments`: anexos de transacoes.
- `monthly_surplus_allocations`: alocacao de sobra mensal.

## Regras de negocio existentes

- Todos os dados privados relevantes possuem `user_id` e RLS por `auth.uid() = user_id`.
- Valores financeiros usam `NUMERIC` no banco.
- Compras parceladas geram parcelas mensais em `installments`.
- O modulo financeiro sincroniza compras do "Meu Cartaozinho" para transacoes via `syncAllCardPurchasesToFinance`.
- Dashboard financeiro usa ciclo dinamico para despesas de cartao com base em dia de vencimento.
- Transacoes podem ser `pending`, `paid`, `overdue` ou `canceled`.
- Ao marcar transacao como paga/pendente, o saldo da conta e ajustado.
- Categorias padrao sao criadas/garantidas no cliente e tambem existem triggers SQL antigas.
- Metas reservam saldo a partir de uma conta principal e gravam movimentacoes em `goal_transactions`.
- Orçamento compara limite planejado com gastos reais por categoria no mes.

## Estado das verificacoes

- `npm run test`: passou, 1 teste.
- `npx tsc -p tsconfig.app.json --noEmit`: passou.
- `npm run build`: passou, com aviso de bundle grande e Browserslist desatualizado.
- `npm run lint`: falhou antes de qualquer alteracao desta auditoria.

Principais causas do lint:

- Uso amplo de `any` em paginas e componentes.
- Interfaces vazias em componentes shadcn (`command.tsx`, `textarea.tsx`).
- `require()` em `tailwind.config.ts`.
- Warnings de Fast Refresh em componentes que exportam utilitarios.
- Hooks com dependencias faltando/extras.

## Pontos de acoplamento e riscos

- Ha dois modelos financeiros coexistindo: `cards/purchases/installments` e `accounts/transactions`. A sincronizacao precisa continuar preservando dados antigos.
- Alguns textos e seeds estao com encoding quebrado (`CartÃ£o`, `OrÃ§amento`, etc.), afetando UX e dados padrao.
- `AddTransactionDialog` cria categoria de banco/cartao automaticamente para pagamentos no credito, o que conflita com a regra de nao tratar instituicao financeira como categoria final.
- `accounts` mistura contas reais com nomes de categorias/sacos de dinheiro sugeridos por padrao (`Casa`, `Escola`, `Alimentacao`), o que pode confundir conta com centro de custo.
- Falta central de importacao e modelo de arquivos importados.
- Recorrencias existem no banco, mas ainda nao ha fluxo robusto de geracao/conciliacao de contas previstas.
- `transactions` ainda nao tem campos suficientes para importacao estruturada: identificador externo, descricao original, estabelecimento, parcelas, fingerprint, origem de arquivo e metadados.
- Exclusao de conta e categoria pode afetar dados vinculados; alguns fluxos usam confirm nativo.
- Bundle JS grande para mobile.

## O que manter

- Autenticacao Supabase e RLS.
- Modulo original de cartoes e parcelas.
- Rotas financeiras ja criadas.
- Componentes shadcn/Radix e tokens Tailwind existentes.
- Recharts para graficos.
- `transactions`, `accounts`, `categories`, `budgets`, `goals` como fundacao.
- Sincronizacao de compras antigas para o financeiro, com testes antes de expandir.

## O que refatorar

- Textos com encoding quebrado.
- Tipagem de dados Supabase e reducao de `any`.
- Separacao visual e conceitual entre conta, cartao, categoria e forma de pagamento.
- Dialog de nova transacao para virar um fluxo mais simples de "receita, despesa, conta a pagar".
- Navegacao financeira para priorizar uso diario: Hoje/Resumo, Transacoes, Contas, Orcamento.
- Ajuste de categorias padrao para categorias reais, nao instituicoes.

## O que substituir

- Confirmacoes nativas por dialogs consistentes.
- Seeds/client defaults que criam contas com nomes de categorias.
- Categorias automaticas por banco/cartao por uma origem/conta/cartao separada.

## O que remover apenas depois de verificar uso

- Componentes nao usados ou duplicados de tabela/distribuicao financeira.
- `FinanceBottomNav`, se nao for conectado ao layout mobile.
- Caches locais antigos se TanStack Query cobrir o fluxo.
- Categorias de banco criadas por versoes anteriores, somente com migration segura e reassociacao.

