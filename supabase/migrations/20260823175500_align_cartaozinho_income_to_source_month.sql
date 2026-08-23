-- Cada receita automática do Meu Cartãozinho pertence ao próprio mês
-- indicado no external_id. Também atualiza o valor usando a soma exata das
-- parcelas daquele usuário e daquele mês.
with monthly_totals as (
  select
    user_id,
    ref_month,
    round(sum(amount), 2) as total
  from public.installments
  where ref_month >= '2026-05'
  group by user_id, ref_month
), mapped as (
  select
    t.id,
    t.user_id,
    substring(t.external_id from '^meu_cartaozinho:([0-9]{4}-[0-9]{2})$') as source_month
  from public.transactions t
  where t.deleted_at is null
    and t.external_id ~ '^meu_cartaozinho:[0-9]{4}-[0-9]{2}$'
)
update public.transactions as tx
set
  amount = total.total,
  transaction_date = (total.ref_month || '-01')::date,
  competence_month = total.ref_month,
  due_date = (total.ref_month || '-01')::date,
  description_original = 'Meu Cartãozinho — ' || total.ref_month,
  description_normalized = 'meu cartaozinho ' || total.ref_month,
  notes = 'Receita do Meu Cartãozinho referente a ' || total.ref_month || '.',
  metadata = coalesce(tx.metadata, '{}'::jsonb) || jsonb_build_object(
    'integration', 'meu_cartaozinho',
    'source_month', total.ref_month,
    'receipt_month', total.ref_month,
    'rule', 'same_month'
  ),
  updated_at = now()
from mapped
join monthly_totals total
  on total.user_id = mapped.user_id
 and total.ref_month = mapped.source_month
where tx.id = mapped.id;
