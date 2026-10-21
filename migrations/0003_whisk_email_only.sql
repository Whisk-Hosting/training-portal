-- Email goes through Whisk email only, from the business's own domain when it has verified one.
update settings set mail_mode = 'whisk' where mail_mode = 'smtp';
alter table settings drop constraint if exists settings_mail_mode_check;
alter table settings add constraint settings_mail_mode_check check (mail_mode in ('whisk', 'off'));
alter table settings drop column if exists smtp_host, drop column if exists smtp_port, drop column if exists smtp_user, drop column if exists smtp_pass;
