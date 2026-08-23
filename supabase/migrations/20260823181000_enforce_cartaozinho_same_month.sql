-- Proteção no banco: clientes antigos não podem deslocar novamente a
-- competência de um lançamento automático do Meu Cartãozinho.
create or replace function public.enforce_cartaozinho_same_month()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  source_month text;
begin
  source_month := substring(new.external_id from '^meu_cartaozinho:([0-9]{4}-[0-9]{2})$');

  if source_month is not null and source_month >= '2026-05' then
    new.transaction_date := (source_month || '-01')::date;
    new.competence_month := source_month;
    new.due_date := (source_month || '-01')::date;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'integration', 'meu_cartaozinho',
      'source_month', source_month,
      'receipt_month', source_month,
      'rule', 'same_month'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_enforce_cartaozinho_same_month
  on public.transactions;

create trigger transactions_enforce_cartaozinho_same_month
before insert or update of external_id, transaction_date, competence_month, due_date
on public.transactions
for each row
execute function public.enforce_cartaozinho_same_month();

-- Realinha os registros existentes; o gatilho garante que permaneçam assim.
update public.transactions
set updated_at = now()
where deleted_at is null
  and external_id ~ '^meu_cartaozinho:[0-9]{4}-[0-9]{2}$'
  and substring(external_id from '^meu_cartaozinho:([0-9]{4}-[0-9]{2})$') >= '2026-05';
