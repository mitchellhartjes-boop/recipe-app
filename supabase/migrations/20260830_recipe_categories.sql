-- User-chosen categories. Until now a recipe's categories were derived purely
-- from keyword matches on its title/tags/ingredients (src/lib/categories.ts),
-- so there was nothing to correct when the matcher guessed wrong.
--
-- NULL is meaningful and is the default: it means "the user never chose", so
-- the keyword matcher decides, exactly as before. Every existing recipe stays
-- NULL and behaves identically. A non-NULL array is the user's explicit answer
-- and wins outright - including an empty array, which means "no categories,
-- and I meant it".
--
-- MUST be applied BEFORE deploying the web build that writes this column;
-- otherwise every recipe save fails on an unknown column.

alter table public.recipe_recipes
  add column if not exists categories text[];

comment on column public.recipe_recipes.categories is
  'User-chosen category slugs (see src/lib/categories.ts). NULL = fall back to keyword matching.';

-- Verify:
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'recipe_recipes' and column_name = 'categories';
