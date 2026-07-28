-- +goose Up
alter table users add column email_verified_at timestamptz;
alter table users add column email_verify_token_hash text unique;
alter table users add column email_verify_sent_at timestamptz;
-- 存量用户(含运营者)自动视为已验证:验证要求自本迁移起对新注册生效。
update users set email_verified_at = now();

-- +goose Down
alter table users drop column email_verify_sent_at;
alter table users drop column email_verify_token_hash;
alter table users drop column email_verified_at;
