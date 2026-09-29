# El Gran Scavenger Hunt de Bogotá

Team app + quizmaster admin for the 3 Oct 2026 hunt. Static pages on Vercel, data in Supabase.

- `public/index.html` + `team.js`: the team app. Each team opens `/?t=<token>` (links are copied from the admin page).
- `public/admin.html` + `admin.js`: teams, members, departures (Start / schedule), proof review, scoring, reveal. Passcode in `.env.local` (not committed).
- `supabase/migrations/`: `hunt` schema. Tables are locked (RLS, no grants); all access is via `public.hunt_*` SECURITY DEFINER functions that check a team token or the admin passcode. Clues are released one stop at a time; answers and GPS distance are checked server-side.
- `supabase/seed.sql`: stops, clues, hints, side quests, teams.
- Supabase project: Personal Library (`flbjlwckcgtlamnpabmj`), schema `hunt` only.
- Photos are downscaled on the phone (1280 px JPEG) and stored in `hunt.subs.media`.

Vercel conventions: see `Claude Workspace/VERCEL-CONVENTIONS.md`. No build step; output dir is `public/`.

Repo: github.com/mancunianinnyc/scavengerhunt (push via SSH alias `github-bogota-hunt`, deploy key `~/.ssh/bogota_hunt_deploy`). Vercel project `bogota-hunt` is git-connected: pushes to `main` deploy to hunt.rossgarlick.com; commits touching only `supabase/` or `README.md` are skipped.
