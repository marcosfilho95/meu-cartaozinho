import React from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/constants";

export type EvolutionPoint = {
  key: string;
  month: string;
  receitas: number;
  despesas: number;
  resultado: number;
};

/** Gráfico de evolução mensal isolado para carregar sob demanda (recharts é pesado). */
const MonthlyEvolutionChart: React.FC<{ data: EvolutionPoint[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height="100%">
    <ComposedChart data={data} stackOffset="sign" margin={{ top: 8, right: 4, left: -18, bottom: 12 }}>
      <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.55} />
      <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.25} />
      <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
      <YAxis tickLine={false} axisLine={false} fontSize={10} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
      <Tooltip
        formatter={(value: number, name: string) => [formatCurrency(name === "Despesas" ? Math.abs(value) : value), name]}
        contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }}
      />
      <Bar dataKey="receitas" name="Receitas" stackId="movimento" barSize={28} fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
      <Bar dataKey="despesas" name="Despesas" stackId="movimento" barSize={28} fill="hsl(var(--destructive))" fillOpacity={0.76} radius={[0, 0, 4, 4]} />
      <Line type="monotone" dataKey="resultado" name="Resultado" stroke="hsl(var(--primary))" strokeWidth={2.4} dot={{ r: 2.5, fill: "hsl(var(--card))" }} activeDot={{ r: 4 }} />
    </ComposedChart>
  </ResponsiveContainer>
);

export default MonthlyEvolutionChart;
