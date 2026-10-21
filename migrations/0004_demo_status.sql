-- Demo mode records emails and webhook deliveries without sending them, under status demo.
alter table emails drop constraint if exists emails_status_check;
alter table emails add constraint emails_status_check check (status in ('pending', 'sent', 'failed', 'skipped', 'demo'));
alter table deliveries drop constraint if exists deliveries_status_check;
alter table deliveries add constraint deliveries_status_check check (status in ('pending', 'delivered', 'failed', 'demo'));
