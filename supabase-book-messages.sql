create table if not exists public.book_messages (
  id bigint generated always as identity primary key,
  name text not null default 'anonymous',
  message text not null check (char_length(message) between 1 and 280),
  created_at timestamptz not null default now()
);

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
