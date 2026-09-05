import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Type as TypeIcon,
  ClipboardPaste,
  ImageIcon,
  Loader2,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
  Wand2,
  Mic,
  Square,
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
import { emitFinanceSync } from "@/lib/financeSyncBus";

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
}

const uid = () => Math.random().toString(36).slice(2, 10);

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const guessAccount = (
  accounts: any[],
  method: PaymentMethod | null,
  type: "income" | "expense" | "transfer",
  institution?: string | null,
): string => {
  if (!accounts.length) return "";
  if (institution) return matchAccountByInstitution(accounts, institution);
  if (type === "income") {
    return accounts.find((a) => a.type === "checking")?.id || accounts[0].id;
  }
  if (method === "credit") {
    return accounts.find((a) => a.type === "credit_card")?.id || "";
  }
  if (method === "cash") {
    return accounts.find((a) => a.type === "cash")?.id || accounts[0].id;
  }
  return accounts.find((a) => a.type === "checking")?.id || accounts[0].id;
};

const guessCounterpartAccount = (accounts: any[], sourceId: string, role: DraftTx["role"]) => {
  const candidates = accounts.filter((account) => account.id !== sourceId);
  if (role === "investment_in" || role === "investment_out") {
    return candidates.find((account) => account.type === "investment" || /invest|cofrinho|caixinha/i.test(account.name))?.id || "";
  }
  return candidates[0]?.id || "";
};

export const SmartAddDialog: React.FC<Props> = ({ open, onOpenChange, userId }) => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"text" | "paste" | "image">("text");
  const [text, setText] = useState("");
  const [pasted, setPasted] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<DraftTx[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<SmartCategoryOption[]>([]);
  const [classificationHistory, setClassificationHistory] = useState<SmartClassificationHistory[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTab("text");
    setText("");
    setPasted("");
    setImageDataUrl(null);
    setDrafts([]);
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
          .select("source, type, category_id, account_id, payment_method, transaction_date, created_at")
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

  useEffect(() => {
    if (!open || drafts.length > 0) return;

    const onPaste = (event: ClipboardEvent) => {
      const imageItem = Array.from(event.clipboardData?.items || [])
        .find((item) => item.kind === "file" && item.type.startsWith("image/"));
      const imageFile = imageItem?.getAsFile();
      if (!imageFile) return;

      event.preventDefault();
      void handleImagePick(imageFile).then((accepted) => {
        if (!accepted) return;
        setTab("image");
        toast.success("Print colado! Confira a imagem e processe quando estiver pronto.");
      });
    };

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [drafts.length, handleImagePick, open]);

  const runParse = async () => {
    setLoading(true);
    try {
      const payload: any = { mode: tab };
      if (tab === "text") payload.text = text.trim();
      if (tab === "paste") payload.text = pasted.trim();
      if (tab === "image") payload.imageDataUrl = imageDataUrl;
      const categoryById = new Map(categories.map((category) => [category.id, category]));
      payload.categories = categories.map((category) => ({
        name: category.name,
        kind: category.kind,
        parent: category.parent_id ? categoryById.get(category.parent_id)?.name || null : null,
      }));

      if ((tab !== "image" && !payload.text) || (tab === "image" && !payload.imageDataUrl)) {
        toast.error("Adicione conteúdo antes de processar");
        return;
      }

      let localParsed = tab !== "image"
        ? parseDeterministicTransactions(String(payload.text), new Date())
        : [];
      let aiParsed: SmartParsedTransaction[] = [];
      let aiFailure: unknown = null;
      try {
        aiParsed = await parseSmartInputWithAi(payload);
      } catch (error) {
        aiFailure = error;
      }

      if (tab === "image" && imageDataUrl && (aiFailure || aiParsed.length === 0)) {
        toast.info("A leitura online não encontrou dados. Tentando reconhecer o texto da imagem...");
        const recognizedText = await recognizeFinancialImageLocally(imageDataUrl);
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
        toast.info("Nenhuma transação identificada. Tente com mais detalhes.");
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
        return {
          id: uid(),
          type: t.type,
          role,
          amount: Number(t.amount),
          description: String(t.description),
          date: t.date,
          payment_method: t.payment_method || (previous?.payment_method as PaymentMethod | null) || null,
          category_hint: t.category_hint,
          category_id,
          account_id,
          counterpart_account_id: t.type === "transfer" ? guessCounterpartAccount(accounts, account_id, role) : "",
          confidence: t.confidence ?? 0.7,
          transfer_direction: t.transfer_direction || null,
          institution,
          account_hint: t.account_hint || null,
          learned_from_history: Boolean(
            (previousCategoryExists && !hasExplicitCategory && (!suggestedCategoryId || isGenericSmartCategoryId(categories, suggestedCategoryId))) ||
            (!t.account_hint && !institution && previousAccountExists)
          ),
        };
      });
      setDrafts(newDrafts);
      toast.success(
        newDrafts.length === 1
          ? "Transação reconhecida. Revise e salve."
          : `${newDrafts.length} transações reconhecidas. Revise e salve.`,
      );
    } catch (err: any) {
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
      const rows: any[] = [];
      drafts.forEach((d) => {
        rows.push({
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
          metadata: { aiConfidence: d.confidence, transferDirection: d.transfer_direction },
          notes: null,
        });
      });

      const { error } = await supabase.from("transactions").insert(rows);
      if (error) throw error;

      toast.success(rows.length === 1 ? "Lançamento salvo!" : `${rows.length} lançamentos salvos!`);
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
    if (tab === "text") return text.trim().length > 3;
    if (tab === "paste") return pasted.trim().length > 3;
    return !!imageDataUrl;
  }, [tab, text, pasted, imageDataUrl, loading, optionsLoading]);

  const totalLaunches = drafts.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b bg-gradient-to-br from-primary/5 to-transparent px-5 py-4">
          <DialogTitle className="flex items-center gap-2 font-heading text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Adicionar por texto ou imagem
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Informe o essencial. O sistema sugere os campos e você confirma antes de salvar.
          </p>
        </DialogHeader>

        <div className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4">
          {drafts.length === 0 ? (
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
                <ClipboardPaste className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p><strong>Colar um print:</strong> use <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">Win + Shift + S</kbd> e depois <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">Ctrl + V</kbd> nesta janela.</p>
              </div>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="text" className="gap-1.5">
                  <TypeIcon className="h-3.5 w-3.5" /> Texto
                </TabsTrigger>
                <TabsTrigger value="paste" className="gap-1.5">
                  <ClipboardPaste className="h-3.5 w-3.5" /> Colar texto
                </TabsTrigger>
                <TabsTrigger value="image" className="gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" /> Imagem
                </TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="mt-4 space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Digite ou fale um lançamento por linha. Você pode adicionar quantos precisar.
                </Label>
                <Textarea
                  placeholder={"TIM Conta 62\nEnergia Conta 300\nInternet 99,90"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  className="resize-none"
                  autoFocus
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={voice.recording ? "destructive" : "outline"}
                    size="sm"
                    className="gap-2 rounded-full"
                    disabled={voice.transcribing}
                    onClick={() => (voice.recording ? void voice.stop() : void voice.start())}
                  >
                    {voice.transcribing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Transcrevendo...
                      </>
                    ) : voice.recording ? (
                      <>
                        <Square className="h-4 w-4" /> Parar e transcrever
                      </>
                    ) : (
                      <>
                        <Mic className="h-4 w-4" /> Falar lançamento
                      </>
                    )}
                  </Button>
                  {voice.recording && (
                    <>
                      <span className="flex items-center gap-1" aria-hidden>
                        {[0, 1, 2, 3, 4].map((bar) => (
                          <span
                            key={bar}
                            className="w-1 rounded-full bg-primary transition-all duration-100"
                            style={{ height: `${6 + Math.min(1, voice.level * (1 + bar * 0.4)) * 18}px` }}
                          />
                        ))}
                      </span>
                      <Button type="button" variant="ghost" size="sm" onClick={voice.cancel}>
                        Cancelar
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Ex.: “gastei 45 no Uber ontem e paguei a conta de luz de 180 no boleto”. Cada linha será cadastrada separadamente e você revisa tudo antes de salvar.
                </p>
              </TabsContent>


              <TabsContent value="paste" className="mt-4 space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Cole uma lista com um lançamento por linha. Revise todos os valores antes de salvar.
                </Label>
                <Textarea
                  placeholder={"TIM Conta 62\nEnergia Conta 300\nInternet 99,90"}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={8}
                  className="resize-none font-mono text-xs"
                />
              </TabsContent>

              <TabsContent value="image" className="mt-4 space-y-3">
                <Label className="text-xs text-muted-foreground">
                  Cole com Ctrl + V ou selecione um print com instituição, total e mês visíveis. Nada será salvo sem sua revisão.
                </Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => handleImagePick(e.target.files?.[0])}
                />
                {imageDataUrl ? (
                  <div className="space-y-2">
                    <div className="relative overflow-hidden rounded-xl border bg-muted">
                      <img src={imageDataUrl} alt="Comprovante" className="max-h-72 w-full object-contain" />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                        Trocar imagem
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setImageDataUrl(null)}>
                        Remover
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-sm font-medium">Selecionar ou tirar foto</span>
                    <span className="text-xs">PNG, JPG até 8 MB</span>
                  </button>
                )}
              </TabsContent>

              <Button
                onClick={runParse}
                disabled={!canParse}
                className="mt-4 h-11 w-full gap-2 gradient-primary text-primary-foreground"
              >
                {loading || optionsLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {optionsLoading ? "Preparando..." : "Analisando..."}
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Processar com IA
                  </>
                )}
              </Button>
            </Tabs>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {drafts.length === 1
                    ? "Transação para revisar"
                    : `${drafts.length} transações para revisar`}
                </p>
                <Button variant="ghost" size="sm" onClick={() => setDrafts([])}>
                  Voltar
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
