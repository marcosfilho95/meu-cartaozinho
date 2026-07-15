# Financial Restructuring Plan

## Norte do produto

O produto deve ser simples, pratico e funcional. Para o MVP, o foco nao e importar todos os bancos nem criar uma suite financeira pesada. O foco e ajudar a pessoa a responder, todo dia:

- O que tenho para pagar?
- O que ja paguei?
- Quanto entrou e saiu este mes?
- Onde estou gastando mais?
- Quanto ainda posso gastar?
- O que quero reservar?

## Estrategia incremental

### Fase 0 - Auditoria

Status: concluida nesta documentacao.

Entregaveis:

- Inventario do sistema atual.
- Modelo de dados atual.
- Riscos e acoplamentos.
- Proposta de evolucao incremental.
- Verificacoes de qualidade iniciais.

### Fase 1 - MVP do organizador diario

Objetivo: tornar o que ja existe mais facil de usar no dia a dia.

Escopo sugerido:

- Criar uma visao "Hoje" ou reforcar o resumo financeiro com pendencias do dia, atrasadas e proximos vencimentos.
- Ajustar "Nova transacao" para linguagem simples: entrada, gasto, conta a pagar.
- Garantir que uma despesa pendente apareca claramente como tarefa financeira.
- Exibir acoes rapidas: marcar pago, adiar, editar, excluir.
- Conectar navegacao mobile inferior se fizer sentido.
- Corrigir textos visiveis com encoding quebrado nas telas tocadas.

Sem migrations obrigatorias nesta fase.

### Fase 2 - Modelo financeiro limpo

Objetivo: reduzir confusao entre instituicao, conta, cartao e categoria.

Migrations propostas:

- Adicionar em `transactions`:
  - `description_original text`
  - `description_normalized text`
  - `merchant_name text`
  - `external_id text`
  - `source_origin text`
  - `installment_current integer`
  - `installment_total integer`
  - `fingerprint text`
  - `metadata jsonb not null default '{}'::jsonb`
- Adicionar indices:
  - `(user_id, external_id)` parcial quando `external_id is not null`
  - `(user_id, fingerprint)` parcial quando `fingerprint is not null`
  - `(user_id, transaction_date, amount)`
- Criar `members` e `transaction_members` somente se a UI de membros entrar no MVP.
- Criar `expected_bills` quando contas previstas deixarem de ser apenas transacoes pendentes.

Regras:

- Banco/cartao deve ser conta/origem, nao categoria.
- Categoria deve representar finalidade: Moradia, Alimentacao, Transporte, Saude, Educacao, Lazer, Assinaturas, Compras etc.
- Pagamento de fatura deve poder ser transferencia/pagamento, nao nova despesa duplicada.

### Fase 3 - Recorrencias e contas previstas

Objetivo: automatizar o que se repete sem perder controle.

Escopo:

- UI para recorrencias existentes.
- Gerador de proxima conta prevista.
- Status: prevista, pendente, paga, atrasada, ignorada, cancelada.
- Sugestao de conciliacao quando uma transacao real bater com uma prevista.

Migrations provaveis:

- `expected_bills`
- campos de intervalo/media/confianca em `recurrences`, ou tabela complementar.

### Fase 4 - Importacao simples e revisada

Objetivo: importar sem gravar direto.

Escopo inicial:

- Contrato `FinancialFileParser`.
- Parser Nubank CSV.
- Tela de upload/revisao.
- Hash do arquivo e fingerprint de transacoes.
- Confirmacao antes de persistir.

Migrations:

- `imported_files`
- `imports`
- campos de origem/fingerprint em `transactions` se ainda nao aplicados.

### Fase 5 - PDFs e adaptadores

Objetivo: adicionar Mercado Pago/PicPay/C6 com fixtures anonimas e fallback manual.

Escopo:

- Parser Mercado Pago PDF textual.
- Adaptadores vazios com contrato real para bancos sem amostra.
- Testes unitarios por parser.

### Fase 6 - Qualidade e escala

Objetivo: deixar confiavel para uso pessoal real.

Escopo:

- Corrigir lint de forma incremental.
- Ampliar testes unitarios dos calculos financeiros.
- Testes e2e dos fluxos centrais.
- Code splitting do bundle.
- Revisao de seguranca de upload e logs.

## Ordem exata recomendada para implementacao

1. Documentar a auditoria e baseline de qualidade.
2. Melhorar a tela financeira principal para uso diario.
3. Simplificar o cadastro rapido de transacao/conta a pagar.
4. Corrigir navegacao mobile e textos visiveis tocados.
5. Adicionar testes para seletores financeiros e ciclo mensal.
6. Criar migration pequena para campos de importacao em `transactions`.
7. Implementar contrato de parser e Nubank CSV.
8. Criar tela de revisao de importacao.
9. Adicionar recorrencias/contas previstas.
10. Expandir importacoes por PDF quando houver amostras anonimas.

## Plano visual

- Manter fundo neutro e cards compactos.
- Priorizar informacao escaneavel em vez de hero/marketing.
- Usar no topo do financeiro uma faixa "Hoje" com:
  - vencem hoje;
  - atrasadas;
  - ja pagas no mes;
  - saldo do mes.
- Usar cards pequenos e listas densas em mobile.
- Usar graficos apenas depois dos numeros principais.
- Evitar tratar o dashboard como relatorio pesado no modo simples.

## Criterios de aceite do MVP simples

- Usuario consegue cadastrar uma despesa em menos de 30 segundos.
- Usuario consegue deixar a despesa como pendente e marcar como paga depois.
- Usuario ve atrasadas e proximos vencimentos sem procurar em varias telas.
- Usuario ve receita, despesa, pago, pendente e saldo do mes.
- Usuario consegue criar contas, categorias, orcamento e meta sem fluxo quebrado.
- Build e typecheck continuam passando.

## Pendencias reais

- Lint ja esta falhando por divida existente.
- Nao ha amostras reais anonimizadas para PDF.
- Nao ha ambiente local Supabase validado nesta auditoria.
- Testes existentes sao minimos e nao cobrem regras financeiras.
- Encoding quebrado precisa ser limpo com cuidado para nao duplicar categorias.

