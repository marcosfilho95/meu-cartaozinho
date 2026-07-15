import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarCheck,
  Check,
  CheckCircle2,
  Clock3,
  ListChecks,
  Plus,
  ReceiptText,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/constants";
import { FinanceTx } from "@/lib/financeShared";
import { cn } from "@/lib/utils";

type DailyTask = {
  id: string;
  title: string;
  date: string;
  done: boolean;
  createdAt: string;
};

interface DailyOrganizerPanelProps {
  userId: string;
  transactions: FinanceTx[];
  togglingId: string | null;
  onToggleTransaction: (tx: FinanceTx) => void;
  onNewExpense: () => void;
  onNewIncome: () => void;
  onViewTransactions: () => void;
}

const taskStorageKey = (userId: string) => `daily-organizer-tasks:${userId}`;

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};

const dateLabel = (dateKey: string) =>
  new Date(`${dateKey}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

const getTxDueKey = (tx: FinanceTx) => tx.due_date || tx.transaction_date;

const getVisibleTitle = (tx: FinanceTx) => tx.source || tx.notes || "Sem descrição";

export const DailyOrganizerPanel: React.FC<DailyOrganizerPanelProps> = ({
  userId,
  transactions,
  togglingId,
  onToggleTransaction,
  onNewExpense,
  onNewIncome,
  onViewTransactions,
}) => {
  const today = localDateKey();
  const [selectedDate, setSelectedDate] = useState(today);
  const [taskTitle, setTaskTitle] = useState("");
  const [tasks, setTasks] = useState<DailyTask[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(taskStorageKey(userId));
      setTasks(raw ? (JSON.parse(raw) as DailyTask[]) : []);
    } catch {
      setTasks([]);
    }
  }, [userId]);

  useEffect(() => {
    localStorage.setItem(taskStorageKey(userId), JSON.stringify(tasks));
  }, [tasks, userId]);

  const pendingFinancialItems = useMemo(
    () =>
      transactions
        .filter((tx) => tx.status === "pending" || tx.status === "overdue")
        .sort((a, b) => getTxDueKey(a).localeCompare(getTxDueKey(b))),
    [transactions],
  );

  const dueToday = useMemo(
    () => pendingFinancialItems.filter((tx) => getTxDueKey(tx) === today),
    [pendingFinancialItems, today],
  );

  const overdue = useMemo(
    () =>
      pendingFinancialItems.filter((tx) => {
        const due = getTxDueKey(tx);
        return tx.status === "overdue" || due < today;
      }),
    [pendingFinancialItems, today],
  );

  const nextSevenDays = useMemo(() => {
    const limit = addDays(today, 7);
    return pendingFinancialItems.filter((tx) => {
      const due = getTxDueKey(tx);
      return due > today && due <= limit;
    });
  }, [pendingFinancialItems, today]);

  const tasksForDate = useMemo(
    () => tasks.filter((task) => task.date === selectedDate).sort((a, b) => Number(a.done) - Number(b.done)),
    [tasks, selectedDate],
  );

  const overdueTasks = useMemo(
    () => tasks.filter((task) => !task.done && task.date < today).sort((a, b) => a.date.localeCompare(b.date)),
    [tasks, today],
  );

  const openTasksToday = tasks.filter((task) => task.date === today && !task.done).length;
  const doneTasksToday = tasks.filter((task) => task.date === today && task.done).length;
  const dueTodayAmount = dueToday.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const overdueAmount = overdue.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const handleAddTask = () => {
    const title = taskTitle.trim();
    if (!title) return;

    setTasks((current) => [
      {
        id: crypto.randomUUID(),
        title,
        date: selectedDate,
        done: false,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
    setTaskTitle("");
  };

  const toggleTask = (taskId: string) => {
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, done: !task.done } : task)));
  };

  const removeTask = (taskId: string) => {
    setTasks((current) => current.filter((task) => task.id !== taskId));
  };

  const renderTransaction = (tx: FinanceTx) => {
    const isIncome = tx.type === "income";
    const due = getTxDueKey(tx);
    const isLate = due < today || tx.status === "overdue";

    return (
      <div key={tx.id} className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            isIncome ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
          )}
        >
          {isIncome ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{getVisibleTitle(tx)}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {tx.categories?.name || tx.accounts?.name || "Sem categoria"} · {dateLabel(due)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-sm font-bold", isIncome ? "text-success" : "text-foreground")}>
            {isIncome ? "+" : "-"}
            {formatCurrency(Number(tx.amount))}
          </p>
          {isLate && <p className="text-[10px] font-semibold text-destructive">Atrasada</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-success"
          disabled={togglingId === tx.id}
          title="Marcar como pago"
          onClick={() => onToggleTransaction(tx)}
        >
          {togglingId === tx.id ? <Clock3 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
      </div>
    );
  };

  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-base font-bold text-foreground">Hoje</h2>
            </div>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{dateLabel(today)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="h-9 gap-1.5 rounded-lg" onClick={onNewExpense}>
              <ArrowDownCircle className="h-3.5 w-3.5" />
              Gasto
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5 rounded-lg" onClick={onNewIncome}>
              <ArrowUpCircle className="h-3.5 w-3.5" />
              Entrada
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tarefas</p>
            <p className="mt-1 text-lg font-extrabold text-foreground">{openTasksToday}</p>
            <p className="text-[10px] text-muted-foreground">{doneTasksToday} feitas</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vence hoje</p>
            <p className="mt-1 text-lg font-extrabold text-warning">{dueToday.length}</p>
            <p className="text-[10px] text-muted-foreground">{formatCurrency(dueTodayAmount)}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Atrasadas</p>
            <p className="mt-1 text-lg font-extrabold text-destructive">{overdue.length + overdueTasks.length}</p>
            <p className="text-[10px] text-muted-foreground">{formatCurrency(overdueAmount)}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">7 dias</p>
            <p className="mt-1 text-lg font-extrabold text-primary">{nextSevenDays.length}</p>
            <p className="text-[10px] text-muted-foreground">proximas contas</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr_auto]">
          <Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="h-10 rounded-lg" />
          <Input
            value={taskTitle}
            onChange={(event) => setTaskTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleAddTask();
            }}
            placeholder="Nova tarefa do dia"
            className="h-10 rounded-lg"
          />
          <Button type="button" className="h-10 gap-1.5 rounded-lg" onClick={handleAddTask}>
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" />
              Tarefas
            </p>
            <Badge variant="outline" className="text-[10px]">
              {tasksForDate.length}
            </Badge>
          </div>

          {tasksForDate.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              Nenhuma tarefa para esta data.
            </div>
          ) : (
            <div className="space-y-1.5">
              {tasksForDate.map((task) => (
                <div key={task.id} className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleTask(task.id)}
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      task.done ? "border-success bg-success/15 text-success" : "border-muted-foreground/30 text-muted-foreground",
                    )}
                    title={task.done ? "Reabrir tarefa" : "Concluir tarefa"}
                  >
                    {task.done && <Check className="h-3.5 w-3.5" />}
                  </button>
                  <p className={cn("min-w-0 flex-1 truncate text-sm font-medium", task.done && "text-muted-foreground line-through")}>
                    {task.title}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                    title="Excluir tarefa"
                    onClick={() => removeTask(task.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-base font-bold text-foreground">Pendências financeiras</h2>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs" onClick={onViewTransactions}>
            Ver todas
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          {overdue.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                Atrasadas
              </p>
              <div className="space-y-1.5">{overdue.slice(0, 4).map(renderTransaction)}</div>
            </div>
          )}

          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              Vencem hoje
            </p>
            {dueToday.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-3 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Nada financeiro vencendo hoje.
              </div>
            ) : (
              <div className="space-y-1.5">{dueToday.slice(0, 4).map(renderTransaction)}</div>
            )}
          </div>

          {nextSevenDays.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Próximos 7 dias</p>
              <div className="space-y-1.5">{nextSevenDays.slice(0, 4).map(renderTransaction)}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

