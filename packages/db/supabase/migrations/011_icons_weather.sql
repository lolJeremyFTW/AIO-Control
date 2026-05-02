-- 011_icons_weather.sql — Phase 7+: emoji icons + per-workspace weather
-- location.
--
-- Why emoji and not SVG/uploaded images? Emoji are a universal
-- 1-character "icon" that renders in any browser, requires no upload
-- pipeline, and survives the JSON dump cleanly. If a user really wants
-- a custom SVG/PNG icon later, we can add a separate icon_url column.

alter table aio_control.businesses
  add column if not exists icon text;
alter table aio_control.profiles
  add column if not exists avatar_icon text;

-- Per-workspace weather location, defaults to Breda. The current
-- workspace's coords land in the header chip via getWeather().
alter table aio_control.workspaces
  add column if not exists weather_city text not null default 'Breda',
  add column if not exists weather_lat numeric not null default 51.589,
  add column if not exists weather_lon numeric not null default 4.776;
