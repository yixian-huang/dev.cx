-- +goose Up
-- GitHub 的 login（用户名）可变、可被他人在原用户改名/注销后重新注册；只按 login 匹配
-- 会导致账号被接管。id 是 GitHub 侧不可变的数字标识，改为按 id 匹配，login 降级为展示字段。
alter table users add column github_id bigint unique;

-- 用户可控文本无长度上限：应用层已校验，这里补 check 约束兜底（length() 对 text 按字符计）。
alter table users add constraint users_display_name_length check (length(display_name) <= 64);
alter table users add constraint users_bio_length check (length(bio) <= 2000);
alter table users add constraint users_weekly_status_length check (length(weekly_status) <= 280);
alter table users add constraint users_avatar_url_length check (length(avatar_url) <= 512);
alter table user_links add constraint user_links_url_length check (length(url) <= 512);

-- +goose Down
alter table user_links drop constraint user_links_url_length;
alter table users drop constraint users_avatar_url_length;
alter table users drop constraint users_weekly_status_length;
alter table users drop constraint users_bio_length;
alter table users drop constraint users_display_name_length;
alter table users drop column github_id;
