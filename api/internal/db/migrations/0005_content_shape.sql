-- +goose Up
alter table projects
  add column screenshots text[] not null default '{}',
  add column tags text[] not null default '{}',
  add column links jsonb not null default '[]';

alter table posts
  add column uncertainties text[] not null default '{}',
  add column links jsonb not null default '[]',
  add column merged_at timestamptz,
  add column merged_by text references users(id);

alter table replies
  add column parent_id text references replies(id) on delete cascade,
  add column floor int not null default 0;

create index replies_parent on replies(parent_id);
create index posts_merged_into on posts(merged_into);

-- 新列的长度/数量兜底（新列存量为空，不会因存量行失败）
alter table projects
  add constraint projects_tags_count check (array_length(tags, 1) is null or array_length(tags, 1) <= 8),
  add constraint projects_shots_count check (array_length(screenshots, 1) is null or array_length(screenshots, 1) <= 8);

alter table posts
  add constraint posts_uncertainties_count check (array_length(uncertainties, 1) is null or array_length(uncertainties, 1) <= 6);

-- +goose Down
alter table posts drop constraint posts_uncertainties_count;
alter table projects drop constraint projects_shots_count, drop constraint projects_tags_count;
drop index posts_merged_into;
drop index replies_parent;
alter table replies drop column floor, drop column parent_id;
alter table posts drop column merged_by, drop column merged_at, drop column links, drop column uncertainties;
alter table projects drop column links, drop column tags, drop column screenshots;
