# HANDOFF — El Gran Scavenger Hunt de Bogotá

_Last updated: 2026-09-30 (Wed) by Claude. Event: **Saturday 3 October 2026**, meet 09:45, start 10:00._
_Read this first in any new session. Source of truth for content is the **database**, not this file._

---

## 1. Where things live

| What | Where |
|---|---|
| Live app (teams) | https://hunt.rossgarlick.com/?t=`<team token>` (also bogota-hunt.vercel.app) |
| Admin (quizmasters) | https://hunt.rossgarlick.com/admin — passcode in `bogota-hunt/.env.local` (`HUNT_ADMIN_KEY=`, first line after the comment). Ross and Julia can be signed in on any number of devices at once. |
| Code | `C:\Users\rossg\Claude Workspace\bogota-hunt` → GitHub **mancunianinnyc/scavengerhunt** (branch `main`) |
| Deploy | `git push origin main` → Vercel project `bogota-hunt` (team mancunianin-nyc) builds automatically. Ignored Build Step skips commits that only touch `supabase/` or `*.md`. |
| Database | Supabase **Personal Library** project `flbjlwckcgtlamnpabmj`, schema **`hunt` only**. Claude reaches it via the Supabase MCP (`execute_sql`, `apply_migration`). |
| Event plan | `G:\My Drive\Meeting Notes\Scavenger Hunt Bogota - Event Plan.md` (has scoring v1 + change log) |
| Julia's original clue doc | Google Doc "Scavenger Hunt Bogotá" (id `152Fq5YnRsVyeCW8IAQgudxRBfxGCzX_94CjNbjXnCQU`) |
| Printables | `Claude Workspace\scavenger-hunt\` and Drive `Meeting Notes\`: `Quiz-1-Ross-Universidades-y-Localidades.pdf`, `Quiz-2-Julia-Agua-y-Cultura.pdf`, `Scavenger-Hunt-Clues-Hints-and-Scoring-v2.pdf` (**out of date** — clues/hints changed since) |
| Old mockup | claude.ai artifact 21MdiSaeuPTbNP6TKTJPb3 — superseded, ignore |

## 2. Architecture (why it's built this way)

- **Static pages, no server code.** `public/index.html` + `team.js` (team app), `public/admin.html` + `admin.js`, shared `common.js`, `motion.js` (confetti / "nope"), `landing.js` (no-link welcome page with countdown), `app.css`.
- **All data access goes through `public.hunt_*` SECURITY DEFINER functions.** The `hunt` tables have RLS on and no grants, so the public (publishable) key can do nothing except call those functions, which check a **team token** or the **admin passcode** (sha256 in `hunt.config.admin_hash`).
- **Nothing secret is in the page source.** Clues are released one stop at a time by `hunt_state`; stop names only arrive after check-in; answers, anagram letters and GPS distance are checked server-side. The final destination (FRANC) must **never** appear in anything players can see (rule from Ross). Stop 10's hint mentions "Franc" on purpose — it's only shown if a team spends its hint.
- **Photos** are downscaled on the phone (1280px JPEG) and stored as data URLs in `hunt.subs.media`.

### Key tables
`teams` (token, depart [null = waiting], members, name_by_team, taxi_declared, is_test) · `stops` (clue, ask, qm note, hint, proof `phrase|photo`, puzzle, puzzle_hint, answer_prefix, answer_words, lat/lng/radius) · `sides` (side quests; `clue` = riddle → place never sent) · `checkins` · `subs` (proofs; `s1..s10` + side ids) · `hints` · `legs` (per-stop "did you take a taxi?") · `taxis` · `config`.

### Gotchas for the next session
- **`hunt_state` must be re-created in full** whenever you add a field (latest body is in migration 012 + later edits live in the DB). Safest: `select pg_get_functiondef('public.hunt_state(text)'::regprocedure)` and edit that.
- plpgsql variable named `t` collides with column `t` (subs/checkins/taxis) → use `v_team`.
- **Supabase MCP drops connections** (`ECONNRESET`) now and then — just retry.
- `.env.local` now also contains Vercel CLI entries after the passcode line; parse only the `HUNT_ADMIN_KEY=` line.
- Bash heredocs with complex quoting sometimes fail in this environment; writing a script file (Write tool) then running it is reliable.
- `vercel git connect` can't parse the SSH alias remote; switch origin to https temporarily if ever needed. Push uses SSH alias `github-bogota-hunt` (deploy key `~/.ssh/bogota_hunt_deploy`).
- Migrations `supabase/migrations/00x_*.sql`: 001–002 are full SQL; several later ones are applied via MCP and recorded as comments. `supabase/seed.sql` replays content (stops, sides, Julia's revisions) in order.

## 3. What the team app does (current behaviour)

1. **No link / bad link** → welcome page (ES/EN): countdown to Sat 09:45, meet at the **Bogotá sign in Parque de los Hippies**, how it works, what to bring, paste-your-link box.
2. **Waiting** (depart null) → team names itself ("¿Cómo se llama su equipo?", locked once started) + "Esperando la salida" with members. Polls every 5 s for the Start.
3. **Each stop, 3 cards:** status (timer, 10-segment progress, taxi count) · clue as a poem → "Estamos aquí · hacer check-in" (GPS, radius 250 m verified / 400 m approx; no-GPS fallback flagged to admin) · hint card (popup: **hint = stop worth 5 instead of 10**).
4. **After check-in:** "¡Correcto!" + confetti → **"¿Llegaron en taxi?" Sí/No** (this *is* the taxi count) → the reto.
5. **Retos:** photo upload, or typed text. Stop 1 = fill 7 missing letters of the Palacio de Justicia inscription (server-checked) → tap-to-spell anagram **MAESTRO** (free help: "Un experto es un…"). Stop 3 = "Aunque mujer y joven," pre-filled, type the rest (key words checked).
6. **Side quests** unlock after stops 2 (coin), **7** (Terminal ticket — riddle, place hidden), 8 (prom photo); treasure-reveal animation; all marked optional.
7. **Finish** (stop 10 photo stops the clock) → big confetti → congratulations card with frozen final time, tally, members, **taxi confirmation** (declared count is what scores), and a **share card** (`sharecard.js`: 1080×1350 image with team, final time, up to 4 photos as polaroids, invite artwork → phone share sheet; stop 10's photo is captioned "Destino final", never the bar's name).
8. Motion: confetti on correct, damped shake + distance count-up on wrong place; reduced-motion respected.

**Test teams** (`is_test`): "Prueba Ross" (token `uluDxtfbO5Kd`) and "Prueba Julia" (currently named **JSC**, token `0mUtpy5jdqsX`). They show a dashed **Modo prueba** box (simulate arrival / wrong place). Admin → Teams card: **Demo: jump to stop N**, **Reset progress**. Real teams can't be jumped (server refuses).

## 4. Admin page

Collapsible cards (remembered per device): **Teams & departures** first (auto-collapses once all event teams are out) · KPIs · **Review queue** (always shows every team incl. test, photos load inline, tap to zoom) · Leaderboard (hidden from teams; test teams only with "Show test teams") · Quizzes & awards (counts → points live) · Scoring rules · Check-in grid · **Finish & reveal**: reveal (last place → champion, each team with a 4-photo polaroid strip), **Photo slideshow** (all non-rejected photos, Ken Burns + crossfade, team filter, arrows/space/esc), **Download all photos (.zip)** (folder per team + `index.csv`). Photo code lives in `public/photos.js`.

Teams card: colour, name (team's own pick is tagged), members, **Start now**, set time, Clear, **Copy link** (for WhatsApp), schedule all (first time + gap, in order or shuffled), add/delete team.

## 5. Scoring (as the app computes it)

`Total = per approved stop 10 (5 if hint used) + speed bonus 50/30/20 (own elapsed; none if finishing after 18:00) + quizzes (**all four combined capped at 70**) + side quests (coin 20, ticket 50, prom 20) + drink can 10 + Theatron award 10 − 10 per taxi beyond 4 ± manual adjustment`

Quizzes: universities 1 each · localidades 1 each (×2 if all 20) · water bodies 2 each · poets 3 / writers 2 / musicians 1. Entered from the printed sheets.

## 6. Content state (DB, 29 Sep)

| # | Stop | Proof | Radius | Hint (Julia) |
|---:|---|---|---|---|
| 1 | Plaza de Bolívar | letters + MAESTRO | 250 ✓ | Una fachada en Plaza Bolívar... |
| 2 | Museo Botero | photo | 250 ✓ | Un ladrón corpulento... |
| 3 | Policarpa, Las Aguas (Cra 2 × Cl 18) | typed inscription | 400 ≈ | Estás buscando una estatua |
| 4 | Quinta de Bolívar (+ Ross quiz) | photo | 400 ≈ | ¿El Libertador dónde durmió? |
| 5 | Plaza La Perseverancia | photo (empty ajiaco plate) | 250 ✓ | ¿Dónde almuerzan los domingos los habitantes de La Macarena? |
| 6 | Matorral / Diosa, Teusaquillo | photo | 250 ✓ | ¿Dónde está la otra sede de Matorral? |
| 7 | Casa de Betty la Fea | photo (pose) | 400 ≈ | ¿Dónde vivía Betty? |
| 8 | Virgilio Barco (+ BibloRed card, Julia quiz) | photo | 400 ≈ | La biblioteca de Barco |
| 9 | Theatron | photo | 250 ✓ | ¿'La Capilla' se encuentra en qué discoteca? |
| 10 | FRANC (final, secret) | photo, stops clock | 250 ✓ | 'Franc'-ly, we need a drink! |

✓ = coordinates from Ross's Bogotá guide · ≈ = estimated, confirm on the walk.

Event teams: `t1..t5` "Equipo 1–5", no members, **waiting** (not started). Stagger default 10 min, taxi limit 4.

## 7. Before Saturday — open items

**Must do**
- [ ] **Walk / check the four ≈ locations** (Ross: Thu 1 Oct) (3, 4, 7, 8) — stand there, tap "Estamos aquí" on a test team (without Modo prueba) and confirm it passes. Adjust `lat/lng/radius` in `hunt.stops` if not.
- [ ] **Stop 1 facade wording** matches the sentence around the boxes ("las armas… darán la libertad"; only the 7 letters are checked).
- [ ] **BibloRed on a Saturday:** confirm walk-in affiliation works for non-residents/foreigners (ID needed?) and opening hours; decide a fallback if a team can't get a card (e.g. photo in the reading room).
- [ ] **Venue hours for Sat 3 Oct:** Botero, Casa de Moneda, Quinta de Bolívar, Perseverancia market (ajiaco stall + backup), Matorral, Virgilio Barco.
- [ ] **Print** Quiz 1 (Ross) and Quiz 2 (Julia) — both 2 pages, updated 30 Sep; bring pens.
- [ ] **Day-before reset:** reset both test teams; confirm event teams have no progress (they don't today).
- [ ] **Share the admin passcode with Julia**; both test the admin on phones.

**Decisions still open (Julia)**
- [x] Quiz points vs speed → **combined quiz cap 70** (30 Sep).
- [x] Duration: leave Partiful as is (Ross, 30 Sep).
- [x] Text nits fixed 30 Sep: stop 6 "para continuar", stop 7 "Una protagonista famosa" (Betty = a woman), stop 1 hint "Una fachada en la Plaza de Bolívar…".
- [ ] Anagram help free or costs points? (currently free)
- [ ] Riddles for the coin / prom side quests? (currently their places are shown)

## 8. Day-of runbook

1. **At the park (09:45):** make 5 teams (≥1 Bogotano each). In admin, type members per team, **Copy link** → paste into each team's WhatsApp group. Tell teams: open the link, allow **location**, keep data on.
2. Teams name themselves on the waiting screen.
3. Start: either **Start now** per team as each leaves (10 min apart), or "Shuffle order & schedule" from 10:00 / 10 min.
4. During: watch the **Review queue** (approve/reject photos), no-GPS check-ins are flagged amber. Ross runs Quiz 1 at Quinta de Bolívar, Julia Quiz 2 at Virgilio Barco — photo the sheets, enter counts in "Quizzes & awards".
5. **At FRANC:** teams confirm taxis on their phones; award Theatron photo + drink can; check poets/writers/musicians from Quiz 2 notes; enter totals; open **Reveal**.
6. If location fails on a phone: iPhone → Settings › Privacy › Location Services › Safari → While Using; reload.

## 9. Ideas not built (next steps, if wanted)

- ~~Photo slideshow~~ and ~~zip export~~ — built 30 Sep. Still to do after the event: purge `hunt.subs.media` (it lives in the Personal Library project).
- ~~Share card~~ — built 30 Sep.
- WhatsApp hunt agent via OpenClaw (the original "Pipo" idea) for nudges/commentary — deferred.
- GPS-speed taxi inference — discussed and **rejected** in favour of the per-leg question.
- Crowd vote for the Theatron photo, team chants, nemesis/dares (social ideas from the first session).
