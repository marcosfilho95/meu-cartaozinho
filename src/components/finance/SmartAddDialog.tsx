import React, { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/constants";
import {
  resolveSmartCategoryId,
  type SmartCategoryOption,
} from "@/lib/financeSmartClassification";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

type PaymentMethod = "pix" | "boleto" | "credit" | "debit" | "cash";

interface DraftTx {
  id: string;
  type: "income" | "expense";
  amount: number;
  description: string;
  date: string;
  payment_method: PaymentMethod | null;
  category_hint: string | null;
  category_id: string;
  account_id: string;
  installments: number | null;
  confidence: number;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const getInstallmentCount = (installments: number | null) => {
  if (!Number.isInteger(installments) || Number(installments) <= 1) return 1;
  return Math.min(Number(installments), 120);
};

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
  type: "income" | "expense",
): string => {
  if (!accounts.length) return "";
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
      const [accs, cats] = await Promise.all([
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
      ]);
      if (accs.error) throw accs.error;
      if (cats.error) throw cats.error;
      if (cancelled) return;
      setAccounts(accs.data || []);
      setCategories((cats.data || []) as SmartCategoryOption[]);
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

  const handleImagePick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 8 MB)");
      return;
    }
    const url = await fileToDataUrl(file);
    setImageDataUrl(url);
  };

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

      const { data, error } = await supabase.functions.invoke("smart-parse", {
        body: payload,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const parsed = (data?.transactions || []) as any[];
      if (!parsed.length) {
        toast.info("Nenhuma transação identificada. Tente com mais detalhes.");
        return;
      }

      const newDrafts: DraftTx[] = parsed.map((t) => {
        const category_id = resolveSmartCategoryId({
          categories,
          description: String(t.description || ""),
          hint: t.category_hint,
          type: t.type,
        });
        const account_id = guessAccount(accounts, t.payment_method, t.type);
        return {
          id: uid(),
          type: t.type,
          amount: Number(t.amount),
          description: String(t.description),
          date: t.date,
          payment_method: t.payment_method,
          category_hint: t.category_hint,
          category_id,
          account_id,
          installments: t.installments,
          confidence: t.confidence ?? 0.7,
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
    setSaving(true);
    try {
      const rows: any[] = [];
      drafts.forEach((d) => {
        const count = getInstallmentCount(d.installments);
        for (let i = 0; i < count; i += 1) {
          const due = new Date(`${d.date}T12:00:00`);
          due.setMonth(due.getMonth() + i);
          const y = due.getFullYear();
          const m = String(due.getMonth() + 1).padStart(2, "0");
          const dd = String(due.getDate()).padStart(2, "0");
          const dueStr = `${y}-${m}-${dd}`;
          rows.push({
            user_id: userId,
            account_id: d.account_id,
            category_id: d.category_id || null,
            type: d.type,
            amount: d.amount,
            transaction_date: dueStr,
            due_date: dueStr,
            status: "pending",
            source: count > 1 ? `${d.description} (${i + 1}/${count})` : d.description,
            payment_method: d.payment_method,
            notes: null,
          });
        }
      });

      const { error } = await supabase.from("transactions").insert(rows);
      if (error) throw error;

      toast.success(rows.length === 1 ? "Lançamento salvo!" : `${rows.length} lançamentos salvos!`);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["finance-summary"] });
      try {
        window.dispatchEvent(new CustomEvent("finance-sync-updated", { detail: { userId } }));
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

  const totalLaunches = useMemo(
    () => drafts.reduce((total, draft) => total + getInstallmentCount(draft.installments), 0),
    [drafts],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b bg-gradient-to-br from-primary/5 to-transparent px-5 py-4">
          <DialogTitle className="flex items-center gap-2 font-heading text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Adicionar com IA
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Descreva, cole ou fotografe — a IA organiza os lançamentos para você.
          </p>
        </DialogHeader>

        <div className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4">
          {drafts.length === 0 ? (
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="text" className="gap-1.5">
                  <TypeIcon className="h-3.5 w-3.5" /> Texto
                </TabsTrigger>
                <TabsTrigger value="paste" className="gap-1.5">
                  <ClipboardPaste className="h-3.5 w-3.5" /> Colar
                </TabsTrigger>
                <TabsTrigger value="image" className="gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" /> Foto
                </TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="mt-4 space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Escreva naturalmente. Ex: "gastei 45 no uber ontem", "salário 3200 caiu hoje", "netflix 39,90 no crédito parcelado em 12x"
                </Label>
                <Textarea
                  placeholder="Digite uma ou várias transações..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  className="resize-none"
                  autoFocus
                />
              </TabsContent>

              <TabsContent value="paste" className="mt-4 space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Cole um extrato, fatura ou lista de transações. A IA identifica tudo.
                </Label>
                <Textarea
                  placeholder="Cole o texto aqui..."
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={8}
                  className="resize-none font-mono text-xs"
                />
              </TabsContent>

              <TabsContent value="image" className="mt-4 space-y-3">
                <Label className="text-xs text-muted-foreground">
                  Envie uma foto de comprovante, uma captura de tela de PIX ou um cupom fiscal.
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
                        ) : (
                          <ArrowDownCircle className="h-4 w-4 text-destructive" />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const type = d.type === "income" ? "expense" : "income";
                            updateDraft(d.id, {
                              type,
                              category_id: resolveSmartCategoryId({
                                categories,
                                description: d.description,
                                hint: d.category_hint,
                                type,
                              }),
                              account_id: guessAccount(accounts, d.payment_method, type),
                            });
                          }}
                          className="text-[11px] text-muted-foreground underline decoration-dotted"
                        >
                          {d.type === "income" ? "Marcar como despesa" : "Marcar como receita"}
                        </button>
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
                            const n = parseFloat(e.target.value.replace(",", ".")) || 0;
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
                        <Label className="text-[10px] text-muted-foreground">Conta</Label>
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
                      </div>
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
                      </div>
                      {d.installments && d.installments > 1 && (
                        <div className="col-span-2 rounded-lg bg-primary/5 px-2 py-1 text-[11px] text-primary">
                          Parcelado em {d.installments}x de {formatCurrency(d.amount)}
                        </div>
                      )}
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
