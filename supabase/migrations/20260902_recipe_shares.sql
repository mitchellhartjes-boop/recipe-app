-- Sharing a recipe with someone who may not have Dilla.
--
-- The link has to be readable by a person with NO account, which is the whole
-- point (it is how someone meets Dilla). But recipe_recipes is protected by
-- `auth.uid() = user_id`, and loosening that to make sharing work would open
-- every recipe in the table.
--
-- So the public read never touches this table directly. A serverless function
-- holding the service role validates the token and returns just that one
-- recipe. This table is the gate; RLS below only covers the OWNER managing
-- their own links.

create table if not exists public.recipe_shares (
  -- Random, url-safe, generated client-side from crypto.getRandomValues.
  -- It is a bearer credential: anyone holding it can read that one recipe,
  -- which is exactly what "send this to a friend" means.
  token       text primary key,
  recipe_id   uuid not null references public.recipe_recipes(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- 30 days. A link pasted into a group chat outlives the conversation, and an
  -- immortal bearer token for a recipe someone may later edit or delete is a
  -- promise we did not mean to make.
  expires_at  timestamptz not null default (now() + interval '30 days'),
  revoked_at  timestamptz,
  view_count  integer not null default 0
);

create index if not exists recipe_shares_recipe_idx on public.recipe_shares (recipe_id);
create index if not exists recipe_shares_user_idx on public.recipe_shares (user_id);

alter table public.recipe_shares enable row level security;

-- Owners manage their own links. Deliberately NO public select policy: the
-- anonymous read path is the service-role function, so a leaked token can only
-- ever surface the single recipe it points at, never the table.
drop policy if exists recipe_shares_owner on public.recipe_shares;
create policy recipe_shares_owner on public.recipe_shares
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Verify:
--   select token, expires_at, revoked_at from public.recipe_shares limit 1;
--
-- Housekeeping (optional, later): expired rows are harmless because the reader
-- checks expires_at, but they accumulate.
--   delete from public.recipe_shares where expires_at < now() - interval '90 days';
