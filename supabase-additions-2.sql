-- =====================================================================
-- TradesHorizons Live Chat — additions for: file attachments + geo
-- Run this ONCE in Supabase SQL editor (after the original schema).
-- =====================================================================

-- 1) New columns on chat_messages for attachments
alter table public.chat_messages
  add column if not exists attachment_url  text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text,
  add column if not exists attachment_size int;

-- Allow empty body when there's an attachment
alter table public.chat_messages alter column body drop not null;

-- 2) New columns on chat_sessions for visitor geo (IP-based)
alter table public.chat_sessions
  add column if not exists country      text,
  add column if not exists country_code text,
  add column if not exists city         text,
  add column if not exists ip_address   text;

-- 3) Storage bucket for chat attachments (public-read)
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do nothing;

-- Storage RLS policies
drop policy if exists "chat attachments public read"   on storage.objects;
create policy "chat attachments public read" on storage.objects
  for select to public using (bucket_id = 'chat-attachments');

drop policy if exists "chat attachments anon upload"   on storage.objects;
create policy "chat attachments anon upload" on storage.objects
  for insert to anon with check (bucket_id = 'chat-attachments');

drop policy if exists "chat attachments admin upload" on storage.objects;
create policy "chat attachments admin upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'chat-attachments');

drop policy if exists "chat attachments admin delete" on storage.objects;
create policy "chat attachments admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'chat-attachments');
