# 1-Plan-v0 — AUDIT

## Hypotheses (minimaal 5)

1. **[H1-Stale-Queue-Items]** — Er zijn 28 queue_items in `state = 'review'` of `'fail'` met `resolved_at IS NULL` die eigenlijk allang resolved zijn maar waarvan het resolved_at veld nooit is gezet. De /api/notifications query filtert op `.is("resolved_at", null)`, dus deze items blijven verschijnen. | **Verificatie:** Directe SQL query op `aio_control.queue_items` naar count + lijst van items in `review`/`fail` state zonder resolved_at, eventueel gegroepeerd per workspace.

2. **[H2-Dismissal-Record-Desync]** — De user heeft wel dismissals in `notification_dismissals` staan, maar de dismiss API call faalde (fetch error of Supabase upsert error) waardoor de client-side items array nooit correct leeg raken. In de `dismissAll` functie worden errors genegeerd (`.catch(() => {})`), dus de gebruiker ziet geen fout maar de items verdwijnen niet. | **Verificatie:** SQL check `SELECT COUNT(*) FROM aio_control.notification_dismissals WHERE user_id = <user>` vergelijken met het aantal daadwerkelijk getoonde notificaties in de bell; ook Supabase logs的控制台 for recent upsert errors.

3. **[H3-RLS-Policy-Block]** — De RLS policies op `queue_items` of `runs` blokkeren de read query in `/api/notifications` voor deze specifieke user, waardoor de Supabase client een error teruggeeft die in de code wordt gevangen en de items array onveranderd blijft (of fallback data terugkomt). De Bell fetched immers met `.catch(() => null)` en returned dan de oude state. | **Verificatie:** Test de NotificationBell API call的手动 met dezelfde user credentials in Supabase dashboard of via een debug endpoint; check of de `queue_items` en `runs` queries resultaten opleveren of een RLS error geven.

4. **[H4-Realtime-Feedback-Loop]** — De Supabase Realtime subscription op `queue_items` triggers een `refresh()` wanneer enig dataverandering plaatsvindt. Als er een trigger of external process is dat herhaaldelijk updates into `queue_items` schrijft, ontstaat een feedback loop: refresh -> trigger -> refresh. De count永远 blijft hoog omdat de refresh telkens nieuwe items ophaalt. | **Verificatie:** Monitor realtime events in de browser DevTools Network tab voor de Supabase websocket; check of er een hoge frequentie van events is; check database triggers op queue_items.

5. **[H5-Workspace-Id-Mismatch]** — De `workspaceId` prop die aan `NotificationsBell` wordt meegegeven (en gebruikt voor de Realtime filter en de API call) is niet de juiste workspace voor deze user. Hierdoor zie je notificaties van een andere workspace of helemaal geen dismissals omdat de user_id + workspace combinatie niet klopt. | **Verificatie:** Log de workspaceId in de NotificationsBell bij initial load; vergelijk met `workspaces` table welke workspace bij de user hoort; check of de user meerdere workspaces heeft.

6. **[H6-Migration-042-Absent]** — Migration 042 (`042_notification_dismissals.sql`) is niet gerund op de productie database van TrompTechDesigns. De `notification_dismissals` table bestaat daardoor niet of is leeg, waardoor de dismiss upsert faalt (maar silently, want de catch block in de client eet de error) en de items nooit verdwijnen. | **Verificatie:** Check via Supabase dashboard of de `aio_control.notification_dismissals` table bestaat en wat de row count is voor de betreffende user; vergelijk migration history tussen localhost en productie.

7. **[H7-Failed-Runs-Stuck]** — Er zijn 28 failed runs in de `runs` tabel (status = 'failed') die nooit worden opgelost. De notification API telt failed runs zonder tijdslimiet (alleen beperkt tot `limit(10)` voor de bell maar tellend in het totaal). Als al deze runs bij dezelfde workspace horen, blijven ze tot in de eeuwigheid verschijnen. | **Verificatie:** SQL query `SELECT COUNT(*) FROM aio_control.runs WHERE status = 'failed' AND workspace_id = '<ws>'` vergelijken met de 28 notifications.

---

## Investigation approach

**Stap 1 — Directe DB queries (prioriteit 1, snelst, geen code nodig)**

Doe via Supabase dashboard (of mcp__supabase__execute_sql) de volgende queries:

```sql
-- A: Hoeveel open queue items zijn er per workspace?
SELECT workspace_id, state, COUNT(*)
FROM aio_control.queue_items
WHERE state IN ('review', 'fail') AND resolved_at IS NULL
GROUP BY workspace_id, state;

-- B: Hoeveel failed runs zijn er per workspace?
SELECT workspace_id, COUNT(*) as failed_count
FROM aio_control.runs
WHERE status = 'failed'
GROUP BY workspace_id;

-- C: Hoeveel dismissal records heeft de betreffende user?
SELECT user_id, source_kind, COUNT(*)
FROM aio_control.notification_dismissals
GROUP BY user_id, source_kind;
```

Dit identificeert of H1, H7, of H6 actief zijn zonder enige code te touchen.

**Stap 2 — API endpoint test**

Manually call `GET /api/notifications` met de session van de betreffende user (via browser DevTools of een curl met de juiste SB session cookie). Bekijk de JSON response:
- tel `{ items }` array length
- check of de items `kind` en `id` overeenkomen met de verwachte queue items of runs

**Stap 3 — Supabase Realtime inspectie**

Open de browser DevTools bij de user, tab Network, filter op `supabase` of websocket. Kijk of er een hoge frequentie van realtime events binnenkomt (elke paar seconden). Als er elke paar seconden events binnenkomen, wijst dat op H4.

**Stap 4 — Migratie status check**

Check via `mcp__supabase__list_migrations` of migration 042 daadwerkelijk is gerund op de productie database. Vergelijk met de lokale migrations folder.

**Stap 5 — RLS policy verification**

Test de RLS policies interactief in Supabase dashboard door als de betreffende user queries te draaien op `queue_items` en `runs` met een workspace filter.

---

## Prioriteit

**Start met Stap 1 (directe DB queries)** — Dit is de snelste manier om H1, H6, H7 te排除 of te bevestigen zonder code te touchen. Als blijkt dat er inderdaad 28 queue_items in review/fail state zijn, dan is H1 de root cause en is de fix simpel: die items resolven of hun resolved_at zetten.

**Parallel daarmee:** Check de migratie status (Stap 4) — als migration 042 niet is gerund, is H6 de root cause en moet die migration eerst worden gedraaid.

**Daarna:** Als de DB queries geen grote aantallen showen, moving naar Stap 2 (API test) en Stap 5 (RLS check) want dan zou H2 of H3 waarschijnlijker zijn.

---

## Mode
AUDIT
Model: opus