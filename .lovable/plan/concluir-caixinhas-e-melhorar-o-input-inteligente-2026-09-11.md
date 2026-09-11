# Concluir caixinhas e melhorar o Input Inteligente

## O que será alterado

- Remover das caixinhas os últimos textos, controles e cálculos de rentabilidade, mantendo somente valor bruto guardado, meta e previsão baseada nos aportes.
- Simplificar a janela de objetivo para editar apenas a meta final; reservas de emergência continuam podendo usar meses de custo de vida.
- Corrigir a leitura de datas para que um dia explicitamente informado, como “dia 8”, nunca seja substituído pelo dia padrão 5 nem pela interpretação da IA.
- Ampliar a interpretação local de datas escritas em números e por extenso, incluindo frases com várias contas e cabeçalhos que definem a data das linhas seguintes.
- Reforçar as instruções da IA e validar sua resposta antes de exibi-la, preservando valor, data, conta e instituição explicitamente escritos pelo usuário.
- Atualizar o modelo usado pela interpretação inteligente para o modelo atual recomendado, mantendo o processamento em streaming quando aplicável e o fallback local quando o serviço estiver indisponível.

## Validação

- Adicionar testes para “dia 8”, datas por extenso, mês explícito e listas com data compartilhada.
- Testar o caminho real da interpretação inteligente e conferir a mensagem retornada em caso de erro.
- Validar testes automatizados, tipos e o estado final da aplicação.

## Limites

- Os dados existentes e os lançamentos já salvos não serão alterados.
- A rentabilidade dos investimentos permanece na área de investimentos; a remoção vale apenas para as caixinhas/Meus Planos.
