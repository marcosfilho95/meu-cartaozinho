import { supabase } from "@/integrations/supabase/client";

export type FixedBillPreview = {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: string;
  recurrenceId: string | null;
};

const pad = (value: number) => String(value).padStart(2, "0");

const daysInMonth = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
};

export const dueDateForMonth = (monthKey: string, dayOfMonth: number | null) => {
  const day = Math.min(Math.max(dayOfMonth || 1, 1), daysInMonth(monthKey));
  return `${monthKey}-${pad(day)}`;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Materializes active monthly recurrences into `expected_bills` for the given month.
 * Idempotent: skips recurrences that already have a bill inside the month.
 */
export const generateExpectedBillsForMonth = async (userId: string, monthKey: string) => {
  const start = `${monthKey}-01`;
  const end = `${monthKey}-${pad(daysInMonth(monthKey))}`;

  const [recurrencesRes, billsRes] = await Promise.all([
    supabase
      .from("recurrences")
      .select("id, name, amount, day_of_month, frequency, is_active, kind, account_id, category_id, template_payload, start_date, end_date")
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase
      .from("expected_bills")
      .select("id, name, amount, due_date, status, recurrence_id")
      .eq("user_id", userId)
      .gte("due_date", start)
      .lte("due_date", end),
  ]);

  if (recurrencesRes.error) throw recurrencesRes.error;
  if (billsRes.error) throw billsRes.error;

  const existing = (billsRes.data || []) as Array<{ recurrence_id: string | null; name: string }>;
  const existingIds = new Set(existing.map((bill) => bill.recurrence_id).filter(Boolean) as string[]);

  const rows = (recurrencesRes.data || []).filter((rec) => {
    if (rec.frequency !== "monthly") return false;
    if (existingIds.has(rec.id)) return false;
    if (rec.start_date && rec.start_date > end) return false;
    if (rec.end_date && rec.end_date < start) return false;
    const payload = (rec.template_payload || {}) as { type?: string; amount?: number };
    const kind = rec.kind || payload.type || "expense";
    return kind !== "income";
  });

  if (rows.length === 0) {
    return { created: 0, bills: (billsRes.data || []) as FixedBillPreview[] };
  }

  const inserts = rows.map((rec) => {
    const payload = (rec.template_payload || {}) as { source?: string; amount?: number };
    const dueDate = dueDateForMonth(monthKey, rec.day_of_month);
    const amount = Number(rec.amount ?? payload.amount ?? 0) || null;
    return {
      user_id: userId,
      recurrence_id: rec.id,
      name: rec.name || payload.source || "Despesa fixa",
      amount,
      expected_min_amount: amount,
      expected_max_amount: amount,
      due_date: dueDate,
      status: dueDate < todayKey() ? "overdue" : "pending",
      account_id: rec.account_id,
      category_id: rec.category_id,
      confidence: 1,
      metadata: { generatedFrom: "recurrence", month: monthKey },
    };
  });

  const { error } = await supabase.from("expected_bills").insert(inserts);
  if (error) throw error;

  return { created: inserts.length, bills: [] as FixedBillPreview[] };
};

export const fetchExpectedBillsForMonth = async (userId: string, monthKey: string) => {
  const { data, error } = await supabase
    .from("expected_bills")
    .select("id, name, amount, due_date, status, recurrence_id")
    .eq("user_id", userId)
    .gte("due_date", `${monthKey}-01`)
    .lte("due_date", `${monthKey}-${pad(daysInMonth(monthKey))}`)
    .order("due_date", { ascending: true });
  if (error) throw error;
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    amount: Number(row.amount || 0),
    dueDate: String(row.due_date),
    status: String(row.status),
    recurrenceId: (row.recurrence_id as string | null) ?? null,
  })) as FixedBillPreview[];
};
