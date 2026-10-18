// ZoneWinner: règlement automatique prudent des pronostics.
 // Déployer comme Supabase Edge Function "settle-results".
 // Secrets requis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, API_FOOTBALL_KEY, ZONEWINNER_CRON_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-zonewinner-cron-secret",
};

type Pick = {
  id: number;
  match_name: string;
  competition: string;
  prediction: string;
  market_type: string;
  market_selection: string | null;
  home_team: string | null;
  away_team: string | null;
  provider_fixture_id: number | null;
  status: string;
  result_review_status: string;
};

function evaluate(marketType: string, selection: string, home: number, away: number): "won" | "lost" | null {
  const s = selection.trim().toLowerCase();
  switch (marketType) {
    case "match_result":
      if (["home", "1"].includes(s)) return home > away ? "won" : "lost";
      if (["draw", "x"].includes(s)) return home === away ? "won" : "lost";
      if (["away", "2"].includes(s)) return away > home ? "won" : "lost";
      return null;
    case "double_chance":
      if (["1x", "home_or_draw"].includes(s)) return home >= away ? "won" : "lost";
      if (["x2", "draw_or_away"].includes(s)) return away >= home ? "won" : "lost";
      if (["12", "no_draw"].includes(s)) return home !== away ? "won" : "lost";
      return null;
    case "over_under": {
      const m = s.match(/^(over|under)_(\d+(?:_\d+)?)$/);
      if (!m) return null;
      const threshold = Number(m[2].replace("_", "."));
      const total = home + away;
      if (m[1] === "over") return total > threshold ? "won" : "lost";
      return total < threshold ? "won" : "lost";
    }
    case "both_teams_score":
      if (["yes", "both_yes", "gg"].includes(s)) return home > 0 && away > 0 ? "won" : "lost";
      if (["no", "both_no", "ng"].includes(s)) return home === 0 || away === 0 ? "won" : "lost";
      return null;
    case "exact_score": {
      const m = s.match(/^(\d+)\s*[-:]\s*(\d+)$/);
      if (!m) return null;
      return home === Number(m[1]) && away === Number(m[2]) ? "won" : "lost";
    }
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const expected = Deno.env.get("ZONEWINNER_CRON_SECRET");
  if (!expected || req.headers.get("x-zonewinner-cron-secret") !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("API_FOOTBALL_KEY");
  if (!supabaseUrl || !serviceKey || !apiKey) {
    return new Response(JSON.stringify({ error: "Missing server secrets" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: picks, error } = await supabase
    .from("pronostics")
    .select("id,match_name,competition,prediction,market_type,market_selection,home_team,away_team,provider_fixture_id,status,result_review_status")
    .eq("published", true)
    .eq("status", "pending")
    .eq("result_review_status", "ready_to_settle")
    .not("provider_fixture_id", "is", null)
    .limit(100);

  if (error) return new Response(JSON.stringify({ error: "Database query failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const summary = { checked: 0, settled: 0, review: 0, waiting: 0, errors: 0 };
  for (const pick of (picks ?? []) as Pick[]) {
    summary.checked++;
    try {
      const url = new URL("https://v3.football.api-sports.io/fixtures");
      url.searchParams.set("id", String(pick.provider_fixture_id));
      const response = await fetch(url, { headers: { "x-apisports-key": apiKey } });
      if (!response.ok) { summary.errors++; continue; }
      const body = await response.json();
      const fixture = body?.response?.[0];
      if (!fixture) {
        await supabase.from("pronostics").update({ result_review_status: "provider_error", result: "Match introuvable chez le fournisseur" }).eq("id", pick.id).eq("status", "pending");
        summary.review++;
        continue;
      }

      const homeName = String(fixture.teams?.home?.name ?? "").trim().toLowerCase();
      const awayName = String(fixture.teams?.away?.name ?? "").trim().toLowerCase();
      const expectedHome = String(pick.home_team ?? "").trim().toLowerCase();
      const expectedAway = String(pick.away_team ?? "").trim().toLowerCase();
      if (!expectedHome || !expectedAway || homeName !== expectedHome || awayName !== expectedAway) {
        await supabase.from("pronostics").update({ result_review_status: "manual_review", result: "Vérifier manuellement les équipes associées au match" }).eq("id", pick.id).eq("status", "pending");
        summary.review++;
        continue;
      }

      const state = fixture.fixture?.status?.short;
      if (!["FT"].includes(state)) {
        if (["PST", "CANC", "ABD", "AWD", "WO", "AET", "PEN"].includes(state)) {
          await supabase.from("pronostics").update({ result_review_status: "manual_review", result: "Statut spécial du match : vérification manuelle requise" }).eq("id", pick.id).eq("status", "pending");
          summary.review++;
        } else summary.waiting++;
        continue;
      }

      const home = fixture.goals?.home;
      const away = fixture.goals?.away;
      if (!Number.isInteger(home) || !Number.isInteger(away)) { summary.errors++; continue; }
      const settled = evaluate(pick.market_type, String(pick.market_selection ?? ""), home, away);
      if (!settled) {
        await supabase.from("pronostics").update({
          result_review_status: "manual_review",
          home_score: home,
          away_score: away,
          result_source: "API-Football",
          result_checked_at: new Date().toISOString(),
          result: "Type ou sélection non reconnu : vérification manuelle requise",
        }).eq("id", pick.id).eq("status", "pending");
        summary.review++;
        continue;
      }

      const { error: updateError } = await supabase.from("pronostics").update({
        status: settled,
        home_score: home,
        away_score: away,
        result: `Score final ${home}-${away} — ${settled === "won" ? "Gagné" : "Perdu"} (API-Football)`,
        result_source: "API-Football",
        result_checked_at: new Date().toISOString(),
        result_review_status: "auto_settled",
      }).eq("id", pick.id).eq("status", "pending");
      if (updateError) summary.errors++; else summary.settled++;
    } catch {
      summary.errors++;
    }
  }

  return new Response(JSON.stringify(summary), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
