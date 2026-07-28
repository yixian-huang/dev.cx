-- +goose Up
alter table users add column role text not null default 'user'
  check (role in ('user','admin'));
alter table users add column muted_until timestamptz;
alter table users add column suspended_at timestamptz;

alter table posts add column hidden_at timestamptz;
alter table posts add column hidden_reason text not null default '';
alter table replies add column hidden_at timestamptz;
alter table replies add column hidden_reason text not null default '';

-- 警告走站内通知需要自由文本;既有 kind 均不用 message,默认空串零影响。
alter table notifications add column message text not null default '';
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('reply','mention','follow','project_update','moderation'));

-- 所有处置动作各落一行;target 不设外键——帖子/回复被硬删后审计行必须留存。
create table mod_actions (
  id          text primary key,
  actor_id    text not null references users(id),
  action      text not null check (action in
    ('hide_post','unhide_post','delete_post','hide_reply','unhide_reply','delete_reply',
     'warn','mute','unmute','suspend','unsuspend')),
  target_kind text not null check (target_kind in ('post','reply','user')),
  target_id   text not null,
  reason      text not null default '',
  created_at  timestamptz not null default now()
);
create index mod_actions_created on mod_actions(created_at desc);

-- +goose Down
drop table mod_actions;
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('reply','mention','follow','project_update'));
alter table notifications drop column message;
alter table replies drop column hidden_reason;
alter table replies drop column hidden_at;
alter table posts drop column hidden_reason;
alter table posts drop column hidden_at;
alter table users drop column suspended_at;
alter table users drop column muted_until;
alter table users drop column role;
