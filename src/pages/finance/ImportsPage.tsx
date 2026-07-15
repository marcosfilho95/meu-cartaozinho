import React, { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowRightLeft,
  ArrowUpCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

const INSTITUTION_OPTIONS: Array<{ value: InstitutionCode; label: string }> = [
  { value: "UNKNOWN", label: "Detectar" },
  { value: "NUBANK", label: "Nubank" },
  { value: "MERCADO_PAGO", label: "Mercado Pago" },
  { value: "PICPAY", label: "PicPay" },
  { value: "C6", label: "C6" },
];

const DOCUMENT_OPTIONS: Array<{ value: FinancialDocumentType; label: string }> = [
  { value: "UNKNOWN", label: "Detectar" },
  { value: "BANK_STATEMENT", label: "Extrato bancário" },
  { value: "CREDIT_CARD_STATEMENT", label: "Fatura/cartão" },
];

const FORMAT_OPTIONS: Array<{ value: FinancialFileFormat; label: string }> = [
  { value: "UNKNOWN", label: "Detectar" },
  { value: "CSV", label: "CSV" },
  { value: "PDF_TEXT", label: "PDF textual colado/extraído" },
  { value: "TXT", label: "Texto" },
  { value: "OFX", label: "OFX" },
  { value: "XLSX", label: "XLSX" },
];

const normalizeCategoryName = (value: string) => normalizeLabel(value).replace(/\s+/g, " ");
const normalizeRulePattern = (value: string) => normalizeLabel(value).replace(/\s+/g, " ").trim();

const transactionTypeFromRow = (row: NormalizedTransaction): "income" | "expense" | "transfer" => {
  if (row.possibleInternalTransfer) return "transfer";
  return row.direction === "CREDIT" ? "income" : "expense";
};

const getRowIcon = (row: NormalizedTransaction) => {
  if (row.possibleInternalTransfer) return ArrowRightLeft;
  return row.direction === "CREDIT" ? ArrowUpCircle : ArrowDownCircle;
};

const getRowAmountClass = (row: NormalizedTransaction) => {
  if (row.possibleInternalTransfer) return "text-primary";
  return row.direction === "CREDIT" ? "text-success" : "text-foreground";
};

const resolveSuggestedCategoryId = (row: NormalizedTransaction, categories: CategoryOption[]) => {
  const type = transactionTypeFromRow(row);
  const target = normalizeCategoryName(row.categorySuggestion || "");
  if (!target) return "";

  const byExact = categories.find((category) => category.kind === type && normalizeCategoryName(category.name) === target);
  if (byExact) return byExact.id;

  const byContains = categories.find((category) => {
    if (category.kind !== type) return false;
    const normalizedName = normalizeCategoryName(category.name);
    return normalizedName.includes(target) || target.includes(normalizedName);
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

const resolveSmartCategoryId = (row: NormalizedTransaction, categories: CategoryOption[], rules: CategorizationRule[]) => {
  const type = transactionTypeFromRow(row);
  const matchedRule = [...rules]
    .filter((rule) => rule.is_active && rule.category_id)
    .sort((a, b) => a.priority - b.priority)
    .find((rule) => ruleMatchesRow(rule, row) && categories.some((category) => category.id === rule.category_id && category.kind === type));

  return matchedRule?.category_id || resolveSuggestedCategoryId(row, categories);
};

const resolveDefaultAccountId = (row: NormalizedTransaction, accounts: AccountOption[]) => {
  const institution = normalizeLabel(row.institution.replace("_", " "));
  const byInstitution = accounts.find((account) => normalizeLabel(`${account.institution || ""} ${account.name}`).includes(institution));
  if (byInstitution) return byInstitution.id;

  if (row.sourceType === "CREDIT_CARD") {
    return accounts.find((account) => account.type === "credit_card")?.id || accounts[0]?.id || "";
  }

  return accounts.find((account) => account.type !== "credit_card")?.id || accounts[0]?.id || "";
};

const supportedHint = "Suporte funcional: Nubank CSV oficial, PDF oficial Mercado Pago e texto colado/extraído de extrato.";

const ImportsPage: React.FC<ImportsPageProps> = ({ userId }) => {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categorizationRules, setCategorizationRules] = useState<CategorizationRule[]>([]);
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [mimeType, setMimeType] = useState("");
  const [fileText, setFileText] = useState("");
  const [manualInstitution, setManualInstitution] = useState<InstitutionCode>("UNKNOWN");
  const [manualDocumentType, setManualDocumentType] = useState<FinancialDocumentType>("UNKNOWN");
  const [manualFormat, setManualFormat] = useState<FinancialFileFormat>("UNKNOWN");
  const [pastedText, setPastedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedInfo, setParsedInfo] = useState<{
    parserName: string;
    institution: InstitutionCode;
    documentType: FinancialDocumentType;
    format: FinancialFileFormat;
    warnings: string[];
  } | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);

  const loadSupportData = useCallback(async () => {
    await Promise.all([ensureDefaultAccounts(userId), ensureDefaultCategories(userId)]);

    const [accountsRes, categoriesRes, rulesRes] = await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, type, institution")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("name"),
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

  const existingTransactions = useCallback(async () => {
    const fullResult = await untypedSupabase
      .from("transactions")
      .select("id, external_id, fingerprint, amount, transaction_date, source, type")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(5000);

    if (!fullResult.error) return (fullResult.data || []) as ExistingTx[];

    const fallbackResult = await untypedSupabase
      .from("transactions")
      .select("id, amount, transaction_date, source, type")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(5000);

    if (!fallbackResult.error) {
      toast.warning("Importação aberta sem checagem completa de duplicidade. Confirme se a migration de imports foi aplicada.");
      return (fallbackResult.data || []) as ExistingTx[];
    }

    toast.warning("Não consegui consultar transações antigas para duplicidade. A revisão do arquivo continuará.");
    return [];
  }, [userId]);

  const processText = async (input: { name: string; text: string; hash: string; size: number | null; mime: string }) => {
    setLoading(true);
    setRows([]);
    setParsedInfo(null);

    try {
      const [{ nextAccounts, nextCategories, nextRules }, existing] = await Promise.all([
        loadSupportData(),
        existingTransactions(),
      ]);

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
          manualInstitution,
          manualDocumentType,
          manualFormat,
        },
        existing,
      );

      const reviewRows = parsed.transactions.map((row, index) => ({
        ...row,
        localId: `${row.fingerprint}-${index}`,
        selected: !row.possibleDuplicate,
        accountId: resolveDefaultAccountId(row, nextAccounts),
        categoryId: resolveSmartCategoryId(row, nextCategories, nextRules),
        status: "paid" as const,
      }));

      setRows(reviewRows);
      setParsedInfo({
        parserName: parsed.parserName,
        institution: parsed.detection.institution,
        documentType: parsed.detection.documentType,
        format: parsed.detection.format,
        warnings: parsed.warnings,
      });
      toast.success(`${reviewRows.length} movimentações prontas para revisão.`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Falha ao importar arquivo."));
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    try {
      const [text, hash] = await Promise.all([readFileAsText(file), getFileHash(file)]);
      await processText({
        name: file.name,
        text,
        hash,
        size: file.size,
        mime: file.type || "text/plain",
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "Falha ao ler arquivo."));
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

  const selectedRows = useMemo(() => rows.filter((row) => row.selected), [rows]);
  const duplicatedRows = rows.filter((row) => row.possibleDuplicate).length;
  const internalTransfers = rows.filter((row) => row.possibleInternalTransfer).length;
  const totalCredits = selectedRows.filter((row) => row.direction === "CREDIT").reduce((sum, row) => sum + Number(row.amount), 0);
  const totalDebits = selectedRows.filter((row) => row.direction === "DEBIT").reduce((sum, row) => sum + Number(row.amount), 0);

  const updateRow = (localId: string, patch: Partial<ReviewRow>) => {
    setRows((current) => current.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  };

  const learnCategorizationRules = async (confirmedRows: ReviewRow[]) => {
    const existingKeys = new Set(
      categorizationRules.map((rule) => `${normalizeRulePattern(rule.pattern)}|${rule.category_id || ""}|${rule.direction || ""}`),
    );
    const nextRules = new Map<string, {
      user_id: string;
      name: string;
      category_id: string;
      match_type: "contains";
      pattern: string;
      merchant_name: string;
      direction: "CREDIT" | "DEBIT";
      is_active: boolean;
      priority: number;
    }>();

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

    if (error) {
      toast.warning("Importação salva, mas não consegui gravar as novas regras inteligentes.");
      return;
    }

    setCategorizationRules((current) => [...current, ...((data || []) as CategorizationRule[])]);
  };

  const handleConfirm = async () => {
    if (!fileName || !fileHash || selectedRows.length === 0) {
      toast.error("Nenhuma movimentação selecionada para confirmar.");
      return;
    }

    const invalid = selectedRows.find((row) => !row.accountId);
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
        institution: parsedInfo?.institution || manualInstitution,
        document_type: parsedInfo?.documentType || manualDocumentType,
        stored_original: false,
        metadata: {
          originalLength: fileText.length,
        },
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
          institution: parsedInfo?.institution || manualInstitution,
          document_type: parsedInfo?.documentType || manualDocumentType,
          parser_name: parsedInfo?.parserName || "manual",
          transactions_total: selectedRows.length,
          duplicates_total: duplicatedRows,
          confirmed_at: new Date().toISOString(),
          metadata: {
            internalTransfers,
          },
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
          description_original: row.descriptionOriginal,
          description_normalized: row.descriptionNormalized,
          merchant_name: row.merchantName || null,
          external_id: row.externalId || null,
          source_origin: `${row.institution}:${row.sourceType}`,
          import_id: importRow.id,
          imported_file_id: importedFile.id,
          installment_current: row.installmentCurrent || null,
          installment_total: row.installmentTotal || null,
          fingerprint: row.fingerprint,
          possible_duplicate: Boolean(row.possibleDuplicate),
          possible_internal_transfer: Boolean(row.possibleInternalTransfer),
          metadata: row.metadata,
        };
      });

      const { error: txError } = await untypedSupabase.from("transactions").insert(txPayload);
      if (txError) throw txError;

      await learnCategorizationRules(selectedRows);

      toast.success(`${selectedRows.length} movimentações importadas.`);
      setRows([]);
      setParsedInfo(null);
      setFileText("");
      window.dispatchEvent(new CustomEvent("finance-sync-updated", { detail: { userId } }));
    } catch (error) {
      toast.error(getErrorMessage(error, "Falha ao confirmar importação."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pb-24">
      <Card className="border-0 shadow-card">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                <h1 className="font-heading text-lg font-bold">Importações</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{supportedHint}</p>
            </div>
            {parsedInfo && (
              <Badge variant="outline" className="rounded-lg px-2 py-1 text-[11px]">
                {parsedInfo.parserName}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <Label className="text-xs text-muted-foreground">Instituição</Label>
              <Select value={manualInstitution} onValueChange={(value) => setManualInstitution(value as InstitutionCode)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSTITUTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={manualDocumentType} onValueChange={(value) => setManualDocumentType(value as FinancialDocumentType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Formato</Label>
              <Select value={manualFormat} onValueChange={(value) => setManualFormat(value as FinancialFileFormat)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <label className="block cursor-pointer rounded-lg border-2 border-dashed border-border bg-muted/20 p-6 text-center transition hover:border-primary/50 hover:bg-primary/5">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold text-foreground">Escolha ou arraste um arquivo</p>
              <p className="mt-1 text-xs text-muted-foreground">CSV, PDF, TXT ou OFX. O app detecta o padrão do banco automaticamente.</p>
              <Input
                type="file"
                accept=".csv,.txt,.ofx,.pdf,text/csv,text/plain,application/pdf"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleFile(file);
                  event.target.value = "";
                }}
              />
            </label>

            <div className="rounded-lg border border-border bg-background p-3">
              <Label className="text-xs text-muted-foreground">Ou cole o texto do PDF</Label>
              <Textarea
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                placeholder="Cole aqui o texto selecionável do extrato Mercado Pago, PicPay ou C6..."
                className="mt-2 min-h-[116px] resize-none"
              />
              <Button type="button" variant="outline" className="mt-2 w-full gap-1.5" onClick={handlePastedText} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Processar texto colado
              </Button>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processando arquivo para revisão...
            </div>
          )}

          {parsedInfo && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Linhas</p>
                <p className="text-lg font-bold">{rows.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Selecionadas</p>
                <p className="text-lg font-bold text-primary">{selectedRows.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Entradas</p>
                <p className="text-lg font-bold text-success">{formatCurrency(totalCredits)}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Saídas</p>
                <p className="text-lg font-bold text-destructive">{formatCurrency(totalDebits)}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Duplicidades</p>
                <p className="text-lg font-bold text-warning">{duplicatedRows}</p>
              </div>
            </div>
          )}

          {parsedInfo?.warnings.map((warning) => (
            <div key={warning} className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {warning}
            </div>
          ))}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card className="border-0 shadow-card">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-heading text-base font-bold">Revisão antes de gravar</h2>
                <p className="text-xs text-muted-foreground">Desmarque duplicidades, ajuste conta/categoria e confirme.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRows((current) => current.map((row) => ({ ...row, selected: false })))}
                >
                  Desmarcar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gradient-primary text-primary-foreground"
                  disabled={saving || selectedRows.length === 0}
                  onClick={handleConfirm}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Confirmar importação
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {rows.map((row) => {
                const Icon = getRowIcon(row);
                const type = transactionTypeFromRow(row);
                const categoryOptions = categories.filter((category) => category.kind === type);

                return (
                  <div
                    key={row.localId}
                    className={cn(
                      "grid grid-cols-1 gap-3 rounded-lg border border-border bg-background p-3 xl:grid-cols-[32px_1.3fr_150px_190px_190px_100px]",
                      row.possibleDuplicate && "border-warning/50 bg-warning/5",
                      !row.selected && "opacity-60",
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full border-2",
                        row.selected ? "border-primary bg-primary/10 text-primary" : "border-muted-foreground/30 text-muted-foreground",
                      )}
                      onClick={() => updateRow(row.localId, { selected: !row.selected })}
                      title={row.selected ? "Importar" : "Ignorar"}
                    >
                      {row.selected ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", getRowAmountClass(row))} />
                        <p className="truncate text-sm font-semibold">{row.descriptionNormalized || row.descriptionOriginal}</p>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.descriptionOriginal}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {row.installmentCurrent && row.installmentTotal && (
                          <Badge variant="outline" className="text-[10px]">
                            Parcela {row.installmentCurrent}/{row.installmentTotal}
                          </Badge>
                        )}
                        {row.possibleDuplicate && (
                          <Badge className="border-warning/30 bg-warning/15 text-[10px] text-warning">possível duplicidade</Badge>
                        )}
                        {row.possibleInternalTransfer && (
                          <Badge className="border-primary/30 bg-primary/10 text-[10px] text-primary">transferência interna</Badge>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Valor</p>
                      <p className={cn("text-sm font-bold", getRowAmountClass(row))}>
                        {row.direction === "CREDIT" ? "+" : "-"}
                        {formatCurrency(Number(row.amount))}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{row.transactionDate}</p>
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Conta</p>
                      <Select value={row.accountId || "none"} onValueChange={(value) => updateRow(row.localId, { accountId: value === "none" ? "" : value })}>
                        <SelectTrigger className="h-9 rounded-lg text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecionar</SelectItem>
                          {accounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Categoria</p>
                      <Select value={row.categoryId || "none"} onValueChange={(value) => updateRow(row.localId, { categoryId: value === "none" ? "" : value })}>
                        <SelectTrigger className="h-9 rounded-lg text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem categoria</SelectItem>
                          {categoryOptions.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Status</p>
                      <Select value={row.status} onValueChange={(value) => updateRow(row.localId, { status: value as "paid" | "pending" })}>
                        <SelectTrigger className="h-9 rounded-lg text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paid">Pago</SelectItem>
                          <SelectItem value="pending">Pendente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ImportsPage;
