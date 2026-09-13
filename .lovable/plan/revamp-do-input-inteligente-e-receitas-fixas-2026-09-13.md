# Revamp do input inteligente e receitas fixas

## O que será entregue

- Transformar “Adicionar Inteligente” em uma conversa única, simples e guiada: o usuário escreve, fala ou envia uma imagem; o assistente identifica o lançamento, pergunta apenas o que estiver faltando e mostra uma confirmação editável antes de salvar.
- Salvar a conversa na conta do usuário, restaurando o histórico entre aparelhos, com opção clara para iniciar uma nova conversa sem apagar lançamentos já feitos.
- Manter a conferência atual em formato organizado, permitindo corrigir data, tipo, conta, categoria, valor e recorrência sem redigitar a mensagem original.
- Corrigir receitas fixas para criar a recorrência mensal e o lançamento atual como receita, com vencimento/data preservados e sem duplicar meses futuros.
- Reforçar a identificação de “receita fixa”, “salário mensal”, “todo mês” e equivalentes, pedindo confirmação quando a recorrência estiver ambígua.
- Aplicar um refinamento visual robusto ao fluxo inteligente: mensagens legíveis, resposta sem bolha pesada, ações compactas, voz/imagem integradas e bom uso em celular e computador, seguindo a identidade esmeralda atual.

## Persistência e segurança

- Criar armazenamento próprio da conversa no banco, vinculado ao usuário e protegido para que cada pessoa acesse apenas o próprio histórico.
- Não guardar imagens completas no histórico da conversa; registrar somente uma referência textual segura ao conteúdo processado.
- Preservar todos os lançamentos e dados existentes.

## Validação

- Testar despesa fixa e receita fixa, incluindo salário mensal com dia explícito.
- Testar conversa com informação incompleta, correção no resumo, restauração do histórico e início de nova conversa.
- Validar o fluxo real no celular e no computador, além dos testes e do estado final da aplicação.
