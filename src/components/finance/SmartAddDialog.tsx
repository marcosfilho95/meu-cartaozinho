import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  ImageIcon,
  Loader2,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
  Mic,
  Square,
  Send,
  RotateCcw,
  X,
} from "lucide-react";


import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  isGenericSmartCategoryId,
  resolveHistoricalClassification,
  resolveSmartCategoryId,
  type SmartClassificationHistory,
  type SmartCategoryOption,
} from "@/lib/financeSmartClassification";
import { parseSmartInputWithAi } from "@/lib/finance/aiService";
import { recognizeFinancialImageLocally } from "@/lib/finance/localImageOcr";
import {
  matchAccountByInstitution,
  matchAccountByHint,
  mergeAiWithDeterministicResult,
  normalizeText,
  parseBrazilianCurrency,
  parseDeterministicTransactions,
  type SmartParsedTransaction,
} from "@/lib/finance/smartInputParser";
import { findMemoryMatch, shiftDateToMonth, type MemoryTransaction } from "@/lib/finance/smartMemory";
import { emitFinanceSync } from "@/lib/financeSyncBus";
import { useVoiceDictation } from "@/hooks/use-voice-dictation";
import { useSmartChat } from "@/hooks/use-smart-chat";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

type PaymentMethod = "pix" | "boleto" | "credit" | "debit" | "cash";

interface DraftTx {
  id: string;
  type: "income" | "expense" | "transfer";
  role: "income" | "expense" | "transfer" | "investment_in" | "investment_out" | "yield" | "refund" | "fee";
  amount: number;
  description: string;
  date: string;
  payment_method: PaymentMethod | null;
  category_hint: string | null;
  category_id: string;
  account_id: string;
  counterpart_account_id: string;
  confidence: number;
  transfer_direction: "in" | "out" | null;
  institution: string | null;
  account_hint: string | null;
  learned_from_history: boolean;
  /** Lançamento recorrente mensal (conta fixa / receita fixa). */
  is_fixed: boolean;
}

const FIXED_PATTERN = /\b(fixa|fixo|fixas|fixos|mensal|mensalidade|todo mes|todos os meses|todo mês|recorrente|assinatura)\b/;
/** Receitas que costumam se repetir todo mês. */
const FIXED_INCOME_PATTERN = /\b(salario|salarios|aposentadoria|pensao|bolsa|aluguel recebido|pro labore|prolabore)\b/;

const detectFixedNature = (
  description: string,
  rawText: string,
  type: "income" | "expense" | "transfer" = "expense",
) => {
  const normalizedDescription = normalizeText(description || "");
  const normalizedInput = normalizeText(rawText || "");
  if (FIXED_PATTERN.test(normalizedDescription)) return true;
  if (type === "income" && FIXED_INCOME_PATTERN.test(`${normalizedDescription} ${normalizedInput}`)) return true;
  const entries = normalizedInput.split(/\n|;/).map((entry) => entry.trim()).filter(Boolean);
  if (normalizedDescription) {
    const line = entries.find((entry) => entry.includes(normalizedDescription));
    if (line) return FIXED_PATTERN.test(line);
  }
  // Entrada com um único lançamento: a marcação vale para ele.
  return entries.length <= 1 && FIXED_PATTERN.test(normalizedInput);
};

const uid = () => Math.random().toString(36).slice(2, 10);

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const normalizeLabel = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Conta padrão quando a IA não identifica: prefere "Conta Corrente",
// depois qualquer conta corrente, e só então a primeira da lista.
const findDefaultCheckingAccount = (accounts: any[]) => {
  const byName = accounts.find((a) => normalizeLabel(a?.name) === "conta corrente");
  if (byName) return byName;
  const byNameLoose = accounts.find((a) => normalizeLabel(a?.name).includes("corrente"));
  if (byNameLoose) return byNameLoose;
  return accounts.find((a) => a.type === "checking") || accounts[0];
};

const guessAccount = (
  accounts: any[],
  method: PaymentMethod | null,
  type: "income" | "expense" | "transfer",
  institution?: string | null,
): string => {
  if (!accounts.length) return "";
  if (institution) return matchAccountByInstitution(accounts, institution);
  if (type === "income") {
    return findDefaultCheckingAccount(accounts)?.id || "";
  }
  if (method === "credit") {
    return accounts.find((a) => a.type === "credit_card")?.id || "";
  }
  if (method === "cash") {
    return accounts.find((a) => a.type === "cash")?.id || findDefaultCheckingAccount(accounts)?.id || "";
  }
  return findDefaultCheckingAccount(accounts)?.id || "";
};

const formatDraftDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

const guessCounterpartAccount = (accounts: any[], sourceId: string, role: DraftTx["role"]) => {
  const candidates = accounts.filter((account) => account.id !== sourceId);
  if (role === "investment_in" || role === "investment_out") {
    return candidates.find((account) => account.type === "investment" || /invest|cofrinho|caixinha/i.test(account.name))?.id || "";
  }
  return candidates[0]?.id || "";
};

/** Mensagens do assistente podem trazer um bloco [TABELA] com colunas separadas por "|". */
const AssistantMessage: React.FC<{ content: string }> = ({ content }) => {
  const tableStart = content.indexOf("[TABELA]");
  if (tableStart < 0) {
    return <div className="whitespace-pre-line text-sm leading-relaxed text-foreground">{content}</div>;
  }
  const before = content.slice(0, tableStart).trim();
  const rest = content.slice(tableStart + "[TABELA]".length).split("\n").map((line) => line.trim());
  const rows: string[][] = [];
  let index = 0;
  while (index < rest.length && (rest[index] === "" || rest[index].includes("|"))) {
    if (rest[index].includes("|")) rows.push(rest[index].split("|"));
    index += 1;
  }
  const after = rest.slice(index).join("\n").trim();
  const [head, ...body] = rows;

  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground">
      {before && <p className="whitespace-pre-line">{before}</p>}
      {head && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-muted/60 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                {head.map((cell, cellIndex) => (
                  <th key={cell + cellIndex} className={cn("px-2.5 py-1.5", cellIndex === head.length - 1 && "text-right")}>
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={cn(
                        "px-2.5 py-1.5",
                        cellIndex === 1 && "font-medium",
                        cellIndex === row.length - 1
                          ? cn("whitespace-nowrap text-right font-semibold", cell.startsWith("+") ? "text-success" : cell.startsWith("-") ? "text-destructive" : "text-primary")
                          : "text-muted-foreground",
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {after && <p className="whitespace-pre-line">{after}</p>}
    </div>
  );
};

export const SmartAddDialog: React.FC<Props> = ({ open, onOpenChange, userId }) => {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<DraftTx[]>([]);
  const [stage, setStage] = useState<"input" | "review">("input");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<SmartCategoryOption[]>([]);
  const [classificationHistory, setClassificationHistory] = useState<SmartClassificationHistory[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<MemoryTransaction[]>([]);
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chat = useSmartChat(userId, open);
  const voice = useVoiceDictation({
    onTranscript: (transcript) => {
      setText((current) => (current.trim() ? `${current.trimEnd()} ${transcript}` : transcript));
      composerRef.current?.focus();
    },
    onError: (message) => toast.error(message),
  });


  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setText("");

    setImageDataUrl(null);
    setDrafts([]);
    setStage("input");
    setOptionsLoading(true);

    const loadOptions = async () => {
      const [accs, cats, history] = await Promise.all([
        supabase
          .from("accounts")
          .select("id, name, type, institution, current_balance")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("categories")
          .select("id, name, kind, color, parent_id")
          .eq("user_id", userId)
          .order("name"),
        supabase
          .from("transactions")
          .select("source, type, amount, category_id, account_id, payment_method, transaction_date, created_at")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .not("category_id", "is", null)
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (accs.error) throw accs.error;
      if (cats.error) throw cats.error;
      if (history.error) throw history.error;
      if (cancelled) return;
      setAccounts(accs.data || []);
      setCategories((cats.data || []) as SmartCategoryOption[]);
      setClassificationHistory((history.data || []) as SmartClassificationHistory[]);
      setMemoryHistory((history.data || []) as MemoryTransaction[]);
    };

    void loadOptions()
      .catch(() => {
        if (!cancelled) toast.error("Não foi possível carregar contas e categorias.");
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const handleImagePick = useCallback(async (file: File | undefined) => {
    if (!file) return false;
    if (!file.type.startsWith("image/")) {
      toast.error("O conteúdo colado não é uma imagem.");
      return false;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 8 MB)");
      return false;
    }
    try {
      const url = await fileToDataUrl(file);
      setImageDataUrl(url);
      return true;
    } catch {
      toast.error("Não foi possível abrir a imagem colada.");
      return false;
    }
  }, []);

  const handleDocumentPick = useCallback(async (file: File | undefined) => {
    if (!file) return false;
    if (file.type.startsWith("image/")) return handleImagePick(file);
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 15 MB).");
      return false;
    }
    setAttachmentLoading(true);
    try {
      const { readFileAsText, isPdfTextSufficient, renderPdfPagesToImages } = await import("@/lib/finance/imports");
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      let extracted = "";
      try {
        extracted = await readFileAsText(file);
      } catch {
        extracted = "";
      }

      if (isPdf && !isPdfTextSufficient(extracted)) {
        // PDF escaneado: a IA lê a primeira página como imagem.
        const pages = await renderPdfPagesToImages(file);
        if (pages.length > 0) {
          setImageDataUrl(pages[0].dataUrl);
          setAttachment(null);
          toast.success(`${file.name} anexado como imagem (documento escaneado).`);
          return true;
        }
      }

      const cleaned = extracted.replace(/\u0000/g, "").trim();
      if (!cleaned) {
        toast.error("Não consegui ler o conteúdo desse arquivo.");
        return false;
      }
      setAttachment({ name: file.name, text: cleaned.slice(0, 60000) });
      toast.success(`${file.name} anexado. Envie na conversa quando estiver pronto.`);
      return true;
    } catch {
      toast.error("Não foi possível abrir esse arquivo.");
      return false;
    } finally {
      setAttachmentLoading(false);
    }
  }, [handleImagePick]);

  useEffect(() => {
    if (!open || drafts.length > 0) return;

    const onPaste = (event: ClipboardEvent) => {
      const fileItem = Array.from(event.clipboardData?.items || []).find((item) => item.kind === "file");
      const pastedFile = fileItem?.getAsFile();
      if (!pastedFile) return;

      event.preventDefault();
      void handleDocumentPick(pastedFile);
    };

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [drafts.length, handleImagePick, open]);

  const runParse = async () => {
    const message = text.trim();
    const image = imageDataUrl;
    const mode = image ? "image" : "text";
    if (!message && !image) return;
    setLoading(true);
    void chat.append("user", image ? `${message || "Print enviado"} (imagem anexada)` : message);
    setText("");
    setImageDataUrl(null);
    try {
      const payload: any = { mode };
      if (message) payload.text = message;
      if (image) payload.imageDataUrl = image;
      const categoryById = new Map(categories.map((category) => [category.id, category]));
      payload.categories = categories.map((category) => ({
        name: category.name,
        kind: category.kind,
        parent: category.parent_id ? categoryById.get(category.parent_id)?.name || null : null,
      }));

      let localParsed = !image
        ? parseDeterministicTransactions(String(payload.text || ""), new Date())
        : [];
      let aiParsed: SmartParsedTransaction[] = [];
      let aiFailure: unknown = null;
      try {
        aiParsed = await parseSmartInputWithAi(payload);
      } catch (error) {
        aiFailure = error;
      }

      if (image && (aiFailure || aiParsed.length === 0)) {
        toast.info("A leitura online não encontrou dados. Tentando reconhecer o texto da imagem...");
        const recognizedText = await recognizeFinancialImageLocally(image);
        localParsed = parseDeterministicTransactions(recognizedText, new Date());
        if (localParsed.length) {
          console.info("[SmartAdd] Imagem reconhecida pelo OCR local.");
        }
      }


      let parsed: SmartParsedTransaction[] = aiParsed;
      if (localParsed.length > 0 && aiParsed.length === localParsed.length) {
        parsed = localParsed.map((local, index) => mergeAiWithDeterministicResult(aiParsed[index], local));
      } else if (localParsed.length > 1) {
        // Uma linha representa sempre um lançamento; não permita que a IA agrupe a lista.
        parsed = localParsed;
      } else if (localParsed.length === 1 && aiParsed.length <= 1) {
        parsed = [mergeAiWithDeterministicResult(aiParsed[0], localParsed[0])];
      }
      if (aiFailure && localParsed.length) {
        console.warn("[SmartAdd] IA indisponível; usando parser local.", aiFailure);
      } else if (localParsed.length && aiParsed.length === 0) {
        console.warn("[SmartAdd] IA retornou vazio após o retry; usando parser local.");
      } else if (aiFailure) {
        throw aiFailure;
      }
      if (!parsed.length) {
        void chat.append(
          "assistant",
          "Não consegui identificar um lançamento. Me diga o valor e o que foi, por exemplo: “luz 180 no dia 10”.",
        );
        return;
      }


      const newDrafts: DraftTx[] = parsed.map((t) => {
        const suggestedCategoryId = resolveSmartCategoryId({
          categories,
          description: String(t.description || ""),
          hint: t.category_hint,
          type: t.type,
        });
        const previous = resolveHistoricalClassification(classificationHistory, String(t.description || ""), t.type);
        const previousCategoryExists = Boolean(previous?.category_id && categories.some((category) => category.id === previous.category_id));
        const normalizedInput = normalizeText(String(payload.text || ""));
        const hasExplicitCategory = Boolean(
          t.category_hint && normalizedInput.includes(`categoria ${normalizeText(t.category_hint)}`),
        );
        const category_id = suggestedCategoryId && (hasExplicitCategory || !isGenericSmartCategoryId(categories, suggestedCategoryId))
          ? suggestedCategoryId
          : previousCategoryExists ? previous!.category_id! : suggestedCategoryId;
        const institution = t.institution || null;
        const previousAccountExists = Boolean(previous?.account_id && accounts.some((account) => account.id === previous.account_id));
        const explicitAccountId = matchAccountByHint(accounts, t.account_hint);
        const account_id = t.account_hint
          ? explicitAccountId
          : institution
            ? guessAccount(accounts, t.payment_method, t.type, institution)
            : previousAccountExists ? previous!.account_id : guessAccount(accounts, t.payment_method, t.type, institution);
        const role = t.role || (t.type === "transfer" ? "transfer" : t.type);

        // Memória: reaproveita o último lançamento com o mesmo nome (valor, conta,
        // categoria e dia) e traz a data para o mês atual quando o usuário não disser outro.
        const memory = findMemoryMatch(
          memoryHistory,
          `${t.description || ""} ${payload.text || ""}`,
          t.type,
        );
        const memoryAccountExists = Boolean(memory?.account_id && accounts.some((a) => a.id === memory.account_id));
        const memoryCategoryExists = Boolean(memory?.category_id && categories.some((c) => c.id === memory.category_id));
        const amount = Number(t.amount) > 0
          ? Number(t.amount)
          : memory?.amount ?? Number(t.amount);
        let date = t.date;
        if (!t.explicit_day && memory?.day && !t.explicit_month && !t.explicit_year) {
          date = shiftDateToMonth(memory.day, new Date());
        } else if (!t.explicit_month && !t.explicit_year && date < new Date().toISOString().slice(0, 7)) {
          const day = Number(date.slice(8, 10)) || 1;
          date = shiftDateToMonth(day, new Date());
        }
        const finalCategoryId = category_id || (memoryCategoryExists ? memory!.category_id! : "");
        const finalAccountId = account_id || (memoryAccountExists ? memory!.account_id! : "");

        return {
          id: uid(),
          type: t.type,
          role,
          amount,
          description: String(t.description),
          date,
          payment_method: t.payment_method || (previous?.payment_method as PaymentMethod | null) || (memory?.payment_method as PaymentMethod | null) || null,
          category_hint: t.category_hint,
          category_id: finalCategoryId,
          account_id: finalAccountId,
          counterpart_account_id: t.type === "transfer" ? guessCounterpartAccount(accounts, finalAccountId, role) : "",
          confidence: t.confidence ?? 0.7,
          transfer_direction: t.transfer_direction || null,
          institution,
          account_hint: t.account_hint || null,
          is_fixed: t.type !== "transfer" && detectFixedNature(String(t.description || ""), String(payload.text || ""), t.type),
          learned_from_history: Boolean(
            (previousCategoryExists && !hasExplicitCategory && (!suggestedCategoryId || isGenericSmartCategoryId(categories, suggestedCategoryId))) ||
            (!t.account_hint && !institution && previousAccountExists) ||
            (memory && (!account_id || !category_id || Number(t.amount) <= 0))
          ),
        };
      });
      setDrafts(newDrafts);
      setStage("input");
      const missing = newDrafts.filter((d) => !d.account_id).length;
      const reused = newDrafts.filter((d) => d.learned_from_history).length;
      const tabela = [
        "[TABELA]",
        "Data|Descrição|Categoria|Conta|Valor",
        ...newDrafts.map((d) => [
          formatDraftDate(d.date),
          `${d.description}${d.is_fixed ? " (todo mês)" : ""}`,
          categories.find((c) => c.id === d.category_id)?.name || d.category_hint || "Sem categoria",
          accounts.find((a) => a.id === d.account_id)?.name || "Escolher conta",
          `${d.type === "income" ? "+" : d.type === "expense" ? "-" : ""}${formatCurrency(d.amount)}`,
        ].join("|")),
      ].join("\n");
      const observacao = reused
        ? `\nUsei o último lançamento parecido como base${reused > 1 ? ` em ${reused} itens` : ""} e atualizei a data para o mês atual.`
        : "";
      void chat.append(
        "assistant",
        missing
          ? `${tabela}\n${observacao}\nFaltou a conta de ${missing === 1 ? "um lançamento" : `${missing} lançamentos`}. Toque em “Está certo” para ajustar e lançar.`
          : `${tabela}\n${observacao}\nEstá tudo certo? Se sim, é só confirmar que eu abro a tela de revisão para lançar.`,
      );
    } catch (err: any) {
      void chat.append("assistant", `Não consegui processar agora: ${err?.message || "erro desconhecido"}. Quer tentar de novo?`);
      toast.error(err?.message || "Erro ao processar com IA");
    } finally {

      setLoading(false);
    }
  };

  const updateDraft = (id: string, patch: Partial<DraftTx>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const removeDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const saveAll = async () => {
    if (!drafts.length) return;
    const missingAccount = drafts.find((d) => !d.account_id);
    if (missingAccount) {
      toast.error("Selecione uma conta para cada transação.");
      return;
    }
    const invalidTransfer = drafts.find((d) => d.type === "transfer" && (!d.counterpart_account_id || d.counterpart_account_id === d.account_id));
    if (invalidTransfer) {
      toast.error("Escolha contas de origem e destino diferentes para cada transferência.");
      return;
    }
    setSaving(true);
    try {
      // Lançamentos fixos viram recorrência mensal para repetir nos próximos meses.
      const recurrenceByDraft = new Map<string, string>();
      const fixedDrafts = drafts.filter((d) => d.is_fixed && d.type !== "transfer");
      if (fixedDrafts.length) {
        const { data: recurrenceRows, error: recurrenceError } = await supabase
          .from("recurrences")
          .insert(fixedDrafts.map((d) => ({
            user_id: userId,
            name: d.description,
            kind: d.type,
            frequency: "monthly" as const,
            amount: d.amount,
            day_of_month: Number(d.date.slice(8, 10)) || 1,
            start_date: d.date,
            account_id: d.account_id,
            category_id: d.category_id || null,
            is_active: true,
            auto_create: true,
            next_date: d.date,
            template_payload: { type: d.type, amount: d.amount, source: d.description },
          })))
          .select("id");
        if (recurrenceError) throw recurrenceError;
        (recurrenceRows || []).forEach((row: { id: string }, index: number) => {
          recurrenceByDraft.set(fixedDrafts[index].id, row.id);
        });
      }

      const rows: any[] = [];
      drafts.forEach((d) => {
        rows.push({
          recurrence_id: recurrenceByDraft.get(d.id) || null,
          user_id: userId,
          account_id: d.account_id,
          counterpart_account_id: d.type === "transfer" ? d.counterpart_account_id : null,
          category_id: d.category_id || null,
          type: d.type,
          amount: d.amount,
          transaction_date: d.date,
          due_date: d.date,
          status: "pending",
          source: d.description,
          payment_method: d.payment_method,
          transaction_role: d.role,
          purchase_date: d.date,
          competence_month: d.date.slice(0, 7),
          source_origin: "smart_add",
          is_reviewed: true,
          metadata: {
            aiConfidence: d.confidence,
            transferDirection: d.transfer_direction,
            nature: d.is_fixed ? "fixed" : "variable",
          },
          notes: null,
        });
      });

      const { error } = await supabase.from("transactions").insert(rows);
      if (error) throw error;

      toast.success(rows.length === 1 ? "Lançamento salvo!" : `${rows.length} lançamentos salvos!`);
      void chat.append(
        "assistant",
        rows.length === 1 ? "Pronto, lancei para você. Quer registrar mais alguma coisa?" : `Pronto, lancei ${rows.length} itens. Quer registrar mais alguma coisa?`,
      );

      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["finance-summary"] });
      try {
        emitFinanceSync({ userId });
      } catch {
        // noop
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err?.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const canParse = useMemo(() => {
    if (loading || optionsLoading) return false;
    return text.trim().length > 2 || !!imageDataUrl;
  }, [text, imageDataUrl, loading, optionsLoading]);

  useEffect(() => {
    if (stage === "input") messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [chat.messages, stage, loading]);


  const totalLaunches = drafts.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b bg-gradient-to-br from-primary/5 to-transparent px-5 py-4">
          <DialogTitle className="flex items-center justify-between gap-2 font-heading text-lg">
            <span className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Adicionar Inteligente
            </span>
            {stage === "input" && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground"
                onClick={() => void chat.clear()}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Nova conversa
              </Button>
            )}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Escreva, fale ou envie um print. Eu organizo e você confirma antes de lançar.
          </p>
        </DialogHeader>

        <div className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4">
          {drafts.length === 0 || stage === "input" ? (
            <div className="flex flex-col gap-3">
              <div className="flex max-h-[45vh] min-h-[220px] flex-col gap-3 overflow-y-auto pr-1">
                {chat.messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                  >
                    {message.role === "user" ? (
                      <div className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm leading-relaxed text-primary-foreground">
                        {message.content}
                      </div>
                    ) : (
                      <div className="max-w-[92%]">
                        <AssistantMessage content={message.content} />
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando...
                  </p>
                )}
                <div ref={messagesEndRef} />
              </div>

              {drafts.length > 0 && !loading && (
                <div className="flex flex-col gap-2 rounded-2xl border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {drafts.length === 1 ? "1 lançamento pronto" : `${drafts.length} lançamentos prontos`} · total{" "}
                    <span className="font-semibold text-foreground">
                      {formatCurrency(drafts.reduce((sum, d) => sum + (d.type === "income" ? d.amount : -d.amount), 0))}
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDrafts([])}>
                      Ajustar no texto
                    </Button>
                    <Button
                      size="sm"
                      className="gradient-primary text-primary-foreground"
                      onClick={() => setStage("review")}
                    >
                      Está certo, revisar e lançar
                    </Button>
                  </div>
                </div>
              )}


              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => handleImagePick(e.target.files?.[0])}
              />

              {imageDataUrl && (
                <div className="relative w-fit overflow-hidden rounded-xl border bg-muted">
                  <img src={imageDataUrl} alt="Comprovante" className="max-h-32 object-contain" />
                  <button
                    type="button"
                    onClick={() => setImageDataUrl(null)}
                    aria-label="Remover imagem"
                    className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="rounded-2xl border bg-card p-2 shadow-sm">
                <Textarea
                  ref={composerRef}
                  placeholder="Ex.: salário de 7.000 todo dia 5"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  className="resize-none border-0 p-2 text-sm shadow-none focus-visible:ring-0"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (canParse) void runParse();
                    }
                  }}
                />
                <div className="flex items-center justify-between gap-2 px-1 pb-1">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Enviar imagem"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant={voice.recording ? "destructive" : "ghost"}
                      size="icon"
                      className="h-9 w-9 rounded-full"
                      disabled={voice.transcribing}
                      aria-label={voice.recording ? "Parar gravação" : "Falar lançamento"}
                      onClick={() => (voice.recording ? void voice.stop() : void voice.start())}
                    >
                      {voice.transcribing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : voice.recording ? (
                        <Square className="h-4 w-4" />
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                    </Button>
                    {voice.recording && (
                      <span className="ml-1 flex items-center gap-1" aria-hidden>
                        {[0, 1, 2, 3, 4].map((bar) => (
                          <span
                            key={bar}
                            className="w-1 rounded-full bg-primary transition-all duration-100"
                            style={{ height: `${6 + Math.min(1, voice.level * (1 + bar * 0.4)) * 18}px` }}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    className="h-9 w-9 rounded-full gradient-primary text-primary-foreground"
                    disabled={!canParse}
                    onClick={() => void runParse()}
                    aria-label="Enviar"
                  >
                    {loading || optionsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Dica: cole um print com Ctrl + V aqui. Cada linha vira um lançamento separado.
              </p>
            </div>

          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {drafts.length === 1
                    ? "Transação para revisar"
                    : `${drafts.length} transações para revisar`}
                </p>
                <Button variant="ghost" size="sm" onClick={() => setStage("input")}>
                  Voltar à conversa
                </Button>
              </div>

              <div className="space-y-2">
                {drafts.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-xl border bg-card p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {d.type === "income" ? (
                          <ArrowUpCircle className="h-4 w-4 text-success" />
                        ) : d.type === "expense" ? (
                          <ArrowDownCircle className="h-4 w-4 text-destructive" />
                        ) : (
                          <ArrowDownCircle className="h-4 w-4 rotate-90 text-primary" />
                        )}
                        <Select value={d.type} onValueChange={(value) => {
                          const type = value as DraftTx["type"];
                          const accountId = guessAccount(accounts, d.payment_method, type, d.institution);
                          updateDraft(d.id, {
                            type,
                            role: type === "transfer" ? "transfer" : type,
                            category_id: resolveSmartCategoryId({ categories, description: d.description, hint: d.category_hint, type }),
                            account_id: accountId,
                            counterpart_account_id: type === "transfer" ? guessCounterpartAccount(accounts, accountId, "transfer") : "",
                            is_fixed: type === "transfer" ? false : d.is_fixed,
                            learned_from_history: false,
                          });
                        }}>
                          <SelectTrigger className="h-7 w-32 text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="expense">Despesa</SelectItem>
                            <SelectItem value="income">Receita</SelectItem>
                            <SelectItem value="transfer">Transferência</SelectItem>
                          </SelectContent>
                        </Select>
                        {d.type !== "transfer" && (
                          <Select
                            value={d.is_fixed ? "fixed" : "variable"}
                            onValueChange={(value) => updateDraft(d.id, { is_fixed: value === "fixed" })}
                          >
                            <SelectTrigger className="h-7 w-28 text-[11px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="variable">Variável</SelectItem>
                              <SelectItem value="fixed">Fixa</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {d.confidence < 0.6 && (
                          <Badge variant="outline" className="text-[10px]">
                            Revisar sugestão
                          </Badge>
                        )}
                      </div>
                      <button
                        onClick={() => removeDraft(d.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remover transação"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <Label className="text-[10px] text-muted-foreground">Descrição</Label>
                        <Input
                          value={d.description}
                          onChange={(e) => updateDraft(d.id, { description: e.target.value })}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Valor</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={String(d.amount).replace(".", ",")}
                          onChange={(e) => {
                            const n = parseBrazilianCurrency(e.target.value) || 0;
                            updateDraft(d.id, { amount: n });
                          }}
                          className="h-9 font-semibold"
                        />
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {formatCurrency(d.amount)}
                        </p>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Data</Label>
                        <Input
                          type="date"
                          value={d.date}
                          onChange={(e) => updateDraft(d.id, { date: e.target.value })}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">{d.type === "transfer" ? "Conta de origem" : "Conta"}</Label>
                        <Select
                          value={d.account_id || "none"}
                          onValueChange={(v) => updateDraft(d.id, { account_id: v === "none" ? "" : v })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Conta" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Selecione</SelectItem>
                            {accounts.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {d.account_hint && (
                          <p className={cn("mt-1 text-[10px]", d.account_id ? "text-success" : "text-destructive")}>
                            {d.account_id
                              ? `Conta identificada pelo texto: ${d.account_hint}`
                              : `Conta “${d.account_hint}” não encontrada. Selecione uma conta.`}
                          </p>
                        )}
                      </div>
                      {d.type === "transfer" && (
                        <div className="col-span-2">
                          <Label className="text-[10px] text-muted-foreground">Conta de destino</Label>
                          <Select value={d.counterpart_account_id || "none"} onValueChange={(value) => updateDraft(d.id, { counterpart_account_id: value === "none" ? "" : value })}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Destino" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Selecione</SelectItem>
                              {accounts.filter((account) => account.id !== d.account_id).map((account) => (
                                <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Transferências, aplicações e resgates não alteram receitas nem despesas.
                          </p>
                        </div>
                      )}
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Categoria</Label>
                        <Select
                          value={d.category_id || "none"}
                          onValueChange={(v) => updateDraft(d.id, { category_id: v === "none" ? "" : v })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem categoria</SelectItem>
                            {categories
                              .filter((c) => c.kind === d.type)
                              .map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        {d.category_hint && !d.category_id && (
                          <p className="mt-0.5 text-[10px] text-primary">
                            IA sugeriu: {d.category_hint}
                          </p>
                        )}
                        {d.learned_from_history && (
                          <p className="mt-1 text-[10px] text-success">
                            Repetimos a classificação do último lançamento com este nome.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                onClick={saveAll}
                disabled={saving}
                className="h-11 w-full gap-2 gradient-primary text-primary-foreground"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    {totalLaunches === 1
                      ? "Salvar lançamento"
                      : `Salvar ${totalLaunches} lançamentos`}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
