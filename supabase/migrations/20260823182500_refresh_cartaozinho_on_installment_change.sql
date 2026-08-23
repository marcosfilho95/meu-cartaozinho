-- Mantém o valor de receitas automáticas existentes sincronizado sempre que
-- uma parcela é adicionada, alterada ou removida, inclusive por clientes antigos.
create or replace function public.refresh_existing_cartaozinho_total(
  target_user_id uuid,
  target_month text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  new_total numeric;
begin
  if target_month is null or target_month < '2026-05' then
    return;
  end if;

  select round(coalesce(sum(amount), 0), 2)
    into new_total
  from public.installments
  where user_id = target_user_id
    and ref_month = target_month;

  update public.transactions
  set amount = new_total,
      updated_at = now()
  where user_id = target_user_id
    and external_id = 'meu_cartaozinho:' || target_month
    and deleted_at is null
    and amount is distinct from new_total;
end;
$$;

create or replace function public.on_installment_refresh_cartaozinho()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_existing_cartaozinho_total(old.user_id, old.ref_month);
    return old;
  end if;

  if tg_op = 'UPDATE' and (old.user_id, old.ref_month) is distinct from (new.user_id, new.ref_month) then
    perform public.refresh_existing_cartaozinho_total(old.user_id, old.ref_month);
  end if;

  perform public.refresh_existing_cartaozinho_total(new.user_id, new.ref_month);
  return new;
end;
$$;

drop trigger if exists installments_refresh_cartaozinho_total
  on public.installments;

create trigger installments_refresh_cartaozinho_total
after insert or update of amount, ref_month, user_id or delete
on public.installments
for each row
execute function public.on_installment_refresh_cartaozinho();
