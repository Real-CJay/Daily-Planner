-- Private bucket for running app screenshots (accessible only via signed URLs by owner)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'run-screenshots',
  'run-screenshots',
  false,
  10485760, -- 10 MB per screenshot
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy "screenshots_select_own"
on storage.objects for select
using (
  bucket_id = 'run-screenshots'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "screenshots_insert_own"
on storage.objects for insert
with check (
  bucket_id = 'run-screenshots'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "screenshots_delete_own"
on storage.objects for delete
using (
  bucket_id = 'run-screenshots'
  and auth.uid()::text = (storage.foldername(name))[1]
);