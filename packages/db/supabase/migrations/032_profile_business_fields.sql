-- 032_profile_business_fields.sql — extend profiles with the address
-- + phone + business identifiers needed for invoicing, GDPR
-- correspondence, and KYC. All optional; the user fills what
-- applies. NL-flavoured field names but the columns themselves are
-- locale-agnostic.

alter table aio_control.profiles
  add column if not exists phone text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists company_name text,
  add column if not exists business_number text,  -- KvK in NL, Companies House in UK, etc.
  add column if not exists tax_id text;            -- BTW-nummer / VAT / EIN
