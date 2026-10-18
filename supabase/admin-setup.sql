-- ZoneWinner: sécurisation et accès administrateur
-- À exécuter dans Supabase SQL Editor après pronostics-setup.sql.
-- 1) Crée une table privée d'administrateurs.
create table if not exists public.zonewinner_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.zonewinner_admins enable row level security;
revoke all on public.zonewinner_admins from anon, authenticated;

-- 2) Fonction de vérification d'administrateur. La table n'est jamais lisible directement.
create or replace function public.is_zonewinner_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.zonewinner_admins a
    where a.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_zonewinner_admin() from public, anon;
grant execute on function public.is_zonewinner_admin() to authenticated;

-- 3) Les membres continuent à lire les pronostics publiés.
-- Les administrateurs peuvent aussi lire les brouillons.
drop policy if exists "Admins read all pronostics" on public.pronostics;
create policy "Admins read all pronostics"
on public.pronostics for select to authenticated
using (public.is_zonewinner_admin());

-- 4) Seuls les administrateurs autorisés peuvent créer ou modifier.
drop policy if exists "Admins insert pronostics" on public.pronostics;
create policy "Admins insert pronostics"
on public.pronostics for insert to authenticated
with check (public.is_zonewinner_admin());

drop policy if exists "Admins update pronostics" on public.pronostics;
create policy "Admins update pronostics"
on public.pronostics for update to authenticated
using (public.is_zonewinner_admin())
with check (public.is_zonewinner_admin());

grant select, insert, update on public.pronostics to authenticated;

-- 5) IMPORTANT : ajouter ensuite TON propre user_id dans cette table.
-- Supabase > Authentication > Users > copie l'ID (UUID) de ton compte connecté.
-- Remplace UUID_DE_TON_COMPTE puis exécute cette commande séparément :
-- insert into public.zonewinner_admins (user_id) values ('UUID_DE_TON_COMPTE');
