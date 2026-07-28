-- +goose Up
insert into reserved_handles (handle, reason) values
  ('about','route'),('feed','route'),('explore','route'),('login','route'),
  ('me','route'),('new','route'),('compose','route'),('onboarding','route'),
  ('notifications','route'),('guidelines','route'),('weekly','route'),
  ('design-system','route'),('p','route'),('t','route'),
  ('api','system'),('www','system'),('static','system'),('assets','system'),
  ('admin','system'),('root','system'),('support','system'),('help','system'),
  ('mail','system'),('status','system'),('blog','system'),('docs','system'),
  ('dev','brand'),('devcx','brand'),('dev-cx','brand'),('official','brand'),
  ('team','brand'),('mod','brand'),('moderator','brand')
on conflict do nothing;

-- +goose Down
delete from reserved_handles;
