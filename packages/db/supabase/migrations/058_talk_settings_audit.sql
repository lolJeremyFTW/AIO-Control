-- 058_talk_settings_audit.sql - make voice/talk settings changes visible in audit logs.

drop trigger if exists trg_audit_talk_settings on aio_control.talk_settings;
create trigger trg_audit_talk_settings
  after insert or update or delete on aio_control.talk_settings
  for each row execute function aio_control._audit_row();

