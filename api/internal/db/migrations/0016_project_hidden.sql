-- +goose Up
-- 产品软隐藏/下架:hidden_at 非空 = 对访客不可见;作者本人与管理仍可读可恢复。
alter table projects
  add column if not exists hidden_at timestamptz;

create index if not exists projects_public_list
  on projects (created_at desc, id desc)
  where hidden_at is null;

-- +goose Down
drop index if exists projects_public_list;
alter table projects drop column if exists hidden_at;
