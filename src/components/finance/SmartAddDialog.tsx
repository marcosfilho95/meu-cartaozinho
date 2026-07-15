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
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/constants";
import { normalizeLabel } from "@/lib/financeShared";

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

const matchCategory = (
  categories: any[],
  hint: string | null,
  type: "income" | "expense",
): string => {
  if (!hint) return "";
  const n = normalizeLabel(hint);
  const pool = categories.filter((c: any) => c.kind === type);
  const exact = pool.find((c: any) => normalizeLabel(c.name) === n);
  if (exact) return exact.id;
  const partial = pool.find((c: any) => normalizeLabel(c.name).includes(n) || n.includes(normalizeLabel(c.name)));
  return partial?.id || "";
};

export const SmartAddDialog: React.FC<Props> = ({ open, onOpenChange, userId }) => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"text" | "paste" | "image">("text");
  const [text, setText] = useState("");
  const [pasted, setPasted] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<DraftTx[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTab("text");
    setText("");
    setPasted("");
    setImageDataUrl(null);
    setDrafts([]);
    (async () => {
      const [accs, cats] = await Promise.all([
        supabase
          .from("accounts")
          .select("id, name, type, institution, current_balance")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("categories")
          .select("id, name, kind, color")
          .eq("user_id", userId)
          .order("name"),
      ]);
      setAccounts(accs.data || []);
      setCategories(cats.data || []);
    })();
  }, [open, userId]);

  const handleImagePick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 8MB)");
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

      if ((tab !== "image" && !payload.text) || (tab === "image" && !payload.imageDataUrl)) {
        toast.error("Adicione conteúdo antes de processar");
        setLoading(false);
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
        setLoading(false);
        return;
      }

      const newDrafts: DraftTx[] = parsed.map((t) => {
        const category_id = matchCategory(categories, t.category_hint, t.type);
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
      toast.success(`${newDrafts.length} transação(ões) reconhecida(s). Revise e salve.`);
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
      toast.error("Selecione a conta em todas as transações");
      return;
    }
    setSaving(true);
    try {
      const rows: any[] = [];
      drafts.forEach((d) => {
        const count = d.installments && d.installments > 1 ? d.installments : 1;
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

      toast.success(`${rows.length} lançamento(s) salvos!`);
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
    if (loading) return false;
    if (tab === "text") return text.trim().length > 3;
    if (tab === "paste") return pasted.trim().length > 3;
    return !!imageDataUrl;
  }, [tab, text, pasted, imageDataUrl, loading]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b bg-gradient-to-br from-primary/5 to-transparent px-5 py-4">
          <DialogTitle className="flex items-center gap-2 font-heading text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Adicionar com IA
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Descreva, cole ou fotografe — a IA organiza os lançamentos pra você.
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
                  Foto de comprovante, print de PIX, cupom fiscal.
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
                    <span className="text-xs">PNG, JPG até 8MB</span>
                  </button>
                )}
              </TabsContent>

              <Button
                onClick={runParse}
                disabled={!canParse}
                className="mt-4 h-11 w-full gap-2 gradient-primary text-primary-foreground"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analisando...
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
                  {drafts.length} transação(ões) para revisar
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
                          onClick={() =>
                            updateDraft(d.id, { type: d.type === "income" ? "expense" : "income" })
                          }
                          className="text-[11px] text-muted-foreground underline decoration-dotted"
                        >
                          alternar
                        </button>
                        {d.confidence < 0.6 && (
                          <Badge variant="outline" className="text-[10px]">
                            revisar
                          </Badge>
                        )}
                      </div>
                      <button
                        onClick={() => removeDraft(d.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remover"
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
                  <>Salvar {drafts.length} lançamento(s)</>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};