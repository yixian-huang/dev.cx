-- +goose Up
create table users (
  id text primary key,
  email text not null unique,
  password_hash text,
  display_name text not null,
  handle text not null unique,
  bio text not null default '',
  avatar_url text not null default '',
  status text not null default 'building'
    check (status in ('building','exploring','paused','supporting')),
  weekly_status text not null default '',
  weekly_status_updated_at timestamptz,
  github_login text unique,
  github_verified boolean not null default false,
  handle_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user on sessions(user_id);

create table invite_codes (
  code text primary key,
  note text not null default '',
  max_uses int not null default 1,
  used_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table invite_redemptions (
  code text not null references invite_codes(code),
  user_id text not null references users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);

create table reserved_handles (
  handle text primary key,
  reason text not null default ''
);

create table handle_history (
  old_handle text primary key,
  user_id text not null references users(id) on delete cascade,
  changed_at timestamptz not null default now()
);

create table user_links (
  user_id text not null references users(id) on delete cascade,
  position int not null,
  kind text not null check (kind in ('website','github','x','email')),
  url text not null,
  primary key (user_id, position)
);

-- +goose Down
drop table user_links; drop table handle_history; drop table reserved_handles;
drop table invite_redemptions; drop table invite_codes; drop table sessions; drop table users;
