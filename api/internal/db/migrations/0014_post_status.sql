-- +goose Up
alter table posts
  add column status text not null default 'published'
    check (status in ('draft', 'published'));

create index posts_author_drafts
  on posts (author_id, updated_at desc)
  where status = 'draft';

-- +goose Down
drop index if exists posts_author_drafts;
alter table posts drop column status;
