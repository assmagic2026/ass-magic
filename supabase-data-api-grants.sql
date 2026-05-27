-- Explicit Data API grants for ASS MAGIC's public book table.
-- Run this in Supabase SQL Editor for the ass-magic-book project.

grant usage on schema public to anon, authenticated;
grant select, insert on table public.book_messages to anon, authenticated;
grant usage, select on sequence public.book_messages_id_seq to anon, authenticated;
