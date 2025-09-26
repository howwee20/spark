create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  expo_token text not null,
  platform text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.favorites (
  device_id text primary key,
  lot_id uuid references public.lots(id) on delete cascade,
  created_at timestamptz not null default now()
);
