-- Fix mojibake category names and merge duplicated categories safely.
-- This migration remaps references in transactions/budgets before deleting duplicates.

create temp table _category_name_fixes (
  bad text primary key,
  good text not null
) on commit drop;

insert into _category_name_fixes (bad, good) values
  ('AlimentaÃ§Ã£o', 'Alimentação'),
  ('SaÃºde', 'Saúde'),
  ('EducaÃ§Ã£o', 'Educação'),
  ('SalÃ¡rio', 'Salário'),
  ('TransferÃªncias', 'Transferências'),
  ('CondomÃ­nio', 'Condomínio'),
  ('Ãgua', 'Água'),
  ('Uber e TÃ¡xi', 'Uber e Táxi'),
  ('Transporte PÃºblico', 'Transporte Público'),
  ('FarmÃ¡cia', 'Farmácia'),
  ('BÃ´nus', 'Bônus'),
  ('CartÃ£o', 'Cartão'),
  ('CartÃµes', 'Cartões');

-- 1) Merge parent categories first and reparent children.
with parent_candidates as (
  select
    c.id,
    c.user_id,
    c.kind,
    c.name,
    c.created_at,
    coalesce(f.good, c.name) as desired_name
  from public.categories c
  left join _category_name_fixes f on c.name = f.bad or c.name = f.good
  where c.parent_id is null
    and f.good is not null
),
parent_ranked as (
  select
    pc.*,
    row_number() over (
      partition by pc.user_id, pc.kind, pc.desired_name
      order by case when pc.name = pc.desired_name then 0 else 1 end, pc.created_at asc, pc.id asc
    ) as rn
  from parent_candidates pc
),
parent_keepers as (
  select user_id, kind, desired_name, id as keeper_id
  from parent_ranked
  where rn = 1
),
parent_dups as (
  select pr.id as duplicate_id, pk.keeper_id
  from parent_ranked pr
  join parent_keepers pk
    on pk.user_id = pr.user_id
   and pk.kind = pr.kind
   and pk.desired_name = pr.desired_name
  where pr.rn > 1
)
update public.categories child
set parent_id = pd.keeper_id
from parent_dups pd
where child.parent_id = pd.duplicate_id;

with parent_candidates as (
  select
    c.id,
    c.user_id,
    c.kind,
    c.name,
    c.created_at,
    coalesce(f.good, c.name) as desired_name
  from public.categories c
  left join _category_name_fixes f on c.name = f.bad or c.name = f.good
  where c.parent_id is null
    and f.good is not null
),
parent_ranked as (
  select
    pc.*,
    row_number() over (
      partition by pc.user_id, pc.kind, pc.desired_name
      order by case when pc.name = pc.desired_name then 0 else 1 end, pc.created_at asc, pc.id asc
    ) as rn
  from parent_candidates pc
),
parent_keepers as (
  select user_id, kind, desired_name, id as keeper_id
  from parent_ranked
  where rn = 1
),
parent_dups as (
  select pr.id as duplicate_id, pk.keeper_id
  from parent_ranked pr
  join parent_keepers pk
    on pk.user_id = pr.user_id
   and pk.kind = pr.kind
   and pk.desired_name = pr.desired_name
  where pr.rn > 1
)
update public.transactions t
set category_id = pd.keeper_id
from parent_dups pd
where t.category_id = pd.duplicate_id;

with parent_candidates as (
  select
    c.id,
    c.user_id,
    c.kind,
    c.name,
    c.created_at,
    coalesce(f.good, c.name) as desired_name
  from public.categories c
  left join _category_name_fixes f on c.name = f.bad or c.name = f.good
  where c.parent_id is null
    and f.good is not null
),
parent_ranked as (
  select
    pc.*,
    row_number() over (
      partition by pc.user_id, pc.kind, pc.desired_name
      order by case when pc.name = pc.desired_name then 0 else 1 end, pc.created_at asc, pc.id asc
    ) as rn
  from parent_candidates pc
),
parent_keepers as (
  select user_id, kind, desired_name, id as keeper_id
  from parent_ranked
  where rn = 1
),
parent_dups as (
  select pr.id as duplicate_id, pk.keeper_id
  from parent_ranked pr
  join parent_keepers pk
    on pk.user_id = pr.user_id
   and pk.kind = pr.kind
   and pk.desired_name = pr.desired_name
  where pr.rn > 1
)
update public.budgets b
set category_id = pd.keeper_id
from parent_dups pd
where b.category_id = pd.duplicate_id;

with parent_candidates as (
  select
    c.id,
    c.user_id,
    c.kind,
    c.name,
    c.created_at,
    coalesce(f.good, c.name) as desired_name
  from public.categories c
  left join _category_name_fixes f on c.name = f.bad or c.name = f.good
  where c.parent_id is null
    and f.good is not null
),
parent_ranked as (
  select
    pc.*,
    row_number() over (
      partition by pc.user_id, pc.kind, pc.desired_name
      order by case when pc.name = pc.desired_name then 0 else 1 end, pc.created_at asc, pc.id asc
    ) as rn
  from parent_candidates pc
),
parent_dups as (
  select id
  from parent_ranked
  where rn > 1
)
delete from public.categories c
using parent_dups d
where c.id = d.id;

-- 2) Merge remaining duplicated mapped categories (including children).
with candidates as (
  select
    c.id,
    c.user_id,
    c.kind,
    c.name,
    c.created_at,
    coalesce(f.good, c.name) as desired_name
  from public.categories c
  left join _category_name_fixes f on c.name = f.bad or c.name = f.good
  where f.good is not null
),
ranked as (
  select
    c.*,
    row_number() over (
      partition by c.user_id, c.kind, c.desired_name
      order by case when c.name = c.desired_name then 0 else 1 end, c.created_at asc, c.id asc
    ) as rn
  from candidates c
),
keepers as (
  select user_id, kind, desired_name, id as keeper_id
  from ranked
  where rn = 1
),
dups as (
  select r.id as duplicate_id, k.keeper_id
  from ranked r
  join keepers k
    on k.user_id = r.user_id
   and k.kind = r.kind
   and k.desired_name = r.desired_name
  where r.rn > 1
)
update public.transactions t
set category_id = d.keeper_id
from dups d
where t.category_id = d.duplicate_id;

with candidates as (
  select
    c.id,
    c.user_id,
    c.kind,
    c.name,
    c.created_at,
    coalesce(f.good, c.name) as desired_name
  from public.categories c
  left join _category_name_fixes f on c.name = f.bad or c.name = f.good
  where f.good is not null
),
ranked as (
  select
    c.*,
    row_number() over (
      partition by c.user_id, c.kind, c.desired_name
      order by case when c.name = c.desired_name then 0 else 1 end, c.created_at asc, c.id asc
    ) as rn
  from candidates c
),
keepers as (
  select user_id, kind, desired_name, id as keeper_id
  from ranked
  where rn = 1
),
dups as (
  select r.id as duplicate_id, k.keeper_id
  from ranked r
  join keepers k
    on k.user_id = r.user_id
   and k.kind = r.kind
   and k.desired_name = r.desired_name
  where r.rn > 1
)
update public.budgets b
set category_id = d.keeper_id
from dups d
where b.category_id = d.duplicate_id;

with candidates as (
  select
    c.id,
    c.user_id,
    c.kind,
    c.name,
    c.created_at,
    coalesce(f.good, c.name) as desired_name
  from public.categories c
  left join _category_name_fixes f on c.name = f.bad or c.name = f.good
  where f.good is not null
),
ranked as (
  select
    c.*,
    row_number() over (
      partition by c.user_id, c.kind, c.desired_name
      order by case when c.name = c.desired_name then 0 else 1 end, c.created_at asc, c.id asc
    ) as rn
  from candidates c
),
dups as (
  select id
  from ranked
  where rn > 1
)
delete from public.categories c
using dups d
where c.id = d.id;

-- 3) Rename remaining mojibake categories where no collision remains.
update public.categories c
set name = f.good
from _category_name_fixes f
where c.name = f.bad
  and not exists (
    select 1
    from public.categories c2
    where c2.user_id = c.user_id
      and c2.kind = c.kind
      and c2.id <> c.id
      and c2.name = f.good
  );

-- 4) Ensure normalization uses proper UTF accents and refresh normalized_name.
create or replace function public.normalize_category_name()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.normalized_name := lower(
    translate(
      trim(new.name),
      'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
    )
  );
  return new;
end;
$$;

update public.categories
set normalized_name = lower(
  translate(
    trim(name),
    'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  )
);

