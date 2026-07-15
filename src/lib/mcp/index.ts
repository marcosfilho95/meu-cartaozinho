import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAccountsTool from "./tools/list_accounts";
import listCategoriesTool from "./tools/list_categories";
import listTransactionsTool from "./tools/list_transactions";
import createTransactionTool from "./tools/create_transaction";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "meu-cartaozinho-mcp",
  title: "Meu Cartãozinho",
  version: "0.1.0",
  instructions:
    "Ferramentas para o app de organização financeira. Use list_accounts, list_categories e list_transactions para consultar dados, e create_transaction para registrar novas transações.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listAccountsTool, listCategoriesTool, listTransactionsTool, createTransactionTool],
});