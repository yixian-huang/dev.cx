-- +goose Up
-- 已发布时刻：编辑窗以 published_at 为准（草稿可先写很久再发布）。
alter table posts
  add column published_at timestamptz;

update posts
  set published_at = created_at
  where status = 'published' and published_at is null;

create index posts_published_at on posts (published_at desc)
  where status = 'published';

-- +goose Down
drop index if exists posts_published_at;
alter table posts drop column published_at;
