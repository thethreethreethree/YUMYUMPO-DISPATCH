-- ============================================================
-- YUMYUMPO DISPATCH — Production schema
-- Run this in Supabase SQL editor on a fresh project.
-- It is safe to re-run (uses IF NOT EXISTS / DO blocks).
-- ============================================================

create extension if not exists "pgcrypto";

-- ===================== ENUMS ================================
do $$ begin
  create type vehicle_type as enum ('motorcycle','bicycle','scooter','car','walking');
exception when duplicate_object then null; end $$;

do $$ begin
  create type availability_status as enum ('online','available','busy','offline');
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_status as enum ('pending','verified','rejected','suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type delivery_status as enum ('Available','Accepted','Picked Up','Delivered','Cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_kind as enum (
    'request_new','request_accepted','request_declined','request_expired','request_cancelled',
    'rider_arrived','delivery_completed','no_response',
    'preferred_online','preferred_unavailable','rider_zone_changed','rider_suspended',
    'verification_approved','verification_rejected','account_warning','profile_incomplete',
    'new_rider_nearby','new_restaurant_nearby','system'
  );
exception when duplicate_object then null; end $$;

-- ===================== ADMIN CLAIM HELPER ===================
-- Mark a user as admin in the auth.users.raw_app_meta_data JSON:
--   update auth.users set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data,'{}'::jsonb),'{is_admin}','true')
--   where email = 'you@example.com';
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false);
$$;

-- ===================== TABLES ===============================

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  contact_phone text,
  whatsapp text,
  city text,
  default_zone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists riders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  profile_photo text,
  government_id text,
  selfie_photo text,
  phone text not null,
  whatsapp text not null,
  vehicle_type vehicle_type not null default 'motorcycle',
  delivery_zones text[] default '{}',
  availability_status availability_status default 'offline',
  rating numeric(3,2) default 0,
  completed_deliveries int default 0,
  verification_status verification_status default 'pending',
  preferred_count int default 0,
  base_fee numeric(10,2) default 0,
  per_km_fee numeric(10,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists riders_status_idx on riders (availability_status);
create index if not exists riders_zones_idx  on riders using gin (delivery_zones);
create index if not exists riders_verify_idx on riders (verification_status);

create table if not exists rider_zones (
  zone text primary key,
  city text,
  active boolean default true
);

create table if not exists rider_availability (
  id bigserial primary key,
  rider_id uuid references riders(id) on delete cascade,
  status availability_status not null,
  changed_at timestamptz default now()
);

create table if not exists delivery_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  rider_id uuid references riders(id) on delete set null,
  zone text not null,
  pickup text not null,
  dropoff text not null,
  notes text,
  status delivery_status default 'Available',
  expires_at timestamptz default (now() + interval '5 minutes'),
  created_at timestamptz default now(),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists requests_status_idx on delivery_requests (status);
create index if not exists requests_zone_idx   on delivery_requests (zone);
create index if not exists requests_rider_idx  on delivery_requests (rider_id);
create index if not exists requests_rest_idx   on delivery_requests (restaurant_id);

create table if not exists preferred_riders (
  restaurant_id uuid references restaurants(id) on delete cascade,
  rider_id uuid references riders(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (restaurant_id, rider_id)
);

create table if not exists rider_verifications (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references riders(id) on delete cascade,
  id_url text,
  selfie_url text,
  video_url text,
  notes text,
  status verification_status default 'pending',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists verifications_status_idx on rider_verifications (status);

create table if not exists rider_ratings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  rider_id uuid references riders(id) on delete cascade,
  request_id uuid references delivery_requests(id) on delete set null,
  metric text not null check (metric in ('punctuality','professionalism','communication','reliability','food_handling')),
  value int check (value between 1 and 5),
  created_at timestamptz default now()
);
create index if not exists ratings_rider_idx on rider_ratings (rider_id);

create table if not exists delivery_activity (
  id bigserial primary key,
  request_id uuid references delivery_requests(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists analytics_events (
  id bigserial primary key,
  actor_type text,
  actor_id uuid,
  event text not null,
  payload jsonb,
  created_at timestamptz default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null check (recipient_type in ('restaurant','rider','admin')),
  recipient_id uuid not null,
  kind notification_kind not null,
  title text not null,
  body text,
  request_id uuid references delivery_requests(id) on delete set null,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists notifications_recipient_idx on notifications (recipient_type, recipient_id, read_at);
create index if not exists notifications_created_idx   on notifications (created_at desc);

-- ===================== TRIGGERS =============================
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;

drop trigger if exists tg_restaurants_touch on restaurants;
create trigger tg_restaurants_touch before update on restaurants
  for each row execute function public.touch_updated_at();

drop trigger if exists tg_riders_touch on riders;
create trigger tg_riders_touch before update on riders
  for each row execute function public.touch_updated_at();

-- Record rider availability changes for analytics + history.
create or replace function public.log_rider_status() returns trigger
language plpgsql as $$
begin
  if (new.availability_status is distinct from old.availability_status) then
    insert into rider_availability (rider_id, status) values (new.id, new.availability_status);
  end if;
  return new;
end; $$;
drop trigger if exists tg_rider_status on riders;
create trigger tg_rider_status after update of availability_status on riders
  for each row execute function public.log_rider_status();

-- Keep preferred_count in sync.
create or replace function public.sync_preferred_count() returns trigger
language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update riders set preferred_count = preferred_count + 1 where id = new.rider_id;
  elsif (tg_op = 'DELETE') then
    update riders set preferred_count = greatest(preferred_count - 1, 0) where id = old.rider_id;
  end if;
  return null;
end; $$;
drop trigger if exists tg_preferred_count on preferred_riders;
create trigger tg_preferred_count after insert or delete on preferred_riders
  for each row execute function public.sync_preferred_count();

-- Recompute rider.rating + completed_deliveries on rating/delivery change.
create or replace function public.recompute_rider_rating() returns trigger
language plpgsql as $$
declare rid uuid;
begin
  rid := coalesce(new.rider_id, old.rider_id);
  update riders set rating = coalesce((select round(avg(value)::numeric, 2) from rider_ratings where rider_id = rid), 0) where id = rid;
  return null;
end; $$;
drop trigger if exists tg_recompute_rating on rider_ratings;
create trigger tg_recompute_rating after insert or update or delete on rider_ratings
  for each row execute function public.recompute_rider_rating();

create or replace function public.bump_completed() returns trigger
language plpgsql as $$
begin
  if (new.status = 'Delivered' and old.status is distinct from 'Delivered' and new.rider_id is not null) then
    update riders set completed_deliveries = completed_deliveries + 1 where id = new.rider_id;
  end if;
  return null;
end; $$;
drop trigger if exists tg_bump_completed on delivery_requests;
create trigger tg_bump_completed after update of status on delivery_requests
  for each row execute function public.bump_completed();

-- ===================== RLS ==================================
alter table restaurants         enable row level security;
alter table riders              enable row level security;
alter table rider_availability  enable row level security;
alter table delivery_requests   enable row level security;
alter table preferred_riders    enable row level security;
alter table rider_verifications enable row level security;
alter table rider_ratings       enable row level security;
alter table delivery_activity   enable row level security;
alter table notifications       enable row level security;
alter table analytics_events    enable row level security;
alter table rider_zones         enable row level security;

-- Zones: read by anyone.
drop policy if exists "Zones readable" on rider_zones;
create policy "Zones readable" on rider_zones for select using (true);

-- Restaurants: public read for marketplace presence; self-write only.
drop policy if exists "Restaurants public read"  on restaurants;
drop policy if exists "Restaurants self write"   on restaurants;
drop policy if exists "Restaurants self update"  on restaurants;
create policy "Restaurants public read" on restaurants for select using (true);
create policy "Restaurants self write"  on restaurants for insert with check (auth.uid() = user_id or public.is_admin());
create policy "Restaurants self update" on restaurants for update using (auth.uid() = user_id or public.is_admin());

-- Riders: verified riders visible to everyone; pending visible only to owner + admin.
drop policy if exists "Riders public read"    on riders;
drop policy if exists "Riders self write"     on riders;
drop policy if exists "Riders self update"    on riders;
create policy "Riders public read" on riders
  for select using (verification_status = 'verified' or auth.uid() = user_id or public.is_admin());
create policy "Riders self write"  on riders for insert with check (auth.uid() = user_id or public.is_admin());
create policy "Riders self update" on riders for update using (auth.uid() = user_id or public.is_admin());

-- Availability history: owner + admin
drop policy if exists "Avail self read" on rider_availability;
create policy "Avail self read" on rider_availability for select using (
  public.is_admin() or exists (select 1 from riders r where r.id = rider_id and r.user_id = auth.uid())
);

-- Delivery requests:
--   Restaurants see their own; riders see open ones in their zones + ones assigned to them.
drop policy if exists "Requests read scoped"  on delivery_requests;
drop policy if exists "Requests insert"        on delivery_requests;
drop policy if exists "Requests update scoped" on delivery_requests;
create policy "Requests read scoped" on delivery_requests for select using (
  public.is_admin()
  or exists (select 1 from restaurants rs where rs.id = restaurant_id and rs.user_id = auth.uid())
  or (status = 'Available' and exists (
        select 1 from riders rd where rd.user_id = auth.uid() and zone = any(rd.delivery_zones)))
  or exists (select 1 from riders rd where rd.id = rider_id and rd.user_id = auth.uid())
);
create policy "Requests insert" on delivery_requests for insert with check (
  exists (select 1 from restaurants rs where rs.id = restaurant_id and rs.user_id = auth.uid())
);
create policy "Requests update scoped" on delivery_requests for update using (
  public.is_admin()
  or exists (select 1 from restaurants rs where rs.id = restaurant_id and rs.user_id = auth.uid())
  or exists (select 1 from riders rd where rd.user_id = auth.uid() and (rd.id = rider_id or (status = 'Available' and zone = any(rd.delivery_zones))))
);

-- Preferred riders: restaurant-scoped.
drop policy if exists "Preferred self read"   on preferred_riders;
drop policy if exists "Preferred self write"  on preferred_riders;
drop policy if exists "Preferred self delete" on preferred_riders;
create policy "Preferred self read" on preferred_riders for select using (
  exists (select 1 from restaurants rs where rs.id = restaurant_id and rs.user_id = auth.uid())
);
create policy "Preferred self write" on preferred_riders for insert with check (
  exists (select 1 from restaurants rs where rs.id = restaurant_id and rs.user_id = auth.uid())
);
create policy "Preferred self delete" on preferred_riders for delete using (
  exists (select 1 from restaurants rs where rs.id = restaurant_id and rs.user_id = auth.uid())
);

-- Verifications: rider can submit; admin reads all; rider reads own.
drop policy if exists "Verifications self submit" on rider_verifications;
drop policy if exists "Verifications self read"   on rider_verifications;
drop policy if exists "Verifications admin"       on rider_verifications;
create policy "Verifications self submit" on rider_verifications for insert with check (
  exists (select 1 from riders r where r.id = rider_id and r.user_id = auth.uid())
);
create policy "Verifications self read" on rider_verifications for select using (
  exists (select 1 from riders r where r.id = rider_id and r.user_id = auth.uid()) or public.is_admin()
);
create policy "Verifications admin" on rider_verifications for update using (public.is_admin());

-- Ratings: only restaurants who actually had a delivered request with the rider.
drop policy if exists "Ratings restaurant insert" on rider_ratings;
drop policy if exists "Ratings public read"      on rider_ratings;
create policy "Ratings public read" on rider_ratings for select using (true);
create policy "Ratings restaurant insert" on rider_ratings for insert with check (
  exists (select 1 from restaurants rs where rs.id = restaurant_id and rs.user_id = auth.uid())
);

-- Notifications: recipient sees and updates their own; system/admin/insert via service role or trigger.
drop policy if exists "Notifications recipient read"   on notifications;
drop policy if exists "Notifications recipient update" on notifications;
drop policy if exists "Notifications insert any auth"  on notifications;
create policy "Notifications recipient read" on notifications for select using (
  public.is_admin()
  or (recipient_type = 'restaurant' and exists (select 1 from restaurants rs where rs.id = recipient_id and rs.user_id = auth.uid()))
  or (recipient_type = 'rider'      and exists (select 1 from riders rd      where rd.id = recipient_id and rd.user_id = auth.uid()))
);
create policy "Notifications recipient update" on notifications for update using (
  public.is_admin()
  or (recipient_type = 'restaurant' and exists (select 1 from restaurants rs where rs.id = recipient_id and rs.user_id = auth.uid()))
  or (recipient_type = 'rider'      and exists (select 1 from riders rd      where rd.id = recipient_id and rd.user_id = auth.uid()))
);
create policy "Notifications insert any auth" on notifications for insert with check (auth.role() = 'authenticated');

drop policy if exists "Activity scoped read"   on delivery_activity;
drop policy if exists "Activity insert auth"   on delivery_activity;
create policy "Activity scoped read" on delivery_activity for select using (
  public.is_admin() or exists (
    select 1 from delivery_requests dr
    where dr.id = request_id and (
      exists (select 1 from restaurants rs where rs.id = dr.restaurant_id and rs.user_id = auth.uid())
      or exists (select 1 from riders rd where rd.id = dr.rider_id and rd.user_id = auth.uid())
    )
  )
);
create policy "Activity insert auth" on delivery_activity for insert with check (auth.role() = 'authenticated');

drop policy if exists "Analytics insert auth" on analytics_events;
create policy "Analytics insert auth" on analytics_events for insert with check (auth.role() = 'authenticated');

-- ===================== REALTIME =============================
do $$ begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table notifications;     exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table delivery_requests; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table riders;            exception when others then null; end $$;

-- ===================== SEED ZONES ===========================
insert into rider_zones (zone, city) values
  ('El Nido Town Proper','Palawan'),
  ('Corong-Corong','Palawan'),
  ('Las Cabanas','Palawan'),
  ('General Luna','Siargao'),
  ('Cebu IT Park','Cebu'),
  ('Lahug','Cebu'),
  ('Poblacion','Makati'),
  ('BGC','Taguig')
on conflict do nothing;

-- ===================== STORAGE BUCKETS ======================
-- Run once in Supabase Storage UI OR via the SQL:
--   insert into storage.buckets (id, name, public) values ('verifications','verifications',false) on conflict do nothing;
--   insert into storage.buckets (id, name, public) values ('avatars','avatars',true) on conflict do nothing;
-- Then add policies:
--   create policy "Auth upload verifications" on storage.objects for insert to authenticated
--     with check (bucket_id = 'verifications' and owner = auth.uid());
--   create policy "Owner read verifications" on storage.objects for select to authenticated
--     using (bucket_id = 'verifications' and (owner = auth.uid() or public.is_admin()));
--   create policy "Public read avatars" on storage.objects for select using (bucket_id = 'avatars');
--   create policy "Auth upload avatars" on storage.objects for insert to authenticated
--     with check (bucket_id = 'avatars' and owner = auth.uid());
