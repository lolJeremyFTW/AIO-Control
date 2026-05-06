-- 051_outreach_master.sql — Promote outreach_leads to the single source
-- of truth for outreach lead data, replacing /home/jeremy/OutreachAutomation/leads_data.js.
--
-- Why: the JS file is non-atomic (with open(... 'w')) and three crons
-- write to it concurrently — yesterday this lost 200+ leads when a
-- 18-minute find-leads run finished and clobbered the freshly-grown
-- file with its stale 18-min-old copy. Postgres gives us atomicity +
-- per-row locks for free.
--
-- Strategy:
--   • Add lead-data columns (status, pitch, naam, telefoon, etc.) so
--     the existing freebie-tracking row IS the lead row — no join.
--   • Make freebie-related columns nullable (a lead exists before we
--     ever generate a freebie for it).
--   • New legacy_id column carries the original integer id from the
--     JS file so old freebie-file paths and external links keep working.

alter table aio_control.outreach_leads
  -- Lead identity
  add column if not exists legacy_id integer,
  add column if not exists bedrijfsnaam text,
  add column if not exists telefoon text,
  add column if not exists contact_url text,

  -- Pipeline state
  add column if not exists status text not null default 'new',
  add column if not exists pitch text,
  add column if not exists pitch_variant text,
  add column if not exists angle text,
  add column if not exists test_group text,
  add column if not exists opmerkingen text,
  add column if not exists rejection_reason text,
  add column if not exists previous_rejection text,
  add column if not exists pitch_revised boolean default false,

  -- Send / response state
  add column if not exists sent_at timestamptz,
  add column if not exists sent_via text,
  add column if not exists wa_link text,
  add column if not exists form_fail_reason text,

  -- Freebie (already had html_content, score, angle_scores)
  add column if not exists freebie_generated_at timestamptz,
  add column if not exists freebie_path text;

-- HTML and lead_name go nullable — leads exist before they have a freebie.
alter table aio_control.outreach_leads
  alter column html_content drop not null,
  alter column lead_name drop not null,
  alter column token drop not null;

-- vps_lead_id was originally not null + unique. Keep unique but drop
-- not-null so manually-added leads don't need a JS file id. Replace
-- with legacy_id semantics.
alter table aio_control.outreach_leads
  alter column vps_lead_id drop not null;

-- legacy_id carries the same number as vps_lead_id for back-compat.
-- Backfill from existing rows.
update aio_control.outreach_leads
   set legacy_id = vps_lead_id
 where legacy_id is null and vps_lead_id is not null;

-- Status check constraint — keeps invalid statuses from sneaking in.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'outreach_leads_status_chk'
  ) then
    alter table aio_control.outreach_leads
      add constraint outreach_leads_status_chk check (status in (
        'new', 'pitched', 'approved', 'rejected', 'sent',
        'freebie_ready', 'pending_whatsapp',
        'contactformulier_failed', 'responded', 'handmatig'
      ));
  end if;
end $$;

create index if not exists idx_outreach_leads_status
  on aio_control.outreach_leads(workspace_id, status);
create index if not exists idx_outreach_leads_legacy
  on aio_control.outreach_leads(workspace_id, legacy_id);
create index if not exists idx_outreach_leads_branche
  on aio_control.outreach_leads(workspace_id, lead_branche);
