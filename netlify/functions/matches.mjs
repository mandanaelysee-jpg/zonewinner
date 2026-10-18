
import { getStore } from "@netlify/blobs";

const LEAGUES = { 39: "Premier League", 140: "La Liga", 61: "Ligue 1", 135: "Serie A", 78: "Bundesliga", 2: "Ligue des champions" };
const TTL = 3 * 3600 * 1000;
const API = "https://v3.football.api-sports.io";
const TZ = "Africa/Douala";

async function api(path, key) {
  const r = await fetch(API + path, { headers: { "x-apisports-key": key } });
  if (!r.ok) throw new Error("API-Football " + r.status);
  const j = await r.json();
  const e = j.errors && (Array.isArray(j.errors) ? j.errors[0] : Object.values(j.errors)[0]);
  return { rows: j.response || [], err: e ? String(e) : "" };
}
const season = () => { const d = new Date(); return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };
const out = (d) => Response.json({ date: d.date, matches: d.matches, note: d.note || "" }, { headers: { "cache-control": "public, max-age=600" } });

export default async () => {
  const key = Netlify.env.get("API_FOOTBALL_KEY");
  const store = getStore("matches");
  const date = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const cached = await store.get("v2", { type: "json" });
  if (cached && cached.date === date && Date.now() - cached.ts < (cached.ttl || TTL)) return out(cached);
  if (!key) return cached ? out(cached) : Response.json({ error: "API_FOOTBALL_KEY manquante" }, { status: 500 });
  try {
    const fr = await api(`/fixtures?date=${date}&timezone=${TZ}`, key);
    if (fr.err) throw new Error(fr.err);
    const fx = fr.rows.filter((f) => LEAGUES[f.league.id]);
    const notes = [];
    const ids = [...new Set(fx.map((f) => f.league.id))];
    const odds = {};
    for (const id of ids) {
      const { rows, err } = await api(`/odds?date=${date}&league=${id}&season=${season()}&bet=1`, key);
      if (err) notes.push(LEAGUES[id] + " : " + err);
      else if (!rows.length) notes.push(LEAGUES[id] + " : aucune cote renvoyée");
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
    const hasOdds = matches.some((m) => m.o);
    const data = { ts: Date.now(), ttl: hasOdds ? TTL : 2 * 3600 * 1000, date, matches, note: notes.join(" | ") };
    await store.setJSON("v2", data);
    return out(data);
  } catch (e) {
    console.error("matches function failed:", e);
    return cached ? out(cached) : Response.json({ error: "Impossible de récupérer les matchs pour le moment." }, { status: 502 });
  }
};

export const config = { path: "/api/matches" };
