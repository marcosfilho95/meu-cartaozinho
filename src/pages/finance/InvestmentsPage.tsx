import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, TrendingUp, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/constants";
import { fetchReferenceRates, type ReferenceRate } from "@/lib/goalProjections";
import { estimateFixedIncome, getFixedIncomeAnnualRate, type FixedIncomeIndexer } from "@/lib/investments";
import { getErrorMessage, untypedSupabase } from "@/lib/supabaseUntyped";

type Investment = {
  id: string; issuer: string; title_type: string; indexer: FixedIncomeIndexer; rate_percent: number;
  liquidity_daily: boolean; maturity_date: string | null; started_at: string; taxable: boolean;
};
type InvestmentTx = { investment_id: string; transaction_type: "buy" | "sell"; amount: number };

const titleLabels: Record<string, string> = { cdb: "CDB", rdb: "RDB / Caixinha", treasury_selic: "Tesouro Selic", lci: "LCI", lca: "LCA", other: "Outro" };
const today = () => new Date().toISOString().slice(0, 10);
const parseNumber = (value: string) => Number(value.replace(/\./g, "").replace(",", ".")) || 0;

export default function InvestmentsPage({ userId }: { userId: string }) {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [transactions, setTransactions] = useState<InvestmentTx[]>([]);
  const [rates, setRates] = useState<ReferenceRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [sellInvestment, setSellInvestment] = useState<Investment | null>(null);
  const [saving, setSaving] = useState(false);
  const [issuer, setIssuer] = useState("");
  const [titleType, setTitleType] = useState("cdb");
  const [indexer, setIndexer] = useState<FixedIncomeIndexer>("cdi");
  const [rate, setRate] = useState("100");
  const [amount, setAmount] = useState("");
  const [startedAt, setStartedAt] = useState(today());
  const [maturity, setMaturity] = useState("");
  const [liquidityDaily, setLiquidityDaily] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [positions, movements, referenceRates] = await Promise.all([
        untypedSupabase.from("investments").select("*").eq("user_id", userId).order("started_at", { ascending: false }),
        untypedSupabase.from("investment_transactions").select("investment_id, transaction_type, amount").eq("user_id", userId),
        fetchReferenceRates(),
      ]);
      if (positions.error) throw positions.error;
      if (movements.error) throw movements.error;
      setInvestments((positions.data || []) as Investment[]);
      setTransactions((movements.data || []) as InvestmentTx[]);
      setRates(referenceRates);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível carregar seus investimentos."));
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => investments.map((investment) => {
    const principal = transactions.filter((tx) => tx.investment_id === investment.id)
      .reduce((total, tx) => total + (tx.transaction_type === "sell" ? -Number(tx.amount) : Number(tx.amount)), 0);
    const annualRate = getFixedIncomeAnnualRate(investment.indexer, Number(investment.rate_percent), rates);
    const estimate = estimateFixedIncome({ principal, annualRate, startedAt: investment.started_at, taxable: investment.taxable });
    return { investment, principal: Math.max(principal, 0), annualRate, estimate };
  }), [investments, rates, transactions]);

  const totals = rows.reduce((total, row) => ({
    principal: total.principal + row.principal,
    gross: total.gross + row.estimate.grossYield,
    net: total.net + row.estimate.estimatedValue,
  }), { principal: 0, gross: 0, net: 0 });

  const save = async () => {
    const applied = parseNumber(amount);
    const rateValue = parseNumber(rate);
    if (!applied || (!sellInvestment && (!issuer.trim() || rateValue < 0))) { toast.error("Informe os campos obrigatórios."); return; }
    const availablePrincipal = sellInvestment ? rows.find((row) => row.investment.id === sellInvestment.id)?.principal || 0 : 0;
    if (sellInvestment && applied > availablePrincipal) { toast.error("O resgate não pode superar o valor aplicado registrado."); return; }
    setSaving(true);
    try {
      if (sellInvestment) {
        const { error } = await untypedSupabase.from("investment_transactions").insert({
          user_id: userId, investment_id: sellInvestment.id, transaction_type: "sell", amount: applied, transaction_date: startedAt,
        });
        if (error) throw error;
        toast.success("Resgate registrado.");
        setOpen(false); setSellInvestment(null); setAmount("");
        await load();
        return;
      }
      const { data, error } = await untypedSupabase.from("investments").insert({
        user_id: userId, issuer: issuer.trim(), title_type: titleType, indexer, rate_percent: rateValue,
        liquidity_daily: liquidityDaily, maturity_date: maturity || null, started_at: startedAt,
        taxable: !["lci", "lca"].includes(titleType),
      }).select("id").single();
      if (error) throw error;
      const investmentId = (data as { id: string }).id;
      const { error: movementError } = await untypedSupabase.from("investment_transactions").insert({
        user_id: userId, investment_id: investmentId, transaction_type: "buy", amount: applied, transaction_date: startedAt,
      });
      if (movementError) throw movementError;
      toast.success("Aplicação registrada.");
      setOpen(false); setIssuer(""); setAmount(""); setMaturity(""); setRate("100");
      await load();
    } catch (error) { toast.error(getErrorMessage(error, "Não foi possível salvar a aplicação.")); }
    finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-6xl space-y-5 px-4 pb-24">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-heading text-2xl font-semibold">Investimentos</h1><p className="text-sm text-muted-foreground">Renda fixa com valor aplicado e rendimento líquido estimado.</p></div><Button onClick={() => { setSellInvestment(null); setOpen(true); }} className="gap-2"><Plus className="h-4 w-4" /> Adicionar lançamento</Button></div>
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Aplicado</p><p className="mt-1 text-xl font-semibold">{formatCurrency(totals.principal)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Rendimento bruto estimado</p><p className="mt-1 text-xl font-semibold text-primary">{formatCurrency(totals.gross)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Valor líquido estimado</p><p className="mt-1 text-xl font-semibold text-success">{formatCurrency(totals.net)}</p></CardContent></Card></div>
    {loading ? <p className="py-12 text-center text-sm text-muted-foreground">Carregando investimentos...</p> : rows.length === 0 ? <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><WalletCards className="h-9 w-9 text-primary" /><p className="font-medium">Nenhuma aplicação registrada</p><p className="max-w-md text-sm text-muted-foreground">Cadastre seu CDB, RDB ou Caixinha para acompanhar a taxa contratada e uma estimativa líquida.</p></CardContent></Card> : <div className="space-y-3">{rows.map(({ investment, principal, annualRate, estimate }) => <Card key={investment.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 p-4"><div><p className="font-semibold">{investment.issuer} · {titleLabels[investment.title_type] || investment.title_type}</p><p className="mt-1 text-sm text-muted-foreground">{investment.indexer === "fixed" ? `${Number(investment.rate_percent)}% a.a.` : `${Number(investment.rate_percent)}% do ${investment.indexer.toUpperCase()}`} · {investment.liquidity_daily ? "Liquidez diária" : investment.maturity_date ? `Vence em ${new Date(`${investment.maturity_date}T12:00:00`).toLocaleDateString("pt-BR")}` : "Sem vencimento informado"}</p></div><div className="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-sm"><span className="text-muted-foreground">Aplicado</span><strong>{formatCurrency(principal)}</strong><span className="text-muted-foreground">Líquido est.</span><strong className="text-success">{formatCurrency(estimate.estimatedValue)}</strong><span className="text-muted-foreground">Taxa anual est.</span><strong>{annualRate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</strong><Button variant="outline" size="sm" className="col-span-2 mt-2" onClick={() => { setSellInvestment(investment); setAmount(""); setStartedAt(today()); setOpen(true); }}>Registrar resgate</Button></div></CardContent></Card>)}</div>}
    <p className="text-xs text-muted-foreground">Estimativa para acompanhamento; a rentabilidade real pode variar. IR e IOF são estimados apenas sobre o rendimento e não substituem o informe da instituição.</p>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{sellInvestment ? `Resgatar · ${sellInvestment.issuer}` : "Adicionar lançamento"}</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2">{!sellInvestment && <><div className="sm:col-span-2"><Label>Emissor</Label><Input className="mt-1" value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="Ex.: Nubank" /></div><div><Label>Tipo de título</Label><Select value={titleType} onValueChange={setTitleType}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(titleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div><Label>Indexador</Label><Select value={indexer} onValueChange={(value) => setIndexer(value as FixedIncomeIndexer)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cdi">CDI</SelectItem><SelectItem value="selic">Selic</SelectItem><SelectItem value="fixed">Prefixado</SelectItem><SelectItem value="ipca">IPCA + taxa</SelectItem></SelectContent></Select></div><div><Label>{indexer === "fixed" ? "Taxa anual" : "Taxa do indexador"}</Label><Input className="mt-1" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Ex.: 105" /></div></>}<div><Label>{sellInvestment ? "Valor resgatado" : "Valor aplicado"}</Label><Input className="mt-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="R$ 0,00" /></div><div><Label>{sellInvestment ? "Data do resgate" : "Data da aplicação"}</Label><Input className="mt-1" type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} /></div>{!sellInvestment && <><div><Label>Data de vencimento</Label><Input className="mt-1" type="date" value={maturity} onChange={(e) => setMaturity(e.target.value)} /></div><div className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">Liquidez diária</p><p className="text-xs text-muted-foreground">Você pode resgatar a qualquer momento.</p></div><Switch checked={liquidityDaily} onCheckedChange={setLiquidityDaily} /></div></>}<div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => { setOpen(false); setSellInvestment(null); }}>Cancelar</Button><Button disabled={saving} onClick={() => void save()} className="gap-2"><TrendingUp className="h-4 w-4" /> {saving ? "Salvando..." : sellInvestment ? "Registrar resgate" : "Adicionar aplicação"}</Button></div></div></DialogContent></Dialog>
  </div>;
}
