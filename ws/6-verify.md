## VPS Health Check

**SSH Access:** Geen toegang via Tailscale SSH (87.106.146.35) - Permission denied (publickey)

**Wat we wel konden checken (via WebFetch):**

| Check | Resultaat |
|-------|-----------|
| Health endpoint (https://aio.tromptech.life/api/health) | OK - Supabase check passing |
| Version endpoint (https://aio.tromptech.life/api/version) | Beschikbaar |

**Version details van VPS:**
- Commit: `1e7d626dfd6ea51fdaba14683b272ebffd082bf3`
- Node: `v22.22.2`
- Build: `2026-05-04T12:02:33+00:00`

**Wat we nog moeten checken:**
- SSH toegang herstellen (key probleem)
- Directe health check op server (127.0.0.1:3010 of 3012)
- Recente logs via journalctl

---

## Local vs VPS Code Vergelijking

| | Local | VPS |
|---|-------|-----|
| **Git commit** | `aa5a07abb1c4c3b830e799398262f1b6cfaa7a36` | `1e7d626dfd6ea51fdaba14683b272ebffd082bf3` |
| **Status** | neuwste commit op main | 1e7d626 (oudere commit) |
| **Build datum VPS** | - | 2026-05-04T12:02:33 |

**Verschil:** VPS draait op commit `1e7d626` - dit is 1 commit achter op de lokale `aa5a07a`. De VPS is gebouwd op 2026-05-04 12:02:33 UTC.

**Volgende stap:** SSH toegang herstellen om direct op de VPS te kunnen checken en eventueel te deployen.