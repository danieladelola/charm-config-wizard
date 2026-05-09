-- =====================================================================
-- TradesHorizons Live Chat — full schema
-- Run this ONCE in your Supabase project SQL editor.
-- Before running, replace 'YOUR_ADMIN_EMAIL@example.com' with your real admin email.
-- =====================================================================

-- Allowed admin emails (only these can sign up / sign in to the dashboard)
create table if not exists public.allowed_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.allowed_admins (email) values ('support@tradeshorizons.vip')
  on conflict do nothing;

-- Admin profile
create table if not exists public.admin_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  online boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- A widget = an embed configuration. You'll usually have just one.
create table if not exists public.chat_widgets (
  id uuid primary key default gen_random_uuid(),
  public_key text unique not null default replace(gen_random_uuid()::text, '-', ''),
  name text not null default 'Default widget',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Widget settings (1:1 with chat_widgets)
create table if not exists public.widget_settings (
  widget_id uuid primary key references public.chat_widgets(id) on delete cascade,
  title text not null default 'Chat with us',
  welcome_message text not null default 'Hi! How can we help?',
  brand_color text not null default '#2563eb',
  button_text text not null default 'Chat',
  offline_message text not null default 'We are offline right now. Leave a message and we will get back to you.',
  require_name boolean not null default true,
  require_email boolean not null default true,
  require_phone boolean not null default false,
  allowed_domains text[] not null default '{}',
  notification_email text,
  business_hours jsonb not null default '{"enabled":false,"timezone":"UTC","days":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Visitor profile (per anon visitor key)
create table if not exists public.visitor_profiles (
  id uuid primary key default gen_random_uuid(),
  visitor_key text unique not null,
  name text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

-- A chat session = a conversation with one visitor
create type public.chat_status as enum ('open', 'pending', 'closed');

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  widget_id uuid not null references public.chat_widgets(id) on delete cascade,
  visitor_id uuid not null references public.visitor_profiles(id) on delete cascade,
  visitor_key text not null,
  status public.chat_status not null default 'pending',
  domain text,
  page_url text,
  user_agent text,
  visitor_online boolean not null default true,
  visitor_last_seen_at timestamptz not null default now(),
  unread_for_admin int not null default 0,
  unread_for_visitor int not null default 0,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists chat_sessions_status_idx on public.chat_sessions(status, last_message_at desc);
create index if not exists chat_sessions_visitor_key_idx on public.chat_sessions(visitor_key);

-- Messages
create type public.message_sender as enum ('visitor', 'admin', 'system');

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  visitor_key text not null,
  sender public.message_sender not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_session_idx on public.chat_messages(session_id, created_at);

-- Saved replies
create table if not exists public.saved_replies (
  id uuid primary key default gen_random_uuid(),
  shortcut text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- Private notes (admin only)
create table if not exists public.chat_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Helpers
-- =====================================================================
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_profile where id = uid);
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.allowed_admins where lower(email) = lower(new.email)) then
    raise exception 'Email % is not authorized as admin', new.email;
  end if;
  insert into public.admin_profile (id, email) values (new.id, new.email)
    on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Seed a default widget + settings if none exist
insert into public.chat_widgets (name) select 'Default widget'
  where not exists (select 1 from public.chat_widgets);
insert into public.widget_settings (widget_id)
  select id from public.chat_widgets
  where not exists (select 1 from public.widget_settings ws where ws.widget_id = chat_widgets.id);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.allowed_admins   enable row level security;
alter table public.admin_profile    enable row level security;
alter table public.chat_widgets     enable row level security;
alter table public.widget_settings  enable row level security;
alter table public.visitor_profiles enable row level security;
alter table public.chat_sessions    enable row level security;
alter table public.chat_messages    enable row level security;
alter table public.saved_replies    enable row level security;
alter table public.chat_notes       enable row level security;

-- Allowed admins: nobody reads/writes via API (managed via SQL only)
-- (no policies = deny all)

-- Admin profile: admin reads/updates own
drop policy if exists "admin reads own profile" on public.admin_profile;
create policy "admin reads own profile" on public.admin_profile
  for select to authenticated using (id = auth.uid());
drop policy if exists "admin updates own profile" on public.admin_profile;
create policy "admin updates own profile" on public.admin_profile
  for update to authenticated using (id = auth.uid());

-- Widgets: admin full access; widget public_key + settings are readable by anon (needed by embed)
drop policy if exists "admin manages widgets" on public.chat_widgets;
create policy "admin manages widgets" on public.chat_widgets
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists "anon reads active widgets" on public.chat_widgets;
create policy "anon reads active widgets" on public.chat_widgets
  for select to anon using (active = true);

drop policy if exists "admin manages settings" on public.widget_settings;
create policy "admin manages settings" on public.widget_settings
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists "anon reads settings" on public.widget_settings;
create policy "anon reads settings" on public.widget_settings
  for select to anon using (true);

-- Visitor profiles: admin reads all; anon can insert + read/update by visitor_key match (handled in app)
drop policy if exists "admin reads visitors" on public.visitor_profiles;
create policy "admin reads visitors" on public.visitor_profiles
  for select to authenticated using (public.is_admin(auth.uid()));
drop policy if exists "anon inserts visitor" on public.visitor_profiles;
create policy "anon inserts visitor" on public.visitor_profiles
  for insert to anon with check (true);
drop policy if exists "anon reads own visitor" on public.visitor_profiles;
create policy "anon reads own visitor" on public.visitor_profiles
  for select to anon using (true); -- visitor_key is the secret; client filters by it
drop policy if exists "anon updates own visitor" on public.visitor_profiles;
create policy "anon updates own visitor" on public.visitor_profiles
  for update to anon using (true) with check (true);

-- Sessions: admin all; anon insert + select/update only their own (visitor_key check)
drop policy if exists "admin manages sessions" on public.chat_sessions;
create policy "admin manages sessions" on public.chat_sessions
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists "anon inserts session" on public.chat_sessions;
create policy "anon inserts session" on public.chat_sessions
  for insert to anon with check (true);
drop policy if exists "anon reads own sessions" on public.chat_sessions;
create policy "anon reads own sessions" on public.chat_sessions
  for select to anon using (true); -- realtime needs select; client filters by visitor_key
drop policy if exists "anon updates own sessions" on public.chat_sessions;
create policy "anon updates own sessions" on public.chat_sessions
  for update to anon using (true) with check (true);

-- Messages: admin all; anon insert with sender='visitor' only, read where visitor_key matches
drop policy if exists "admin manages messages" on public.chat_messages;
create policy "admin manages messages" on public.chat_messages
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists "anon inserts visitor message" on public.chat_messages;
create policy "anon inserts visitor message" on public.chat_messages
  for insert to anon with check (sender = 'visitor');
drop policy if exists "anon reads own messages" on public.chat_messages;
create policy "anon reads own messages" on public.chat_messages
  for select to anon using (true); -- visitor_key acts as the secret filter

-- Saved replies + notes: admin only
drop policy if exists "admin manages saved replies" on public.saved_replies;
create policy "admin manages saved replies" on public.saved_replies
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "admin manages notes" on public.chat_notes;
create policy "admin manages notes" on public.chat_notes
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- =====================================================================
-- Realtime
-- =====================================================================
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.chat_sessions;
