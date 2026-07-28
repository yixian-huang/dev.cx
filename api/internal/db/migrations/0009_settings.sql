-- +goose Up
-- 运营可写配置(spec 增补):DB 优先 env 兜底;secret 值只写不回显由 API 层保证。
-- 变更追溯靠 updated_by/updated_at(最后一次),不进 mod_actions。
create table settings (
  key        text primary key,
  value      text not null,
  updated_by text not null references users(id),
  updated_at timestamptz not null default now()
);

-- +goose Down
drop table settings;
