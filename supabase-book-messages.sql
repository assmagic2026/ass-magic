create table if not exists public.book_messages (
  id bigint generated always as identity primary key,
  name text not null default 'anonymous',
  message text not null check (char_length(message) between 1 and 280),
  created_at timestamptz not null default now()
);

grant usage on schema public to anon, authenticated;
grant select, insert on table public.book_messages to anon, authenticated;
grant usage, select on sequence public.book_messages_id_seq to anon, authenticated;

alter table public.book_messages enable row level security;

drop policy if exists "book messages are readable by anyone" on public.book_messages;
create policy "book messages are readable by anyone"
on public.book_messages
for select
using (true);

drop policy if exists "book messages are writable by anyone" on public.book_messages;
create policy "book messages are writable by anyone"
on public.book_messages
for insert
with check (true);
