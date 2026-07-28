-- +goose Up
alter table users add column password_reset_token_hash text unique;
alter table users add column password_reset_sent_at timestamptz;
-- 周报邮件开关(spec 增补三,Task 27 消费):默认开,仅对已验证邮箱生效。
alter table users add column email_weekly boolean not null default true;

-- +goose Down
alter table users drop column email_weekly;
alter table users drop column password_reset_sent_at;
alter table users drop column password_reset_token_hash;
