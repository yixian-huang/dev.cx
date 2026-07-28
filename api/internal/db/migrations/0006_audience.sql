-- +goose Up
alter table projects
  add column audience text not null default '',
  add constraint projects_audience check (audience in ('', 'end_users', 'developers', 'teams'));

-- +goose Down
alter table projects drop constraint projects_audience, drop column audience;
