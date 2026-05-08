-- 073_repair_local_outbox_outreach_labels.sql
--
-- The local outreach pipeline prepared reports/pitches but did not have
-- email or contact-form access. Older runs incorrectly marked those rows
-- as "outreached". Repair only that precise local-outbox footprint and
-- leave real sends untouched.

update aio_control.outreach_leads
   set status = 'pending_whatsapp',
       sent_via = 'aio_pipeline_local_outbox_pending',
       outreach_pipeline_outreached_at = null,
       updated_at = now()
 where status = 'outreached'
   and sent_via = 'aio_pipeline_local_outbox'
   and sent_at is null;
