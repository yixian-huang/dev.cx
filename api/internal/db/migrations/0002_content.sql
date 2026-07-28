-- +goose Up
create table projects (
  id text primary key,
  slug text not null unique,
  owner_id text not null references users(id) on delete cascade,
  name text not null,
  tagline text not null default '',
  description_md text not null default '',
  stage text not null default 'idea' check (stage in ('idea','wip','shipped','paused')),
  demo_url text not null default '',
  repo_url text not null default '',
  docs_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner on projects(owner_id);

create table posts (
  id text primary key,
  slug text not null unique,
  author_id text not null references users(id) on delete cascade,
  project_id text references projects(id) on delete set null,
  type text not null check (type in ('show','build','ask','discuss')),
  title text not null,
  body_md text not null default '',
  feedback_wanted text[] not null default '{}',
  merged_into text references posts(id),
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_author on posts(author_id);
create index posts_project on posts(project_id);

create table replies (
  id text primary key,
  post_id text not null references posts(id) on delete cascade,
  author_id text not null references users(id) on delete cascade,
  body_md text not null,
  created_at timestamptz not null default now()
);
create index replies_post on replies(post_id);

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

-- +goose Down
drop table weekly_items; drop table weekly_issues; drop table notifications;
drop table project_follows; drop table user_follows; drop table replies;
drop table posts; drop table projects;
