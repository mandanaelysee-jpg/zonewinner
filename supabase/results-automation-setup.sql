-- ZoneWinner: champs structurés pour le rapprochement des matchs et la validation des résultats.
-- À exécuter dans Supabase > SQL Editor APRÈS les scripts pronostics-setup.sql et admin-setup.sql.
-- Cette migration ne contacte aucune API et ne modifie pas les pronostics existants.
alter table public.pronostics
  add column if not exists market_type text not null default 'manual_review',
  add column if not exists market_selection text,
  add column if not exists home_team text,
  add column if not exists away_team text,
  add column if not exists provider_fixture_id bigint,
  add column if not exists home_score integer,
  add column if not exists away_score integer,
  add column if not exists result_review_status text not null default 'needs_mapping',
  add column if not exists result_source text,
  add column if not exists result_checked_at timestamptz;

-- Types pris en charge par le futur évaluateur. Les lignes existantes restent en vérification manuelle.
alter table public.pronostics
  drop constraint if exists pronostics_market_type_check;
alter table public.pronostics
  add constraint pronostics_market_type_check
  check (market_type in (
    'manual_review',
    'match_result',
    'double_chance',
    'over_under',
    'both_teams_score',
    'exact_score'
  ));

alter table public.pronostics
  drop constraint if exists pronostics_result_review_status_check;
alter table public.pronostics
  add constraint pronostics_result_review_status_check
  check (result_review_status in (
    'needs_mapping',
    'waiting',
    'ready_to_settle',
    'auto_settled',
    'manual_review',
    'provider_error'
  ));

alter table public.pronostics
  drop constraint if exists pronostics_scores_nonnegative_check;
alter table public.pronostics
  add constraint pronostics_scores_nonnegative_check
  check (
    (home_score is null or home_score >= 0)
    and (away_score is null or away_score >= 0)
  );

create index if not exists pronostics_result_review_status_idx
  on public.pronostics (result_review_status, kickoff_at)
  where published = true;

comment on column public.pronostics.market_type is
  'Structured market identifier used by the result evaluator; existing rows default to manual_review.';
comment on column public.pronostics.market_selection is
  'Normalized selection, e.g. home, draw, away, over_2_5, yes, no, 1-0. Never infer silently from free text.';
comment on column public.pronostics.provider_fixture_id is
  'Fixture ID from the configured sports data provider; map only after confirming teams, competition and kickoff.';
comment on column public.pronostics.result_review_status is
  'Automation workflow status. Ambiguous or unsupported picks must stay in manual_review.';
