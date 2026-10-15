-- Index the foreign key routes.public_author_id (flagged by the Supabase performance advisor):
-- deleting a user cascades through it, and Phase 4 joins routes_public → profiles on it.
create index routes_public_author_id_idx on public.routes (public_author_id);
