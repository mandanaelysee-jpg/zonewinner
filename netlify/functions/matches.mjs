import { getStore } from "@netlify/blobs";

const LEAGUES = { 39: "Premier League", 140: "La Liga", 61: "Ligue 1", 135: "Serie A", 78: "Bundesliga", 2: "Ligue des champions" };
const TTL = 3 * 3600 * 1000;
const API = "https://v3.football.api-sports.io";
const TZ = "Africa/Douala";

async function api(path, key) {
  const r = await fetch(API + path, { headers: { "x-apisports-key": key } });
  if (!r.ok) throw new Error("API-Football " + r.status);
  const j = await r.json();
  return j.response || [];
}
const season = () => { const d = new Date(); return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };
const out = (d) => Response.json({ date: d.date, matches: d.matches }, { headers: { "cache-control": "public, max-age=600" } });

export default async () => {
  const key = Netlify.env.get("API_FOOTBALL_KEY");
  const store = getStore("matches");
  const date = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const cached = await store.get("today", { type: "json" });
  if (cached && cached.date === date && Date.now() - cached.ts < TTL) return out(cached);
  if (!key) return cached ? out(cached) : Response.json({ error: "API_FOOTBALL_KEY manquante" }, { status: 500 });
  try {
    const fx = (await api(`/fixtures?date=${date}&timezone=${TZ}`, key)).filter((f) => LEAGUES[f.league.id]);
    const ids = [...new Set(fx.map((f) => f.league.id))];
    const odds = {};
    for (const id of ids) {
      const rows = await api(`/odds?date=${date}&league=${id}&season=${season()}&bet=1`, key);
      for (const row of rows) {
        const v = row.bookmakers?.[0]?.bets?.[0]?.values || [];
        const g = (n) => parseFloat(v.find((x) => x.value === n)?.odd);
        const o = [g("Home"), g("Draw"), g("Away")];
        if (o.every((x) => x > 0)) odds[row.fixture.id] = o;
      }
    }
    const matches = fx.sort((a, b) => a.fixture.timestamp - b.fixture.timestamp).map((f) => {
      const o = odds[f.fixture.id] || null;
      const h = f.teams.home.name, a = f.teams.away.name;
      let p = "";
      if (o) { const i = o.indexOf(Math.min(...o)); p = "Favori des cotes : " + [h, "match nul", a][i]; }
      return { l: LEAGUES[f.league.id], h, a, t: new Date(f.fixture.date).toLocaleTimeString("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }), o, p };
    });
    const data = { ts: Date.now(), date, matches };
    await store.setJSON("today", data);
    return out(data);
  } catch (e) {
    return cached ? out(cached) : Response.json({ error: String(e) }, { status: 502 });
  }
};

export const config = { path: "/api/matches" };
