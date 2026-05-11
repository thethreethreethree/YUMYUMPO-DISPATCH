-- ============================================================
-- YUMYUMPO DISPATCH — Supabase schema
-- Run this in the Supabase SQL editor on a new project.
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ============== ENUMS =======================================
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

-- ============== TABLES ======================================

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_phone text,
  whatsapp text,
  city text,
  default_zone text,
  created_at timestamptz default now()
);

create table if not exists riders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  profile_photo text,
  government_id text,
  selfie_photo text,
  phone text not null,
  whatsapp text not null,
  vehicle_type vehicle_type not null,
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
create index if not exists riders_zones_idx on riders using gin (delivery_zones);

create table if not exists rider_zones (
  zone text primary key,
  city text,
  active boolean default true
);

create table if not exists rider_availability (
  rider_id uuid references riders(id) on delete cascade,
  status availability_status not null,
  changed_at timestamptz default now(),
  primary key (rider_id, changed_at)
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
  created_at timestamptz default now(),
  accepted_at timestamptz,
  delivered_at timestamptz
);
create index if not exists requests_status_idx on delivery_requests (status);
create index if not exists requests_zone_idx on delivery_requests (zone);

create table if not exists preferred_riders (
  restaurant_id uuid references restaurants(id) on delete cascade,
  rider_id uuid references riders(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (restaurant_id, rider_id)
);

create table if not exists rider_verifications (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references riders(id) on delete cascade,
  name text,
  phone text,
  whatsapp text,
  vehicle text,
  delivery_zones text[],
  base_fee numeric,
  per_km_fee numeric,
  id_url text,
  selfie_url text,
  video_url text,
  status verification_status default 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists rider_ratings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  rider_id uuid references riders(id) on delete cascade,
  metric text not null,   -- punctuality, professionalism, communication, reliability, food_handling
  value int check (value between 1 and 5),
  created_at timestamptz default now()
);

create table if not exists delivery_activity (
  id bigserial primary key,
  request_id uuid references delivery_requests(id) on delete cascade,
  event text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists analytics_events (
  id bigserial primary key,
  actor_type text,   -- 'restaurant' | 'rider' | 'system'
  actor_id uuid,
  event text not null,
  payload jsonb,
  created_at timestamptz default now()
);

-- ============== RLS =========================================
alter table restaurants          enable row level security;
alter table riders               enable row level security;
alter table delivery_requests    enable row level security;
alter table preferred_riders     enable row level security;
alter table rider_verifications  enable row level security;
alter table rider_ratings        enable row level security;

-- Public read of marketplace data
create policy if not exists "Public read riders" on riders
  for select using (verification_status = 'verified');
create policy if not exists "Public read zones" on rider_zones for select using (true);

-- Authenticated users may write (tighten per your auth model)
create policy if not exists "Auth insert requests" on delivery_requests
  for insert with check (auth.role() = 'authenticated');
create policy if not exists "Auth read requests" on delivery_requests
  for select using (auth.role() = 'authenticated');

create policy if not exists "Auth manage preferred" on preferred_riders
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy if not exists "Auth rate" on rider_ratings
  for insert with check (auth.role() = 'authenticated');

create policy if not exists "Self verify" on rider_verifications
  for insert with check (true);

-- ============== SEED ZONES ===================================
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
