create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notifications_enabled boolean not null default true,
  notification_sound text not null default 'default',
  vibration_enabled boolean not null default true,
  message_preview boolean not null default true,
  theme text not null default 'system',
  primary_color text not null default '#28A156',
  dark_mode boolean not null default false,
  font_family text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "Users manage own preferences" on public.user_preferences;
create policy "Users manage own preferences"
  on public.user_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.user_preferences to authenticated;
grant all on public.user_preferences to service_role;
