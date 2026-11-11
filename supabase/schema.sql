-- Run in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;
create table if not exists public.inspirations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null, photo_path text not null,
 seasons text[] not null default '{}',
 status text not null default 'wishlist' check(status in ('wishlist','tried')),
 created_at timestamptz not null default now()
);
create table if not exists public.manicure_entries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 design_name text not null, date_done date not null,
 start_time time, finish_time time, price numeric(12,2),
 season text check(season is null or season in ('Spring','Summer','Autumn','Winter')),
 created_at timestamptz not null default now()
);
alter table public.inspirations enable row level security;
alter table public.manicure_entries enable row level security;
drop policy if exists "Owners manage their inspirations" on public.inspirations;
create policy "Owners manage their inspirations" on public.inspirations for all to authenticated
 using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Owners manage their manicure entries" on public.manicure_entries;
create policy "Owners manage their manicure entries" on public.manicure_entries for all to authenticated
 using(auth.uid()=user_id) with check(auth.uid()=user_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('nail-photos','nail-photos',false,10485760,array['image/jpeg','image/png','image/webp','image/heic'])
on conflict(id) do update set public=false;
drop policy if exists "Owners upload their nail photos" on storage.objects;
create policy "Owners upload their nail photos" on storage.objects for insert to authenticated
 with check(bucket_id='nail-photos' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Owners view their nail photos" on storage.objects;
create policy "Owners view their nail photos" on storage.objects for select to authenticated
 using(bucket_id='nail-photos' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Owners delete their nail photos" on storage.objects;
create policy "Owners delete their nail photos" on storage.objects for delete to authenticated
 using(bucket_id='nail-photos' and (storage.foldername(name))[1]=auth.uid()::text);