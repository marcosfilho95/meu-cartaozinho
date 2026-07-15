import React, { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowRightLeft,
  ArrowUpCircle,
  CheckCircle2,
  ClipboardPaste,
  FileText,
  Info,
  Loader2,
  ShieldAlert,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage, untypedSupabase } from "@/lib/supabaseUntyped";
import { formatCurrency } from "@/lib/constants";
import { ensureDefaultAccounts } from "@/lib/financeDefaults";
import { ensureDefaultCategories } from "@/lib/financeCategoryDefaults";
import {
  FinancialDocumentType,
  FinancialFileFormat,
  InstitutionCode,
  NormalizedTransaction,
  getFileHash,
  parseFinancialFile,
  readFileAsText,
  sha256Hex,
} from "@/lib/finance/imports";
import { LocalCategoryClassifier } from "@/lib/finance/imports/classifier";
import { normalizeLabel } from "@/lib/financeShared";
import { cn } from "@/lib/utils";

interface ImportsPageProps {
  userId: string;
}

type AccountOption = {
  id: string;
  name: string;
  type: string;
  institution?: string | null;
};

type CategoryOption = {
  id: string;
  name: string;
  kind: "income" | "expense" | "transfer";
  parent_id?: string | null;
};

type CategorizationRule = {
  id: string;
  category_id: string | null;
  match_type: "contains" | "starts_with" | "equals" | "regex";
  pattern: string;
  direction?: "CREDIT" | "DEBIT" | null;
  priority: number;
  is_active: boolean;
};

type ExistingTx = {
  id: string;
  external_id?: string | null;
  fingerprint?: string | null;
  amount: number;
  transaction_date: string;
  source?: string | null;
  type: "income" | "expense" | "transfer";
};

type ReviewRow = NormalizedTransaction & {
  localId: string;
  selected: boolean;
  accountId: string;
  categoryId: string;
  status: "paid" | "pending";
};

const INSTITUTION_LABEL: Record<InstitutionCode, string> = {
  UNKNOWN: "Detectando…",
  NUBANK: "Nubank",
  MERCADO_PAGO: "Mercado Pago",
  PICPAY: "PicPay",
  C6: "C6",
};

const DOCUMENT_LABEL: Record<FinancialDocumentType, string> = {
  UNKNOWN: "Documento genérico",
  BANK_STATEMENT: "Extrato bancário",
  CREDIT_CARD_STATEMENT: "Fatura do cartão",
};

const FORMAT_LABEL: Record<FinancialFileFormat, string> = {
  UNKNOWN: "—",
  CSV: "CSV",
  OFX: "OFX",
  XLSX: "XLSX",
  PDF_TEXT: "PDF (texto)",
  TXT: "Texto",
};

const normalizeCategoryName = (value: string) => normalizeLabel(value).replace(/\s+/g, " ");
const normalizeRulePattern = (value: string) => normalizeLabel(value).replace(/\s+/g, " ").trim();

const transactionTypeFromRow = (row: NormalizedTransaction): "income" | "expense" | "transfer" => {
  if (row.possibleInternalTransfer) return "transfer";
  return row.direction === "CREDIT" ? "income" : "expense";
};

const rowIcon = (row: NormalizedTransaction) => {
  if (row.possibleInternalTransfer) return ArrowRightLeft;
  return row.direction === "CREDIT" ? ArrowUpCircle : ArrowDownCircle;
};

const rowAmountClass = (row: NormalizedTransaction) => {
  if (row.possibleInternalTransfer) return "text-primary";
  return row.direction === "CREDIT" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
};

const resolveSuggestedCategoryId = (row: NormalizedTransaction, categories: CategoryOption[]) => {
  const type = transactionTypeFromRow(row);
  const target = normalizeCategoryName(row.categorySuggestion || "");
  if (!target) return "";
  const byExact = categories.find((c) => c.kind === type && normalizeCategoryName(c.name) === target);
  if (byExact) return byExact.id;
  const byContains = categories.find((c) => {
    if (c.kind !== type) return false;
    const n = normalizeCategoryName(c.name);
    return n.includes(target) || target.includes(n);
  });
  return byContains?.id || "";
};

const ruleMatchesRow = (rule: CategorizationRule, row: NormalizedTransaction) => {
  if (rule.direction && rule.direction !== row.direction) return false;
  const haystack = normalizeRulePattern(`${row.descriptionNormalized} ${row.descriptionOriginal} ${row.merchantName || ""}`);
  const pattern = normalizeRulePattern(rule.pattern);
  if (!pattern) return false;
  if (rule.match_type === "equals") return haystack === pattern;
  if (rule.match_type === "starts_with") return haystack.startsWith(pattern);
  if (rule.match_type === "regex") {
    try {
      return new RegExp(rule.pattern, "i").test(`${row.descriptionNormalized} ${row.descriptionOriginal} ${row.merchantName || ""}`);
    } catch {
      return false;
    }
  }
  return haystack.includes(pattern);
};

const resolveSmartCategoryId = (
  row: NormalizedTransaction,
  categories: CategoryOption[],
  rules: CategorizationRule[],
  history: Array<{ description: string; merchantName?: string | null; category_id: string | null; direction?: "CREDIT" | "DEBIT" | null }> = [],
) => {
  const classifier = new LocalCategoryClassifier(categories as any, rules as any, history);
  const result = classifier.classify(row);
  return result.categoryId || resolveSuggestedCategoryId(row, categories);
};

const resolveDefaultAccountId = (row: NormalizedTransaction, accounts: AccountOption[]) => {
  const institution = normalizeLabel(row.institution.replace("_", " "));
  const byInstitution = accounts.find((a) => normalizeLabel(`${a.institution || ""} ${a.name}`).includes(institution));
  if (byInstitution) return byInstitution.id;
  if (row.sourceType === "CREDIT_CARD") {
    return accounts.find((a) => a.type === "credit_card")?.id || accounts[0]?.id || "";
  }
  return accounts.find((a) => a.type !== "credit_card")?.id || accounts[0]?.id || "";
};

const buildDidacticError = (raw: string, hadText: boolean): { title: string; body: string; hint: string } => {
  const msg = raw.toLowerCase();
  if (msg.includes("pdf") || msg.includes("imagem") || (!hadText && msg.includes("reconhec"))) {
    return {
      title: "Não consegui ler este PDF",
      body: "Provavelmente é uma imagem ou escaneamento — o texto não pode ser selecionado.",
      hint: "Tente exportar em CSV pelo app do banco, ou copie o texto do extrato e cole na aba 'Colar texto'.",
    };
  }
  if (msg.includes("csv") || msg.includes("coluna")) {
    return {
      title: "CSV não reconhecido",
      body: raw,
      hint: "Verifique se o arquivo tem colunas de data, descrição e valor. O padrão Nubank é `date,title,amount`.",
    };
  }
  return {
    title: "Não consegui ler este arquivo",
    body: raw,
    hint: "Tente outro formato (CSV do banco) ou cole o texto do extrato manualmente.",
  };
};

const ImportsPage: React.FC<ImportsPageProps> = ({ userId }) => {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categorizationRules, setCategorizationRules] = useState<CategorizationRule[]>([]);
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [mimeType, setMimeType] = useState("");
  const [fileText, setFileText] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parseError, setParseError] = useState<{ title: string; body: string; hint: string } | null>(null);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [parsedInfo, setParsedInfo] = useState<{
    parserName: string;
    institution: InstitutionCode;
    documentType: FinancialDocumentType;
    format: FinancialFileFormat;
    confidence: number;
    reason: string;
    warnings: string[];
  } | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [creatingAccount, setCreatingAccount] = useState(false);

  const loadSupportData = useCallback(async () => {
    await Promise.all([ensureDefaultAccounts(userId), ensureDefaultCategories(userId)]);
    const [accountsRes, categoriesRes, rulesRes] = await Promise.all([
      supabase.from("accounts").select("id, name, type, institution").eq("user_id", userId).eq("is_active", true).order("name"),
      supabase.from("categories").select("id, name, kind, parent_id").eq("user_id", userId).order("name"),
      untypedSupabase
        .from("categorization_rules")
        .select("id, category_id, match_type, pattern, direction, priority, is_active")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("priority"),
    ]);
    const nextAccounts = (accountsRes.data || []) as AccountOption[];
    const nextCategories = (categoriesRes.data || []) as CategoryOption[];
    const nextRules = (rulesRes.data || []) as CategorizationRule[];
    setAccounts(nextAccounts);
    setCategories(nextCategories);
    setCategorizationRules(nextRules);
    return { nextAccounts, nextCategories, nextRules };
  }, [userId]);

  const fetchExistingForDedup = useCallback(async (): Promise<ExistingTx[]> => {
    const full = await untypedSupabase
      .from("transactions")
      .select("id, external_id, fingerprint, amount, transaction_date, source, type, category_id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(5000);
    if (!full.error) return (full.data || []) as ExistingTx[];
    return [];
  }, [userId]);

  const processText = async (input: { name: string; text: string; hash: string; size: number | null; mime: string }) => {
    setLoading(true);
    setRows([]);
    setParsedInfo(null);
    setParseError(null);
    setShowDiagnostic(false);

    try {
      const [{ nextAccounts, nextCategories, nextRules }, existing] = await Promise.all([loadSupportData(), fetchExistingForDedup()]);
      setFileName(input.name);
      setMimeType(input.mime);
      setFileSize(input.size);
      setFileHash(input.hash);
      setFileText(input.text);

      const parsed = await parseFinancialFile(
        {
          fileName: input.name,
          mimeType: input.mime,
          fileText: input.text,
          fileHash: input.hash,
          manualInstitution: "UNKNOWN",
          manualDocumentType: "UNKNOWN",
          manualFormat: "UNKNOWN",
        },
        existing,
      );

      const reviewRows = parsed.transactions.map((row, index) => ({
        ...row,
        localId: `${row.fingerprint}-${index}`,
        selected: !row.possibleDuplicate,
        accountId: resolveDefaultAccountId(row, nextAccounts),
        categoryId: resolveSmartCategoryId(
          row,
          nextCategories,
          nextRules,
          existing.map((tx) => ({
            description: tx.source || "",
            merchantName: tx.source || "",
            category_id: (tx as any).category_id ?? null,
            direction: tx.type === "income" ? "CREDIT" : tx.type === "expense" ? "DEBIT" : null,
          })),
        ),
        status: "paid" as const,
      }));

      setRows(reviewRows);
      setParsedInfo({
        parserName: parsed.parserName,
        institution: parsed.detection.institution,
        documentType: parsed.detection.documentType,
        format: parsed.detection.format,
        confidence: parsed.detection.confidence,
        reason: parsed.detection.reason,
        warnings: parsed.warnings,
      });

      if (reviewRows.length > 0) {
        toast.success(`${reviewRows.length} movimentações prontas para revisão.`);
      } else {
        toast.warning("Arquivo lido, mas nenhuma movimentação foi extraída.");
      }
    } catch (error) {
      const msg = getErrorMessage(error, "Falha ao importar arquivo.");
      setParseError(buildDidacticError(msg, Boolean(input.text?.length)));
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    try {
      const [text, hash] = await Promise.all([readFileAsText(file), getFileHash(file)]);
      await processText({ name: file.name, text, hash, size: file.size, mime: file.type || "text/plain" });
    } catch (error) {
      const msg = getErrorMessage(error, "Falha ao ler arquivo.");
      setParseError(buildDidacticError(msg, false));
    }
  };

  const handlePastedText = async () => {
    const text = pastedText.trim();
    if (!text) {
      toast.error("Cole o texto do extrato antes de processar.");
      return;
    }
    await processText({
      name: "extrato-colado.txt",
      text,
      hash: await sha256Hex(text),
      size: text.length,
      mime: "text/plain",
    });
  };

  const selectedRows = useMemo(() => rows.filter((r) => r.selected), [rows]);

  const suggestedAccountName = useMemo(() => {
    if (!parsedInfo) return "";
    const institution = parsedInfo.institution;
    if (institution === "UNKNOWN") return "";
    const label = INSTITUTION_LABEL[institution];
    const isCard = parsedInfo.documentType === "CREDIT_CARD_STATEMENT";
    return isCard ? `Cartão ${label}` : `Conta ${label}`;
  }, [parsedInfo]);

  const suggestedAccountMissing = useMemo(() => {
    if (!suggestedAccountName || !parsedInfo || parsedInfo.institution === "UNKNOWN") return false;
    const target = normalizeLabel(parsedInfo.institution.replace("_", " "));
    return !accounts.some((a) => normalizeLabel(`${a.institution || ""} ${a.name}`).includes(target));
  }, [accounts, parsedInfo, suggestedAccountName]);

  const createSuggestedAccount = async () => {
    if (!parsedInfo || !suggestedAccountName) return;
    setCreatingAccount(true);
    try {
      const isCard = parsedInfo.documentType === "CREDIT_CARD_STATEMENT";
      const payload = {
        user_id: userId,
        name: suggestedAccountName,
        type: isCard ? "credit_card" : "checking",
        scope: "personal",
        institution: INSTITUTION_LABEL[parsedInfo.institution],
        initial_balance: 0,
        current_balance: 0,
        include_in_net_worth: !isCard,
        is_active: true,
      };
      const { data, error } = await supabase.from("accounts").insert(payload as any).select("id, name, type, institution").single();
      if (error) throw error;
      const newAccount = data as AccountOption;
      setAccounts((cur) => [...cur, newAccount]);
      setRows((cur) => cur.map((r) => (r.accountId ? r : { ...r, accountId: newAccount.id })));
      toast.success(`Conta "${newAccount.name}" criada e aplicada.`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Falha ao criar conta."));
    } finally {
      setCreatingAccount(false);
    }
  };

  const duplicatedRows = rows.filter((r) => r.possibleDuplicate).length;
  const internalTransfers = rows.filter((r) => r.possibleInternalTransfer).length;
  const totalCredits = selectedRows.filter((r) => r.direction === "CREDIT").reduce((s, r) => s + Number(r.amount), 0);
  const totalDebits = selectedRows.filter((r) => r.direction === "DEBIT").reduce((s, r) => s + Number(r.amount), 0);

  const updateRow = (localId: string, patch: Partial<ReviewRow>) => {
    setRows((cur) => cur.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  };

  const bulkApplyCategory = (categoryId: string) => {
    setRows((cur) => cur.map((r) => (r.selected ? { ...r, categoryId } : r)));
  };
  const bulkApplyAccount = (accountId: string) => {
    setRows((cur) => cur.map((r) => (r.selected ? { ...r, accountId } : r)));
  };
  const bulkToggleAll = (value: boolean) => {
    setRows((cur) => cur.map((r) => ({ ...r, selected: value })));
  };

  const learnCategorizationRules = async (confirmedRows: ReviewRow[]) => {
    const existingKeys = new Set(
      categorizationRules.map((r) => `${normalizeRulePattern(r.pattern)}|${r.category_id || ""}|${r.direction || ""}`),
    );
    const nextRules = new Map<string, any>();

    confirmedRows.forEach((row) => {
      if (!row.categoryId || row.possibleInternalTransfer) return;
      const merchant = normalizeRulePattern(row.merchantName || row.descriptionNormalized || row.descriptionOriginal);
      if (!merchant || merchant.length < 4 || merchant === "OUTROS") return;
      const key = `${merchant}|${row.categoryId}|${row.direction}`;
      if (existingKeys.has(key) || nextRules.has(key)) return;
      nextRules.set(key, {
        user_id: userId,
        name: `Auto: ${merchant.slice(0, 48)}`,
        category_id: row.categoryId,
        match_type: "contains",
        pattern: merchant,
        merchant_name: merchant,
        direction: row.direction,
        is_active: true,
        priority: 25,
      });
    });

    if (nextRules.size === 0) return;
    const { data, error } = await untypedSupabase
      .from("categorization_rules")
      .insert(Array.from(nextRules.values()))
      .select("id, category_id, match_type, pattern, direction, priority, is_active");
    if (error) return;
    setCategorizationRules((c) => [...c, ...((data || []) as CategorizationRule[])]);
  };

  const handleConfirm = async () => {
    if (!fileName || !fileHash || selectedRows.length === 0) {
      toast.error("Nenhuma movimentação selecionada.");
      return;
    }
    const invalid = selectedRows.find((r) => !r.accountId);
    if (invalid) {
      toast.error("Escolha uma conta para todas as movimentações selecionadas.");
      return;
    }

    setSaving(true);
    try {
      const filePayload = {
        user_id: userId,
        file_name: fileName,
        file_hash: fileHash,
        file_size: fileSize,
        mime_type: mimeType,
        detected_format: parsedInfo?.format || "UNKNOWN",
        institution: parsedInfo?.institution || "UNKNOWN",
        document_type: parsedInfo?.documentType || "UNKNOWN",
        stored_original: false,
        metadata: { originalLength: fileText.length },
      };

      const { data: importedFileRaw, error: fileError } = await untypedSupabase
        .from("imported_files")
        .upsert(filePayload, { onConflict: "user_id,file_hash" })
        .select("id")
        .single();
      if (fileError) throw fileError;
      const importedFile = importedFileRaw as { id: string };

      const { data: importRowRaw, error: importError } = await untypedSupabase
        .from("imports")
        .insert({
          user_id: userId,
          imported_file_id: importedFile.id,
          status: "confirmed",
          institution: parsedInfo?.institution || "UNKNOWN",
          document_type: parsedInfo?.documentType || "UNKNOWN",
          parser_name: parsedInfo?.parserName || "manual",
          transactions_total: selectedRows.length,
          duplicates_total: duplicatedRows,
          confirmed_at: new Date().toISOString(),
          metadata: { internalTransfers },
        })
        .select("id")
        .single();
      if (importError) throw importError;
      const importRow = importRowRaw as { id: string };

      const txPayload = selectedRows.map((row) => {
        const type = transactionTypeFromRow(row);
        return {
          user_id: userId,
          account_id: row.accountId,
          category_id: row.categoryId || null,
          type,
          amount: Number(row.amount),
          transaction_date: row.transactionDate,
          due_date: row.postingDate || row.transactionDate,
          status: row.status,
          source: row.descriptionNormalized || row.descriptionOriginal,
          notes: row.descriptionOriginal,
          payment_method: row.sourceType === "CREDIT_CARD" ? "credit" : type === "transfer" ? "transferencia" : "import",
          is_reviewed: true,
          is_reconciled: false,
          external_id: row.externalId || null,
          fingerprint: row.fingerprint,
          import_id: importRow.id,
        };
      });

      const { error: txError } = await supabase.from("transactions").insert(txPayload);
      if (txError) throw txError;

      await learnCategorizationRules(selectedRows);

      toast.success(`${selectedRows.length} movimentações importadas.`);
      setRows([]);
      setParsedInfo(null);
      setFileText("");
      setFileName("");
      setFileHash("");
      window.dispatchEvent(new CustomEvent("finance-sync-updated", { detail: { userId } }));
    } catch (error) {
      toast.error(getErrorMessage(error, "Falha ao confirmar importação."));
    } finally {
      setSaving(false);
    }
  };

  const step = parsedInfo || parseError ? 2 : rows.length > 0 ? 3 : 1;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-28">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" strokeWidth={1.8} />
          <h1 className="font-heading text-xl font-semibold tracking-tight">Importar extratos</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Envie um extrato ou fatura. O sistema detecta o banco, o formato, sugere conta e categoria automaticamente.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-3 text-xs">
        {[
          { n: 1, label: "Enviar" },
          { n: 2, label: "Analisar" },
          { n: 3, label: "Revisar" },
        ].map((s, i) => (
          <React.Fragment key={s.n}>
            <div className={cn("flex items-center gap-2", step >= s.n ? "text-foreground" : "text-muted-foreground")}>
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
                  step > s.n
                    ? "border-primary bg-primary text-primary-foreground"
                    : step === s.n
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {step > s.n ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.n}
              </span>
              <span className="font-medium">{s.label}</span>
            </div>
            {i < 2 && <span className="h-px flex-1 bg-border" />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Upload */}
      <Card className="border-border/60 shadow-none">
        <CardContent className="p-5">
          <Tabs defaultValue="file">
            <TabsList className="mb-4 bg-muted/40">
              <TabsTrigger value="file" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" /> Arquivo
              </TabsTrigger>
              <TabsTrigger value="paste" className="gap-1.5 text-xs">
                <ClipboardPaste className="h-3.5 w-3.5" /> Colar texto
              </TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="mt-0">
              <label
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 p-10 text-center transition",
                  "hover:border-primary/60 hover:bg-primary/5",
                  loading && "pointer-events-none opacity-60",
                )}
              >
                {loading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                ) : (
                  <Upload className="h-8 w-8 text-muted-foreground" strokeWidth={1.6} />
                )}
                <p className="text-sm font-medium text-foreground">
                  {loading ? "Lendo arquivo…" : "Escolha ou arraste o arquivo aqui"}
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Aceita CSV do banco (Nubank, genérico), PDF com texto selecionável (Mercado Pago) e TXT.
                  <br />O sistema detecta o banco e o tipo de documento automaticamente.
                </p>
                <Input
                  type="file"
                  accept=".csv,.txt,.ofx,.pdf,text/csv,text/plain,application/pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </TabsContent>

            <TabsContent value="paste" className="mt-0 space-y-3">
              <Label className="text-xs text-muted-foreground">Cole aqui o texto copiado do extrato ou fatura</Label>
              <Textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Ex.: 14/03/2025 IFOOD DELIVERY -R$ 42,90"
                className="min-h-[180px] resize-none font-mono text-xs"
              />
              <Button type="button" className="w-full gap-2" onClick={handlePastedText} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Analisar texto
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Step 2: Error state */}
      {parseError && (
        <Card className="border-amber-200/60 bg-amber-50/40 shadow-none dark:border-amber-500/30 dark:bg-amber-500/5">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <h3 className="font-medium text-foreground">{parseError.title}</h3>
                <p className="text-sm text-muted-foreground">{parseError.body}</p>
                <p className="text-sm text-foreground/80">
                  <span className="font-medium">Sugestão: </span>
                  {parseError.hint}
                </p>
              </div>
            </div>
            {fileText && (
              <Collapsible open={showDiagnostic} onOpenChange={setShowDiagnostic}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <Info className="h-3.5 w-3.5" />
                    {showDiagnostic ? "Ocultar" : "Ver"} texto extraído (diagnóstico)
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                    {fileText.slice(0, 4000)}
                    {fileText.length > 4000 && "\n\n… (truncado)"}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Analysis summary */}
      {parsedInfo && !parseError && (
        <Card className="border-border/60 shadow-none">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Detecção automática</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-lg font-semibold">{INSTITUTION_LABEL[parsedInfo.institution]}</h2>
                  <Badge variant="outline" className="rounded-md text-[10px] font-normal">
                    {DOCUMENT_LABEL[parsedInfo.documentType]}
                  </Badge>
                  <Badge variant="outline" className="rounded-md text-[10px] font-normal">
                    {FORMAT_LABEL[parsedInfo.format]}
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Confiança</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                  {Math.round(parsedInfo.confidence * 100)}%
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <SummaryTile label="Linhas" value={String(rows.length)} />
              <SummaryTile label="Entradas" value={formatCurrency(totalCredits)} accent="income" />
              <SummaryTile label="Saídas" value={formatCurrency(totalDebits)} accent="expense" />
              <SummaryTile label="Duplicadas" value={String(duplicatedRows)} accent={duplicatedRows > 0 ? "warn" : undefined} />
              <SummaryTile label="Transferências" value={String(internalTransfers)} />
            </div>

            {parsedInfo.warnings.length > 0 && (
              <div className="space-y-1.5">
                {parsedInfo.warnings.slice(0, 3).map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>{w}</span>
                  </div>
                ))}
                {parsedInfo.warnings.length > 3 && (
                  <p className="pl-5 text-[11px] text-muted-foreground">+ {parsedInfo.warnings.length - 3} avisos</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {rows.length > 0 && (
        <Card className="border-border/60 shadow-none">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-base font-semibold">Revisar antes de importar</h2>
                <p className="text-xs text-muted-foreground">
                  Duplicadas já vêm desmarcadas. Transferências internas estão destacadas em azul.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => bulkToggleAll(false)} className="text-xs">
                  Desmarcar todas
                </Button>
                <Button size="sm" variant="ghost" onClick={() => bulkToggleAll(true)} className="text-xs">
                  Marcar todas
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirm}
                  disabled={saving || selectedRows.length === 0}
                  className="gap-1.5 text-xs"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Confirmar {selectedRows.length} lançamentos
                </Button>
              </div>
            </div>

            {/* Bulk actions bar */}
            {selectedRows.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                <span className="font-medium text-primary">{selectedRows.length} selecionadas</span>
                <span className="text-muted-foreground">Aplicar em massa:</span>
                <Select onValueChange={bulkApplyCategory}>
                  <SelectTrigger className="h-7 w-40 text-[11px]">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select onValueChange={bulkApplyAccount}>
                  <SelectTrigger className="h-7 w-40 text-[11px]">
                    <SelectValue placeholder="Conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Table */}
            <div className="overflow-hidden rounded-lg border border-border/60">
              <div className="hidden grid-cols-[32px_1.4fr_100px_120px_180px_180px_90px] gap-3 border-b border-border/60 bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
                <span />
                <span>Descrição</span>
                <span>Data</span>
                <span className="text-right">Valor</span>
                <span>Conta</span>
                <span>Categoria</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-border/60">
                {rows.map((row) => {
                  const Icon = rowIcon(row);
                  const type = transactionTypeFromRow(row);
                  const categoryOptions = categories.filter((c) => c.kind === type);

                  return (
                    <div
                      key={row.localId}
                      className={cn(
                        "grid grid-cols-1 gap-3 px-3 py-3 lg:grid-cols-[32px_1.4fr_100px_120px_180px_180px_90px]",
                        row.possibleDuplicate && "bg-amber-50/40 dark:bg-amber-500/5",
                        row.possibleInternalTransfer && "bg-primary/5",
                        !row.selected && "opacity-50",
                      )}
                    >
                      <div className="flex items-start pt-1">
                        <Checkbox checked={row.selected} onCheckedChange={(v) => updateRow(row.localId, { selected: Boolean(v) })} />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-3.5 w-3.5 shrink-0", rowAmountClass(row))} />
                          <p className="truncate text-sm font-medium text-foreground">
                            {row.descriptionNormalized || row.descriptionOriginal}
                          </p>
                        </div>
                        {row.descriptionOriginal !== row.descriptionNormalized && (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.descriptionOriginal}</p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {row.installmentCurrent && row.installmentTotal && (
                            <Badge variant="outline" className="rounded-md px-1.5 py-0 text-[9px] font-normal">
                              {row.installmentCurrent}/{row.installmentTotal}
                            </Badge>
                          )}
                          {row.possibleDuplicate && (
                            <Badge className="rounded-md border-amber-200 bg-amber-100 px-1.5 py-0 text-[9px] font-normal text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400">
                              possível duplicidade
                            </Badge>
                          )}
                          {row.possibleInternalTransfer && (
                            <Badge className="rounded-md border-primary/30 bg-primary/10 px-1.5 py-0 text-[9px] font-normal text-primary hover:bg-primary/10">
                              transferência
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="text-xs tabular-nums text-muted-foreground lg:pt-1">{row.transactionDate.slice(5)}</div>

                      <div className={cn("text-sm font-semibold tabular-nums lg:pt-1 lg:text-right", rowAmountClass(row))}>
                        {row.direction === "CREDIT" ? "+" : "−"}
                        {formatCurrency(Number(row.amount))}
                      </div>

                      <Select
                        value={row.accountId || "none"}
                        onValueChange={(v) => updateRow(row.localId, { accountId: v === "none" ? "" : v })}
                      >
                        <SelectTrigger className="h-8 rounded-md text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecionar</SelectItem>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id} className="text-xs">
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={row.categoryId || "none"}
                        onValueChange={(v) => updateRow(row.localId, { categoryId: v === "none" ? "" : v })}
                      >
                        <SelectTrigger className="h-8 rounded-md text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem categoria</SelectItem>
                          {categoryOptions.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={row.status}
                        onValueChange={(v) => updateRow(row.localId, { status: v as "paid" | "pending" })}
                      >
                        <SelectTrigger className="h-8 rounded-md text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paid" className="text-xs">Pago</SelectItem>
                          <SelectItem value="pending" className="text-xs">Pendente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const SummaryTile: React.FC<{ label: string; value: string; accent?: "income" | "expense" | "warn" }> = ({ label, value, accent }) => (
  <div className="rounded-lg border border-border/60 bg-background p-3">
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p
      className={cn(
        "mt-1 text-base font-semibold tabular-nums",
        accent === "income" && "text-emerald-600 dark:text-emerald-400",
        accent === "expense" && "text-rose-600 dark:text-rose-400",
        accent === "warn" && "text-amber-600 dark:text-amber-400",
      )}
    >
      {value}
    </p>
  </div>
);

export default ImportsPage;