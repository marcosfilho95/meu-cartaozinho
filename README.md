# Meu Cartaozinho

Projeto simples que criei para minha noiva organizar contas de cartão de crédito, parcelas e faturas por mês.

## Objetivo

A ideia é facilitar a visualização do que foi gasto, quanto falta pagar e como dividir melhor as contas.

## Rodando localmente

```bash
npm install
npm run dev
```

## Setup de auth local (Supabase)

1. Copie `.env.example` para `.env`.
2. Preencha com os dados do mesmo projeto no Supabase Dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (chave publishable/anon completa)
3. Nao misture chave de um projeto com URL de outro (isso causa `401 Unauthorized` no login).
4. Reinicie o servidor apos alterar `.env`.
5. No Supabase Dashboard (`Authentication > URL Configuration`), inclua:
   - `Site URL`: `http://localhost:8080`
   - `Redirect URLs`: `http://localhost:8080/*` e `http://127.0.0.1:8080/*`

Se a tela de login mostrar "Falha de configuracao/conexao do Supabase", revise as variaveis acima.

## Usar no celular como app (PWA)

O projeto é instalável no celular como aplicativo, desde que esteja publicado com HTTPS.


### PASSO A PASSO

> [!NOTE]
> ### 🤖 Android (Chrome)
> 1. Abra o link da aplicação no **Chrome**.
> 2. Toque no menu de **três pontos** (canto superior direito).
> 3. Selecione `Instalar app` ou `Adicionar à tela inicial`.
> 4. Confirme em **Instalar**.

> [!NOTE]
> ### 🍎 iPhone (Safari)
> 1. Abra o link da aplicação no **Safari**.
> 2. Toque no botão de **Compartilhar** (ícone de quadrado com seta).
> 3. Role para baixo e toque em `Adicionar à Tela de Início`.
> 4. Confirme em **Adicionar**.

## Tecnologias

- React
- TypeScript
- Vite
- Tailwind CSS
- Supabase
