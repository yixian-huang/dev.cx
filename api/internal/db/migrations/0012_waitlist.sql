-- +goose Up
create table waitlist (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- +goose Down
drop table waitlist;
