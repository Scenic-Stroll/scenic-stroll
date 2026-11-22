-- Knowledge pins, phase 4 (D54): "Delete my data" removes your pin collection from the server too.
grant delete on table public.collection_entries to authenticated;
create policy "users delete their own collection"
  on public.collection_entries for delete to authenticated
  using (user_id = (select auth.uid()));
