# Visão do produto — organização financeira mensal

## Propósito

O produto é um organizador financeiro pessoal para quem abre o aplicativo uma vez por mês, registra o que recebeu e gastou, entende para onde o dinheiro foi e planeja objetivos como viagens, reservas e compras.

Ele deve se comportar como uma planilha financeira inteligente e acolhedora, não como uma lista diária de tarefas ou cobranças. A experiência principal precisa continuar útil mesmo sem notificações, Open Finance ou classificação perfeita por IA.

## Princípios

1. **Fechamento mensal em primeiro lugar.** O usuário deve concluir a organização do mês em poucos passos, sem precisar cadastrar cada parcela ou acompanhar pendências diariamente.
2. **Poucos dados, boa leitura.** É melhor aceitar totais consolidados confiáveis — por exemplo, “Nubank agosto R$ 5.000” — do que exigir importações detalhadas que erram com frequência.
3. **Automação previsível.** Cálculos, comparações e dicas devem ser derivados de números reais e regras determinísticas. IA pode ajudar na entrada, mas a confirmação do usuário é obrigatória.
4. **Classificação corrigível.** Toda receita ou despesa deve poder ser organizada por categoria e tipo, sem que uma classificação automática incorreta fique escondida.
5. **Planejamento com propósito.** Caixinhas representam planos concretos. O produto deve mostrar progresso, valor restante e previsão de conclusão.
6. **Sem culpa ou alarmismo.** Textos devem orientar decisões e evolução financeira, sem transformar o aplicativo em um cobrador.

## Jornada principal

O fechamento mensal é composto por quatro etapas:

1. **Receitas:** salário, outras entradas e o total mensal consolidado do Meu Cartãozinho.
2. **Gastos:** valores de faturas, contas e outras despesas, com separação entre fixas e variáveis.
3. **Planos:** revisão das caixinhas e do avanço das metas.
4. **Resultado:** receitas, despesas, saldo do mês, taxa de economia, comparação histórica e dicas baseadas nos dados.

O usuário pode adicionar um valor manualmente, descrever vários valores em texto ou enviar uma imagem. CSV e PDF permanecem disponíveis em **Importação avançada**, como alternativa e não como fluxo principal.

## Regras financeiras

- Não há parcelamento no Organizador. Uma fatura ou total informado vira um único lançamento no mês de competência.
- Despesas fixas, como aluguel e educação, podem ser repetidas nos próximos meses. O usuário pode editar valores futuros, pausar, encerrar ou ignorar somente um mês.
- Despesas variáveis são classificadas por categoria e comparadas com a meta mensal de gastos.
- O Meu Cartãozinho gera uma única receita prevista por mês, somando o valor a receber de todas as pessoas. A partir de maio/2026, cada total entra no mesmo mês no Organizador (maio em maio, julho em julho). A sincronização é idempotente e não recria os lançamentos individuais antigos.
- Indicadores e dicas usam valores reais: receitas, despesas, resultado, fixas, variáveis, percentual comprometido, taxa de economia, comparação com o mês anterior e média recente.
- Na ausência de histórico suficiente, o sistema mostra um estado vazio honesto em vez de inventar conclusões.

## Home e painel

A Home deve priorizar a visão financeira do mês, com navegação de período, quatro indicadores principais, evolução histórica, qualidade financeira, progresso dos planos e acesso aos dois módulos: Meu Cartãozinho e Organizador.

Não fazem parte da experiência principal:

- o card “Pendências”;
- a mensagem “Tudo em dia”;
- o slogan “Menos é mais”;
- uma lógica de uso diário baseada em tarefas.

## Evolução futura

Open Finance pode ser avaliado depois como uma integração opcional. Em produção, normalmente exige um provedor regulado, consentimento do usuário, segurança operacional e custo recorrente. O produto atual não deve depender disso para entregar valor.

Melhorias futuras possíveis:

- notificações mensais de fechamento;
- regras de classificação aprendidas a partir das correções do próprio usuário;
- integração Open Finance via provedor especializado;
- recomendações progressivas de redução de gastos, com metas por categoria;
- auditoria e melhoria dos parsers de CSV/PDF para bancos específicos.
