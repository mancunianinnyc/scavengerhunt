# bogota-hunt — project notes for Claude

**Start every session by reading `HANDOFF.md`** (state, architecture, gotchas, open items, day-of runbook).

- Live: https://hunt.rossgarlick.com (team links `/?t=<token>`), admin at `/admin` (passcode in `.env.local`, never commit it).
- Deploy = `git push origin main` (Vercel project `bogota-hunt`). Commits authored as `Ross Garlick <10098878+mancunianinnyc@users.noreply.github.com>`.
- Data = Supabase project `flbjlwckcgtlamnpabmj`, schema `hunt` only; access only via `public.hunt_*` SECURITY DEFINER RPCs.
- Hard rule: never name the final destination (FRANC) in anything players can see, including public JS.
- Test on test teams only (`is_test`); use a temporary test team for automated checks and delete it afterwards.
- Vercel conventions: `Claude Workspace/VERCEL-CONVENTIONS.md`.
