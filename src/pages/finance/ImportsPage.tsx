import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowRightLeft,
  ArrowUpCircle,
  CheckCircle2,
  ClipboardPaste,
  Camera,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  ShieldAlert,
  Sparkles,
  Wand2,
  Trash2,
  Upload,
  RotateCw,
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
  ParsedFinancialDocument,
  ReconciliationReport,
  ROLE_LABEL,
  buildVisionDocument,
  classifyFinancialRow,
  getFileHash,
  getTransactionFingerprint,
  isImageFile,
  isPdfTextSufficient,
  markDuplicates,
  optimizeImageFile,
  parseFinancialFile,
  readFileAsText,
  reconcileDocument,
  renderPdfPagesToImages,
  sha256Hex,
} from "@/lib/finance/imports";
import { LocalCategoryClassifier } from "@/lib/finance/imports/classifier";
import { normalizeLabel } from "@/lib/financeShared";
import { cn } from "@/lib/utils";
import { classifyTransactionsWithAi, extractFinancialDocumentWithVision } from "@/lib/finance/aiService";

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
  category_id?: string | null;
};

type ReviewRow = NormalizedTransaction & {
  localId: string;
  selected: boolean;
  accountId: string;
  categoryId: string;
  status: "paid" | "pending";
  transactionType: "income" | "expense" | "transfer";
  financialRole: keyof typeof ROLE_LABEL;
  reviewConfirmed: boolean;
  aiCategorySuggestion?: string;
  aiConfidence?: number;
};

type ImagePreview = { id: string; name: string; dataUrl: string };

const INSTITUTION_LABEL: Record<InstitutionCode, string> = {
  UNKNOWN: "Detectando…",
  NUBANK: "Nubank",
  MERCADO_PAGO: "Mercado Pago",
  PICPAY: "PicPay",
  C6: "C6",
  BRADESCARD: "Bradescard (Amazon)",
  BRADESCO: "Bradesco",
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
  PDF_IMAGE: "PDF (imagem + IA)",
  IMAGE: "Foto/imagem + IA",
  TXT: "Texto",
};

const normalizeCategoryName = (value: string) => normalizeLabel(value).replace(/\s+/g, " ");
const normalizeRulePattern = (value: string) => normalizeLabel(value).replace(/\s+/g, " ").trim();

const transactionTypeFromRow = (row: NormalizedTransaction): "income" | "expense" | "transfer" => {
  return classifyFinancialRow(row).type;
};

const rowIcon = (row: NormalizedTransaction) => {
  if (classifyFinancialRow(row).type === "transfer") return ArrowRightLeft;
  return row.direction === "CREDIT" ? ArrowUpCircle : ArrowDownCircle;
};

const rowAmountClass = (row: NormalizedTransaction) => {
  const classification = classifyFinancialRow(row);
  if (classification.type === "transfer") return "text-primary";
  if (classification.negativeAmount) return "text-emerald-600/70 dark:text-emerald-400/70";
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
  const isCard = row.sourceType === "CREDIT_CARD";
  const eligible = accounts.filter((a) => (isCard ? a.type === "credit_card" : a.type !== "credit_card"));
  const pool = eligible.length > 0 ? eligible : accounts;
  const institution = normalizeLabel(row.institution.replace("_", " "));
  const byInstitution = pool.find((a) => normalizeLabel(`${a.institution || ""} ${a.name}`).includes(institution));
  if (byInstitution) return byInstitution.id;
  return pool[0]?.id || accounts[0]?.id || "";
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
  const [forcedMonth, setForcedMonth] = useState<string>(""); // YYYY-MM — define statement_month sem alterar datas originais
  const [loading, setLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
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
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null);
  const [imagePreviews, setImagePreviews] = useState<ImagePreview[]>([]);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [aiClassifying, setAiClassifying] = useState(false);
  const [aiSummary, setAiSummary] = useState<{ classified: number; created: number } | null>(null);
  const [recentImports, setRecentImports] = useState<Array<{
    id: string;
    institution: string | null;
    document_type: string | null;
    parser_name: string | null;
    transactions_total: number;
    confirmed_at: string | null;
    created_at: string;
  }>>([]);
  const [deletingImportId, setDeletingImportId] = useState<string | null>(null);

  const loadRecentImports = useCallback(async () => {
    const { data, error } = await untypedSupabase
      .from("imports")
      .select("id, institution, document_type, parser_name, transactions_total, confirmed_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error) setRecentImports((data || []) as any);
  }, [userId]);

  useEffect(() => {
    loadRecentImports();
  }, [loadRecentImports]);

  const handleDeleteImport = async (importId: string) => {
    if (!window.confirm("Excluir esta importação? Todas as movimentações criadas por ela serão removidas.")) return;
    setDeletingImportId(importId);
    try {
      const { error: txErr } = await supabase
        .from("transactions")
        .delete()
        .eq("user_id", userId)
        .eq("import_id", importId);
      if (txErr) throw txErr;
      const { error: impErr } = await untypedSupabase.from("imports").delete().eq("id", importId).eq("user_id", userId);
      if (impErr) throw impErr;
      toast.success("Importação desfeita.");
      setRecentImports((prev) => prev.filter((i) => i.id !== importId));
      window.dispatchEvent(new CustomEvent("finance-sync-updated", { detail: { userId } }));
    } catch (error) {
      toast.error(getErrorMessage(error, "Falha ao excluir importação."));
    } finally {
      setDeletingImportId(null);
    }
  };

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

  const applyParsedDocument = (
    parsed: ParsedFinancialDocument,
    support: { nextAccounts: AccountOption[]; nextCategories: CategoryOption[]; nextRules: CategorizationRule[] },
    existing: ExistingTx[],
  ) => {
    const reviewRows: ReviewRow[] = parsed.transactions.map((raw, index) => {
      const classification = classifyFinancialRow(raw);
      const isCard = raw.sourceType === "CREDIT_CARD";
      const needsReview = Boolean(raw.needsReview) || classification.needsReview;
      const row: NormalizedTransaction = {
        ...raw,
        statementMonth: isCard ? forcedMonth || raw.statementMonth || raw.dueDate?.slice(0, 7) : undefined,
        competenceMonth: raw.competenceMonth || raw.transactionDate.slice(0, 7),
        possibleInternalTransfer: classification.type === "transfer" || raw.possibleInternalTransfer,
        needsReview,
        classificationReason: classification.reason || raw.classificationReason,
        classificationSource: "rule",
        categorySuggestion: classification.categoryHint || raw.categorySuggestion,
        metadata: {
          ...(raw.metadata || {}),
          financialRole: classification.role,
          financialType: classification.type,
          negativeAmount: classification.negativeAmount,
        },
      };
      return {
        ...row,
        localId: `${row.fingerprint}-${index}`,
        selected: !row.possibleDuplicate && !needsReview,
        accountId: resolveDefaultAccountId(row, support.nextAccounts),
        categoryId: resolveSmartCategoryId(
          row,
          support.nextCategories,
          support.nextRules,
          existing.map((tx) => ({
            description: tx.source || "",
            merchantName: tx.source || "",
            category_id: (tx as ExistingTx & { category_id?: string | null }).category_id ?? null,
            direction: tx.type === "income" ? "CREDIT" : tx.type === "expense" ? "DEBIT" : null,
          })),
        ),
        status: "paid",
        transactionType: classification.type,
        financialRole: classification.role,
        reviewConfirmed: !needsReview,
      };
    });

    const report = reconcileDocument(parsed.transactions, {
      totalCredits: parsed.totals?.totalCredits,
      totalDebits: parsed.totals?.totalDebits,
      statementTotal: parsed.totals?.statementTotal,
    });
    setRows(reviewRows);
    setReconciliation(report);
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
      const uncertainRows = reviewRows.filter((row) => {
        if (row.transactionType === "transfer") return false;
        const category = support.nextCategories.find((item) => item.id === row.categoryId);
        return !category || normalizeCategoryName(category.name).startsWith("outros");
      });
      if (uncertainRows.length > 0) void classifyWithAI(uncertainRows, support.nextCategories, { silent: true });
    } else {
      toast.warning("Arquivo lido, mas nenhuma movimentação foi extraída.");
    }
  };

  const processText = async (input: { name: string; text: string; hash: string; size: number | null; mime: string }) => {
    setLoading(true);
    setRows([]);
    setParsedInfo(null);
    setParseError(null);
    setReconciliation(null);
    setShowDiagnostic(false);

    try {
      const [support, existing] = await Promise.all([loadSupportData(), fetchExistingForDedup()]);
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

      applyParsedDocument(parsed, support, existing);
      return parsed.transactions.length > 0;
    } catch (error) {
      const msg = getErrorMessage(error, "Falha ao importar arquivo.");
      setParseError(buildDidacticError(msg, Boolean(input.text?.length)));
      return false;
    } finally {
      setLoading(false);
      setProgressMessage("");
    }
  };

  const processVisionImages = async (input: {
    name: string;
    hash: string;
    size: number | null;
    mime: string;
    format: "PDF_IMAGE" | "IMAGE";
    images: Array<{ pageNumber: number; dataUrl: string }>;
  }) => {
    setImagePreviews(input.images.map((image, index) => ({
      id: crypto.randomUUID(),
      name: input.format === "PDF_IMAGE" ? `${input.name} · página ${image.pageNumber}` : input.name,
      dataUrl: image.dataUrl,
    })));
    setLoading(true);
    setRows([]);
    setParsedInfo(null);
    setParseError(null);
    setReconciliation(null);
    setFileName(input.name);
    setMimeType(input.mime);
    setFileSize(input.size);
    setFileHash(input.hash);
    setFileText("");
    try {
      const [support, existing] = await Promise.all([loadSupportData(), fetchExistingForDedup()]);
      const batches = [];
      const batchSize = 3;
      for (let start = 0; start < input.images.length; start += batchSize) {
        const slice = input.images.slice(start, start + batchSize);
        setProgressMessage(`IA lendo páginas ${slice[0].pageNumber}–${slice[slice.length - 1].pageNumber} de ${input.images.length}…`);
        batches.push(await extractFinancialDocumentWithVision({ images: slice, fileName: input.name, pageOffset: start }));
      }
      const parsed = await buildVisionDocument(batches, { fileName: input.name, fileHash: input.hash, format: input.format });
      const withDuplicates = { ...parsed, transactions: markDuplicates(parsed.transactions, existing) };
      if (withDuplicates.transactions.length === 0) {
        throw new Error("A IA não encontrou transações legíveis nas imagens. Tente fotos mais nítidas e sem cortes.");
      }
      applyParsedDocument(withDuplicates, support, existing);
      return true;
    } catch (error) {
      const msg = getErrorMessage(error, "Falha ao ler documento com IA.");
      setParseError({
        title: "Não consegui interpretar as imagens",
        body: msg,
        hint: "As imagens foram mantidas nesta tela. Você pode tentar novamente quando a IA estiver disponível ou enviar fotos mais nítidas.",
      });
      return false;
    } finally {
      setLoading(false);
      setProgressMessage("");
    }
  };

  const handleFile = async (file: File) => {
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("Arquivo muito grande. O limite é 25 MB.");
      const hash = await getFileHash(file);
      if (isImageFile(file)) {
        setProgressMessage("Preparando imagem…");
        const dataUrl = await optimizeImageFile(file);
        await processVisionImages({
          name: file.name,
          hash,
          size: file.size,
          mime: file.type || "image/jpeg",
          format: "IMAGE",
          images: [{ pageNumber: 1, dataUrl }],
        });
        return;
      }

      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (isPdf) {
        setProgressMessage("Tentando extrair o texto do PDF…");
        let text = "";
        try { text = await readFileAsText(file); } catch { /* visão tentará abrir as páginas */ }
        if (isPdfTextSufficient(text)) {
          const parsedText = await processText({ name: file.name, text, hash, size: file.size, mime: "application/pdf" });
          if (parsedText) return;
        }
        setLoading(true);
        setParseError(null);
        setProgressMessage("PDF escaneado detectado. Preparando páginas…");
        const images = await renderPdfPagesToImages(file, (done, total) => {
          setProgressMessage(`Preparando página ${done} de ${total}…`);
        });
        await processVisionImages({ name: file.name, hash, size: file.size, mime: "application/pdf", format: "PDF_IMAGE", images });
        return;
      }

      const text = await readFileAsText(file);
      await processText({ name: file.name, text, hash, size: file.size, mime: file.type || "text/plain" });
    } catch (error) {
      const msg = getErrorMessage(error, "Falha ao ler arquivo.");
      setParseError(buildDidacticError(msg, false));
      setLoading(false);
      setProgressMessage("");
    }
  };

  const addImagePreviews = async (files: File[]) => {
    const accepted = files.filter(isImageFile).slice(0, Math.max(0, 12 - imagePreviews.length));
    if (!accepted.length) {
      toast.error("Selecione imagens PNG, JPG ou WEBP.");
      return;
    }
    setLoading(true);
    try {
      const prepared: ImagePreview[] = [];
      for (const file of accepted) {
        if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} excede 12 MB.`);
        prepared.push({ id: crypto.randomUUID(), name: file.name, dataUrl: await optimizeImageFile(file) });
      }
      setImagePreviews((current) => [...current, ...prepared]);
    } catch (error) {
      toast.error(getErrorMessage(error, "Falha ao preparar imagem."));
    } finally {
      setLoading(false);
    }
  };

  const rotatePreview = async (id: string) => {
    const current = imagePreviews.find((image) => image.id === id);
    if (!current) return;
    const blob = await (await fetch(current.dataUrl)).blob();
    const rotated = await optimizeImageFile(new File([blob], current.name, { type: blob.type }), 90);
    setImagePreviews((images) => images.map((image) => image.id === id ? { ...image, dataUrl: rotated } : image));
  };

  const movePreview = (index: number, delta: -1 | 1) => {
    setImagePreviews((images) => {
      const target = index + delta;
      if (target < 0 || target >= images.length) return images;
      const next = [...images];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const analyzeImagePreviews = async () => {
    if (!imagePreviews.length) return;
    const hash = await sha256Hex(imagePreviews.map((image) => image.dataUrl).join("|"));
    await processVisionImages({
      name: imagePreviews.length === 1 ? imagePreviews[0].name : `${imagePreviews.length}-imagens`,
      hash,
      size: Math.round(imagePreviews.reduce((sum, image) => sum + image.dataUrl.length, 0) * 0.75),
      mime: "image/jpeg",
      format: "IMAGE",
      images: imagePreviews.map((image, index) => ({ pageNumber: index + 1, dataUrl: image.dataUrl })),
    });
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
  // Entradas = créditos REAIS (não conta pagamento de fatura nem estorno de cartão).
  const totalCredits = selectedRows
    .filter((r) => r.transactionType === "income")
    .reduce((s, r) => s + Number(r.amount), 0);
  // Saídas = despesas MENOS estornos (líquido real do mês).
  const totalRefunds = selectedRows.filter((r) => r.financialRole === "refund").reduce((s, r) => s + Number(r.amount), 0);
  const totalDebitsGross = selectedRows.filter((r) => r.transactionType === "expense" && r.financialRole !== "refund").reduce((s, r) => s + Number(r.amount), 0);
  const totalDebits = Math.max(0, totalDebitsGross - totalRefunds);
  const totalCardPayments = selectedRows.filter((r) => r.financialRole === "bill_payment").reduce((s, r) => s + Number(r.amount), 0);
  const cardPaymentsCount = selectedRows.filter((r) => r.financialRole === "bill_payment").length;
  const refundsCount = selectedRows.filter((r) => r.financialRole === "refund").length;

  const updateRow = (localId: string, patch: Partial<ReviewRow>) => {
    setRows((cur) => cur.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  };

  const bulkApplyCategory = (categoryId: string) => {
    setRows((cur) => cur.map((r) => (r.selected ? { ...r, categoryId } : r)));
  };
  const bulkApplyAccount = (accountId: string) => {
    setRows((cur) => cur.map((r) => (r.selected ? { ...r, accountId } : r)));
  };
  const bulkApplyType = (transactionType: "income" | "expense" | "transfer") => {
    setRows((cur) => cur.map((r) => r.selected ? {
      ...r,
      transactionType,
      financialRole: transactionType,
      categoryId: categories.some((c) => c.id === r.categoryId && c.kind === transactionType) ? r.categoryId : "",
      reviewConfirmed: true,
    } : r));
  };
  const bulkApplyStatementMonth = (statementMonth: string) => {
    if (!/^\d{4}-\d{2}$/.test(statementMonth)) return;
    setRows((cur) => cur.map((r) => r.selected ? { ...r, statementMonth, reviewConfirmed: true } : r));
  };
  const bulkToggleAll = (value: boolean) => {
    setRows((cur) => cur.map((r) => ({ ...r, selected: value, reviewConfirmed: value ? true : r.reviewConfirmed })));
  };

  const learnCategorizationRules = async (confirmedRows: ReviewRow[]) => {
    const existingKeys = new Set(
      categorizationRules.map((r) => `${normalizeRulePattern(r.pattern)}|${r.category_id || ""}|${r.direction || ""}`),
    );
    const nextRules = new Map<string, any>();

    confirmedRows.forEach((row) => {
      if (!row.categoryId || row.transactionType === "transfer" || !row.reviewConfirmed) return;
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

  const classifyWithAI = useCallback(
    async (
      targetRows: ReviewRow[],
      knownCategories: CategoryOption[],
      opts?: { silent?: boolean },
    ) => {
      if (targetRows.length === 0) return;
      setAiClassifying(true);
      try {
        const payloadRows = targetRows.map((row, idx) => ({
          index: idx,
          description: row.descriptionOriginal || row.descriptionNormalized || "",
          merchant: row.merchantName || null,
          amount: Number(row.amount),
          direction: row.direction,
          sourceType: row.sourceType || null,
          isTransfer: Boolean(row.possibleInternalTransfer),
        }));

        const results = await classifyTransactionsWithAi(
          payloadRows,
          knownCategories.map((c) => ({ name: c.name, kind: c.kind })),
        );

        if (results.length === 0) {
          if (!opts?.silent) toast.info("A IA não encontrou classificações novas.");
          return;
        }

        // A IA sugere; só categorias que já existem são aplicadas. Nada é criado
        // antes da confirmação explícita do usuário.
        const localCats = [...knownCategories];
        let classified = 0;
        setRows((cur) => {
          const rowIds = targetRows.map((r) => r.localId);
          const next = cur.map((row) => {
            const pos = rowIds.indexOf(row.localId);
            if (pos === -1) return row;
            const r = results.find((x) => x.index === pos);
            if (!r) return row;
            if (r.categoryKind !== row.transactionType) {
              return {
                ...row,
                aiCategorySuggestion: r.categoryName,
                aiConfidence: r.confidence,
                needsReview: true,
                reviewConfirmed: false,
                selected: false,
              };
            }
            const match = localCats.find(
              (c) => c.kind === r.categoryKind && normalizeCategoryName(c.name) === normalizeCategoryName(r.categoryName),
            );
            if (!match) return { ...row, aiCategorySuggestion: r.categoryName, aiConfidence: r.confidence };
            if (row.categoryId === match.id) return { ...row, aiCategorySuggestion: r.categoryName, aiConfidence: r.confidence };
            classified++;
            return { ...row, categoryId: match.id, aiCategorySuggestion: r.categoryName, aiConfidence: r.confidence };
          });
          return next;
        });

        setAiSummary({ classified, created: 0 });
        if (!opts?.silent) {
          toast.success(`IA classificou ${classified} linhas. Sugestões novas ficaram para sua revisão.`);
        }
      } catch (err) {
        if (!opts?.silent) toast.error(getErrorMessage(err, "Falha na classificação com IA."));
      } finally {
        setAiClassifying(false);
      }
    },
    [],
  );

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
    const unreviewed = selectedRows.find((r) => r.needsReview && !r.reviewConfirmed);
    if (unreviewed) {
      toast.error("Confirme as linhas marcadas como 'precisa revisar' antes de importar.");
      return;
    }
    if (reconciliation?.hasTotals && !reconciliation.ok) {
      const details = reconciliation.lines.filter((line) => !line.ok).map((line) => line.message).join("\n");
      if (!window.confirm(`Os totais do documento não conferem:\n\n${details}\n\nDeseja importar mesmo assim?`)) return;
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

      const txPayload = await Promise.all(selectedRows.map(async (row) => {
        const type = row.transactionType;
        // Estornos entram como valor NEGATIVO na categoria original — redutor de despesa.
        // Pagamento de fatura vira transferência (não conta como receita).
        const amountValue = row.financialRole === "refund" ? -Math.abs(Number(row.amount)) : Number(row.amount);
        const competenceMonth = row.competenceMonth || row.transactionDate.slice(0, 7);
        const isCard = row.sourceType === "CREDIT_CARD";
        const fingerprint = await getTransactionFingerprint({
          institution: row.institution,
          accountHint: row.sourceAccountId,
          transactionDate: row.transactionDate,
          amount: Math.abs(Number(row.amount)).toFixed(2),
          descriptionNormalized: row.descriptionNormalized || row.descriptionOriginal,
          direction: row.direction,
          installmentCurrent: row.installmentCurrent,
          installmentTotal: row.installmentTotal,
        });
        return {
          user_id: userId,
          account_id: row.accountId,
          category_id: row.categoryId || null,
          type,
          amount: amountValue,
          transaction_date: row.transactionDate,
          purchase_date: row.transactionDate,
          posting_date: row.postingDate || null,
          due_date: row.dueDate || null,
          paid_at: row.status === "paid" && row.sourceType === "BANK_ACCOUNT" ? row.postingDate || row.transactionDate : null,
          status: row.status,
          source: row.descriptionNormalized || row.descriptionOriginal,
          notes: row.descriptionOriginal,
          payment_method: row.sourceType === "CREDIT_CARD" ? "credit" : type === "transfer" ? "transferencia" : "import",
          is_reviewed: true,
          is_reconciled: Boolean(reconciliation?.hasTotals && reconciliation.ok),
          external_id: row.externalId || null,
          fingerprint,
          source_origin: "import",
          description_original: row.descriptionOriginal,
          description_normalized: row.descriptionNormalized,
          merchant_name: row.merchantName || null,
          installment_current: row.installmentCurrent ?? null,
          installment_total: row.installmentTotal ?? null,
          possible_duplicate: Boolean(row.possibleDuplicate),
          possible_internal_transfer: Boolean(row.possibleInternalTransfer),
          competence_month: competenceMonth,
          statement_month: isCard ? row.statementMonth || null : null,
          transaction_role: row.financialRole,
          institution: row.institution || parsedInfo?.institution || null,
          card_last4: (row.metadata?.cardLast4 as string | undefined) || null,
          metadata: {
            ...(row.metadata || {}),
            forcedStatementMonth: forcedMonth || null,
            classificationReason: row.classificationReason || null,
            classificationSource: row.classificationSource || null,
            aiCategorySuggestion: row.aiCategorySuggestion || null,
            pageNumber: row.pageNumber || null,
          },
        };
      }));

      const { error: confirmError } = await untypedSupabase.rpc("confirm_financial_import", {
        p_file: filePayload,
        p_import: {
          status: "confirmed",
          institution: parsedInfo?.institution || "UNKNOWN",
          document_type: parsedInfo?.documentType || "UNKNOWN",
          parser_name: parsedInfo?.parserName || "manual",
          duplicates_total: duplicatedRows,
          metadata: { internalTransfers, reconciliation },
        },
        p_transactions: txPayload,
      });
      if (confirmError) throw confirmError;

      await learnCategorizationRules(selectedRows);

      toast.success(`${selectedRows.length} movimentações importadas.`);
      setRows([]);
      setParsedInfo(null);
      setReconciliation(null);
      setImagePreviews([]);
      setFileText("");
      setFileName("");
      setFileHash("");
      window.dispatchEvent(new CustomEvent("finance-sync-updated", { detail: { userId } }));
      loadRecentImports();
    } catch (error) {
      toast.error(getErrorMessage(error, "Falha ao confirmar importação."));
    } finally {
      setSaving(false);
    }
  };

  const step = rows.length > 0 ? 3 : parsedInfo || parseError ? 2 : 1;

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
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex-1 min-w-[200px] space-y-1">
              <Label htmlFor="forced-month" className="text-xs font-medium text-foreground">
                Forçar mês da fatura <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <p className="text-[11px] leading-tight text-muted-foreground">
                Define somente o mês da fatura. As datas originais das compras continuam intactas.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                id="forced-month-m"
                value={forcedMonth ? forcedMonth.split("-")[1] : ""}
                onChange={(e) => {
                  const m = e.target.value;
                  const y = forcedMonth ? forcedMonth.split("-")[0] : String(new Date().getFullYear());
                  setForcedMonth(m ? `${y}-${m}` : "");
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Mês</option>
                {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m, i) => (
                  <option key={m} value={m}>{["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][i]}</option>
                ))}
              </select>
              <select
                id="forced-month-y"
                value={forcedMonth ? forcedMonth.split("-")[0] : ""}
                onChange={(e) => {
                  const y = e.target.value;
                  const m = forcedMonth ? forcedMonth.split("-")[1] : String(new Date().getMonth() + 1).padStart(2, "0");
                  setForcedMonth(y ? `${y}-${m}` : "");
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Ano</option>
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {forcedMonth && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setForcedMonth("")} className="h-9 text-xs">
                Limpar
              </Button>
            )}
          </div>

          <Tabs defaultValue="file">
            <TabsList className="mb-4 grid w-full max-w-md grid-cols-3 bg-muted/40">
              <TabsTrigger value="file" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" /> Arquivo
              </TabsTrigger>
              <TabsTrigger value="paste" className="gap-1.5 text-xs">
                <ClipboardPaste className="h-3.5 w-3.5" /> Colar texto
              </TabsTrigger>
              <TabsTrigger value="image" className="gap-1.5 text-xs">
                <ImageIcon className="h-3.5 w-3.5" /> Foto ou imagem
              </TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="mt-0">
              <label
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files?.[0];
                  if (file) void handleFile(file);
                }}
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
                  {loading ? progressMessage || "Lendo arquivo…" : "Escolha ou arraste o arquivo aqui"}
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  PDF normal ou escaneado, CSV, OFX, XLSX, TXT e imagens de qualquer instituição.
                  <br />Se o PDF não tiver texto, a leitura por imagem começa automaticamente.
                  <br />As páginas escaneadas são enviadas à IA somente para extração e não são salvas como arquivo.
                </p>
                <Input
                  type="file"
                  accept=".csv,.txt,.ofx,.qfx,.pdf,.xlsx,.xls,.xlsm,.png,.jpg,.jpeg,.webp,text/csv,text/plain,application/pdf,image/*"
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

            <TabsContent value="image" className="mt-0 space-y-4">
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent">
                  <ImageIcon className="h-4 w-4" /> Selecionar imagens
                  <Input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      void addImagePreviews(Array.from(event.target.files || []));
                      event.target.value = "";
                    }}
                  />
                </label>
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent">
                  <Camera className="h-4 w-4" /> Tirar foto
                  <Input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(event) => {
                      void addImagePreviews(Array.from(event.target.files || []));
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              {imagePreviews.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 text-center text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                  <p className="text-sm font-medium">Adicione uma ou mais páginas</p>
                  <p className="max-w-md text-xs">Fotografe sem cortes, reflexos ou sombras. A ordem abaixo será usada como número da página.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {imagePreviews.map((image, index) => (
                    <div key={image.id} className="overflow-hidden rounded-lg border bg-muted/20">
                      <img src={image.dataUrl} alt={`Página ${index + 1}`} className="h-40 w-full object-contain" />
                      <div className="flex items-center justify-between gap-2 border-t p-2">
                        <span className="truncate text-[11px]">Página {index + 1} · {image.name}</span>
                        <div className="flex">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => movePreview(index, -1)} title="Mover para antes">↑</Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === imagePreviews.length - 1} onClick={() => movePreview(index, 1)} title="Mover para depois">↓</Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => void rotatePreview(image.id)} title="Girar">
                            <RotateCw className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setImagePreviews((images) => images.filter((item) => item.id !== image.id))} title="Remover">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button type="button" className="w-full gap-2" onClick={() => void analyzeImagePreviews()} disabled={loading || imagePreviews.length === 0}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? progressMessage || "Analisando imagens…" : `Analisar ${imagePreviews.length || ""} imagem(ns) com IA`}
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

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <SummaryTile label="Linhas" value={String(rows.length)} />
              <SummaryTile label="Entradas" value={formatCurrency(totalCredits)} accent="income" />
              <SummaryTile
                label={totalRefunds > 0 ? "Saídas (líq.)" : "Saídas"}
                value={formatCurrency(totalDebits)}
                accent="expense"
                hint={totalRefunds > 0 ? `Bruto ${formatCurrency(totalDebitsGross)} − estornos ${formatCurrency(totalRefunds)}` : undefined}
              />
              {cardPaymentsCount > 0 && (
                <SummaryTile
                  label="Pagto fatura"
                  value={formatCurrency(totalCardPayments)}
                  hint={`${cardPaymentsCount} pagamento(s) — não conta como receita`}
                />
              )}
              {refundsCount > 0 && (
                <SummaryTile
                  label="Estornos"
                  value={formatCurrency(totalRefunds)}
                  accent="income"
                  hint={`${refundsCount} crédito(s) — reduz a categoria original`}
                />
              )}
              <SummaryTile label="Duplicadas" value={String(duplicatedRows)} accent={duplicatedRows > 0 ? "warn" : undefined} />
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

            {reconciliation?.hasTotals && (
              <div className={cn(
                "space-y-1 rounded-lg border px-3 py-2 text-xs",
                reconciliation.ok
                  ? "border-emerald-500/25 bg-emerald-500/5"
                  : "border-amber-500/30 bg-amber-500/5",
              )}>
                <div className="flex items-center gap-2 font-medium">
                  {reconciliation.ok
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  {reconciliation.ok ? "Valores do documento conferem" : "Há diferença nos totais do documento"}
                </div>
                {reconciliation.lines.map((line) => <p key={line.label} className="pl-6 text-muted-foreground">{line.message}</p>)}
              </div>
            )}

            {suggestedAccountMissing && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="text-foreground/80">
                    Você ainda não tem uma conta <span className="font-semibold text-foreground">{suggestedAccountName}</span>.
                    Posso criar agora e vincular às movimentações.
                  </span>
                </div>
                <Button size="sm" variant="outline" onClick={createSuggestedAccount} disabled={creatingAccount} className="gap-1.5 text-xs">
                  {creatingAccount ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Criar {suggestedAccountName}
                </Button>
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
                  variant="outline"
                  onClick={() => classifyWithAI(rows, categories)}
                  disabled={aiClassifying}
                  className="gap-1.5 text-xs"
                >
                  {aiClassifying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  Classificar com IA
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

            {(aiClassifying || aiSummary) && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                {aiClassifying ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="text-primary">IA analisando lojas e classificando categorias…</span>
                  </>
                ) : aiSummary ? (
                  <>
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-foreground/80">
                      IA classificou <span className="font-semibold text-primary">{aiSummary.classified}</span> linha(s)
                      {aiSummary.created > 0 && (
                        <>
                          {" "}e criou <span className="font-semibold text-primary">{aiSummary.created}</span> categoria(s) nova(s)
                        </>
                      )}
                      .
                    </span>
                  </>
                ) : null}
              </div>
            )}

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
                <Select onValueChange={(value) => bulkApplyType(value as ReviewRow["transactionType"])}>
                  <SelectTrigger className="h-7 w-36 text-[11px]">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Despesa</SelectItem>
                    <SelectItem value="income">Receita</SelectItem>
                    <SelectItem value="transfer">Transferência</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="month"
                  aria-label="Mês da fatura em massa"
                  className="h-7 w-36 text-[11px]"
                  onChange={(event) => bulkApplyStatementMonth(event.target.value)}
                />
              </div>
            )}

            {/* Table */}
            <div className="overflow-hidden rounded-lg border border-border/60">
              <div className="hidden grid-cols-[32px_1.3fr_112px_110px_150px_150px_125px_90px] gap-3 border-b border-border/60 bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
                <span />
                <span>Descrição</span>
                <span>Data da compra</span>
                <span className="text-right">Valor</span>
                <span>Conta</span>
                <span>Categoria</span>
                <span>Tipo</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-border/60">
                {rows.map((row) => {
                  const Icon = rowIcon(row);
                  const type = row.transactionType;
                  const categoryOptions = categories.filter((c) => c.kind === type);

                  return (
                    <div
                      key={row.localId}
                      className={cn(
                        "grid grid-cols-1 gap-3 px-3 py-3 lg:grid-cols-[32px_1.3fr_112px_110px_150px_150px_125px_90px]",
                        row.possibleDuplicate && "bg-amber-50/40 dark:bg-amber-500/5",
                        row.possibleInternalTransfer && "bg-primary/5",
                        !row.selected && "opacity-50",
                      )}
                    >
                      <div className="flex items-start pt-1">
                        <Checkbox checked={row.selected} onCheckedChange={(v) => updateRow(row.localId, { selected: Boolean(v), reviewConfirmed: Boolean(v) || row.reviewConfirmed })} />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-3.5 w-3.5 shrink-0", rowAmountClass(row))} />
                          <Input
                            value={row.descriptionNormalized || row.descriptionOriginal}
                            onChange={(event) => updateRow(row.localId, { descriptionNormalized: event.target.value, reviewConfirmed: true })}
                            className="h-8 min-w-0 text-sm font-medium"
                            aria-label="Descrição"
                          />
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
                          <Badge variant="outline" className="rounded-md px-1.5 py-0 text-[9px] font-normal" title={row.classificationReason}>
                            {ROLE_LABEL[row.financialRole]}
                          </Badge>
                          <Badge variant="outline" className="rounded-md px-1.5 py-0 text-[9px] font-normal">
                            {Math.round(row.confidence * 100)}% confiança
                          </Badge>
                          {row.pageNumber && (
                            <Badge variant="outline" className="rounded-md px-1.5 py-0 text-[9px] font-normal">pág. {row.pageNumber}</Badge>
                          )}
                          {row.needsReview && !row.reviewConfirmed && (
                            <Badge className="rounded-md border-amber-300 bg-amber-100 px-1.5 py-0 text-[9px] font-normal text-amber-800 hover:bg-amber-100">precisa revisar</Badge>
                          )}
                          {row.financialRole === "bill_payment" && (
                            <Badge className="rounded-md border-primary/30 bg-primary/10 px-1.5 py-0 text-[9px] font-normal text-primary hover:bg-primary/10">
                              pagamento de fatura
                            </Badge>
                          )}
                          {row.financialRole === "refund" && (
                            <Badge className="rounded-md border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[9px] font-normal text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400">
                              estorno (reduz categoria)
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-1">
                          <label className="text-[9px] text-muted-foreground">Lançamento
                            <Input type="date" value={row.postingDate || ""} onChange={(event) => updateRow(row.localId, { postingDate: event.target.value || undefined, reviewConfirmed: true })} className="mt-0.5 h-7 px-1 text-[10px]" />
                          </label>
                          <label className="text-[9px] text-muted-foreground">Vencimento
                            <Input type="date" value={row.dueDate || ""} onChange={(event) => updateRow(row.localId, { dueDate: event.target.value || undefined, reviewConfirmed: true })} className="mt-0.5 h-7 px-1 text-[10px]" />
                          </label>
                          <label className="text-[9px] text-muted-foreground">Mês fatura
                            <Input type="month" value={row.statementMonth || ""} onChange={(event) => updateRow(row.localId, { statementMonth: event.target.value || undefined, reviewConfirmed: true })} className="mt-0.5 h-7 px-1 text-[10px]" />
                          </label>
                        </div>
                        {row.aiCategorySuggestion && !row.categoryId && (
                          <p className="mt-1 text-[10px] text-primary">IA sugeriu “{row.aiCategorySuggestion}”; escolha uma categoria para confirmar.</p>
                        )}
                      </div>

                      <Input type="date" value={row.transactionDate} onChange={(event) => updateRow(row.localId, { transactionDate: event.target.value, competenceMonth: event.target.value.slice(0, 7), reviewConfirmed: true })} className="h-8 px-1 text-[10px]" />

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
                        value={row.transactionType}
                        onValueChange={(value) => updateRow(row.localId, {
                          transactionType: value as ReviewRow["transactionType"],
                          financialRole: value as "income" | "expense" | "transfer",
                          categoryId: categories.some((category) => category.id === row.categoryId && category.kind === value) ? row.categoryId : "",
                          reviewConfirmed: true,
                        })}
                      >
                        <SelectTrigger className="h-8 rounded-md text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense">Despesa</SelectItem>
                          <SelectItem value="income">Receita</SelectItem>
                          <SelectItem value="transfer">Transferência</SelectItem>
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

      {/* Recent imports — undo/reset */}
      <Card className="border-border/60 shadow-none">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-heading text-sm font-semibold">Importações recentes</h2>
              <p className="text-xs text-muted-foreground">
                Importou errado? Exclua para remover todas as movimentações criadas por aquela importação.
              </p>
            </div>
          </div>
          {recentImports.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma importação registrada ainda.</p>
          ) : (
            <div className="divide-y divide-border/60 rounded-lg border border-border/60">
              {recentImports.map((imp) => {
                const when = imp.confirmed_at || imp.created_at;
                const date = when ? new Date(when).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
                const institution = INSTITUTION_LABEL[(imp.institution as InstitutionCode) || "UNKNOWN"] || imp.institution || "—";
                const docType = DOCUMENT_LABEL[(imp.document_type as FinancialDocumentType) || "UNKNOWN"] || imp.document_type || "—";
                return (
                  <div key={imp.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {institution} · {docType}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {imp.transactions_total} movimentações · {date}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
                      onClick={() => handleDeleteImport(imp.id)}
                      disabled={deletingImportId === imp.id}
                    >
                      {deletingImportId === imp.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Excluir
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const SummaryTile: React.FC<{ label: string; value: string; accent?: "income" | "expense" | "warn"; hint?: string }> = ({ label, value, accent, hint }) => (
  <div className="rounded-lg border border-border/60 bg-background p-3" title={hint}>
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
    {hint && <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{hint}</p>}
  </div>
);

export default ImportsPage;
