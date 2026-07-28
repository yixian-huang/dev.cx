-- +goose Up
-- 受众单选改多选:一个产品可以同时面向终端用户/开发者/团队(如图床:普通人存图、
-- 开发者调 API)。存量单值迁移为单元素数组,'' (未设置) 迁移为空数组。
alter table projects drop constraint projects_audience;
alter table projects alter column audience drop default;
alter table projects
  alter column audience type text[]
  using case when audience = '' then '{}'::text[] else array[audience] end;
alter table projects alter column audience set default '{}';
alter table projects
  add constraint projects_audience check (
    audience <@ array['end_users', 'developers', 'teams']::text[]
    and coalesce(array_length(audience, 1), 0) <= 3
  );

-- +goose Down
alter table projects drop constraint projects_audience;
alter table projects alter column audience drop default;
alter table projects
  alter column audience type text
  using coalesce(audience[1], '');
alter table projects alter column audience set default '';
alter table projects
  add constraint projects_audience check (audience in ('', 'end_users', 'developers', 'teams'));
