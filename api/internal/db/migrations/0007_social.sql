-- B1(0002)预置过一版从未接线的社交表(user_follows/project_follows/notifications/
-- weekly_issues/weekly_items,全程零写入)。B2 的模型不同(统一 follows、通知带 reply_id、
-- 周刊 highlights 快照),这里先删旧占位再建新表——占位表无数据,无迁移成本。
-- +goose Up
drop table weekly_items;
drop table weekly_issues;
drop table notifications;
drop table project_follows;
drop table user_follows;

create table follows (
  follower_id text not null references users(id) on delete cascade,
  target_kind text not null check (target_kind in ('user','project')),
  target_id   text not null,
  created_at  timestamptz not null default now(),
  primary key (follower_id, target_kind, target_id)
);
create index follows_target on follows(target_kind, target_id);

create table notifications (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  kind       text not null check (kind in ('reply','mention','follow','project_update')),
  actor_id   text not null references users(id) on delete cascade,
  post_id    text references posts(id) on delete cascade,
  reply_id   text references replies(id) on delete cascade,
  project_id text references projects(id) on delete cascade,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on notifications(user_id, created_at desc);
create index notifications_unread on notifications(user_id) where read_at is null;

create table weekly_issues (
  year         int not null,
  week         int not null,
  title        text not null,
  editor_note_md text not null default '',
  highlights   jsonb not null default '[]',
  published_at timestamptz,
  primary key (year, week)
);

-- +goose Down
drop table weekly_issues; drop table notifications; drop table follows;

-- 还原 0002 的占位表(原样拷贝)
create table user_follows (
  follower_id text not null references users(id) on delete cascade,
  followee_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);

create table project_follows (
  follower_id text not null references users(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, project_id)
);

create table notifications (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  kind text not null check (kind in ('reply','follow','project_follow','mention','system')),
  actor_id text references users(id) on delete set null,
  post_id text references posts(id) on delete cascade,
  project_id text references projects(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on notifications(user_id, created_at desc);

create table weekly_issues (
  id text primary key,
  week int not null unique,
  title text not null default '',
  deck text not null default '',
  published_at timestamptz
);

create table weekly_items (
  issue_id text not null references weekly_issues(id) on delete cascade,
  position int not null,
  tier text not null check (tier in ('lead','quiet')),
  project_id text references projects(id) on delete cascade,
  post_id text references posts(id) on delete cascade,
  primary key (issue_id, position)
);
