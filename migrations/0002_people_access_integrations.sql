-- Who may take which course, groups of learners, coursework, email, API keys, webhooks and a
-- change log.

-- open: every active learner. enrolled: only people enrolled, on their own or through a group.
alter table courses add column if not exists access text not null default 'open' check (access in ('open', 'enrolled'));

create table if not exists groups (
  id serial primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

-- invited: added but not signed in yet. removed: no access, history kept.
alter table learners add column if not exists status text not null default 'active' check (status in ('invited', 'active', 'removed'));
alter table learners add column if not exists group_id int references groups(id) on delete set null;
alter table learners add column if not exists invite_url text not null default '';
alter table learners add column if not exists invited_at timestamptz;
alter table learners add column if not exists reminded_at timestamptz;

create table if not exists enrolments (
  user_id text not null references learners(user_id) on delete cascade,
  course_id int not null references courses(id) on delete cascade,
  due_on date,
  enrolled_by text not null default '',
  enrolled_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create table if not exists group_courses (
  group_id int not null references groups(id) on delete cascade,
  course_id int not null references courses(id) on delete cascade,
  due_on date,
  primary key (group_id, course_id)
);

-- Coursework: a lesson of kind 'assignment' takes uploads that a trainer marks.
alter table lessons drop constraint if exists lessons_kind_check;
alter table lessons add constraint lessons_kind_check check (kind in ('read', 'video', 'quiz', 'assignment'));

-- status: submitted (waiting to be marked), passed, redo (marked, needs another go).
create table if not exists submissions (
  id serial primary key,
  user_id text not null references learners(user_id) on delete cascade,
  lesson_id int not null references lessons(id) on delete cascade,
  note text not null default '',
  files jsonb not null default '[]',
  status text not null default 'submitted' check (status in ('submitted', 'passed', 'redo')),
  feedback text not null default '',
  marked_by text not null default '',
  marked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists submissions_queue on submissions(status, created_at);
create index if not exists submissions_user_lesson on submissions(user_id, lesson_id, created_at desc);

alter table settings add column if not exists email_from text not null default '';
alter table settings add column if not exists notify_email text not null default '';
alter table settings add column if not exists reminders boolean not null default true;

-- Only a hash of each key is kept; the key itself is shown once.
create table if not exists api_keys (
  id serial primary key,
  label text not null,
  prefix text not null,
  hash text not null unique,
  scope text not null check (scope in ('read', 'write')),
  created_by text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists webhooks (
  id serial primary key,
  url text not null,
  secret text not null,
  events text[] not null,
  active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists deliveries (
  id serial primary key,
  webhook_id int not null references webhooks(id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts int not null default 0,
  last_status int,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists deliveries_webhook on deliveries(webhook_id, created_at desc);

create table if not exists audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  subject text not null default '',
  detail jsonb not null default '{}'
);
create index if not exists audit_at on audit(at desc);

-- How the portal sends email: through Whisk, through the business's own mail server, or not at
-- all. The mail server password is kept here so a trainer can set it up without a developer.
alter table settings add column if not exists mail_mode text not null default 'whisk' check (mail_mode in ('whisk', 'smtp', 'off'));
alter table settings add column if not exists smtp_host text not null default '';
alter table settings add column if not exists smtp_port int not null default 587;
alter table settings add column if not exists smtp_user text not null default '';
alter table settings add column if not exists smtp_pass text not null default '';

-- Every email the portal sends, so staff can see what went and what failed.
create table if not exists emails (
  id serial primary key,
  kind text not null,
  to_email text not null,
  subject text not null,
  html text not null,
  text text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  error text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists emails_at on emails(created_at desc);

-- Upload addresses handed to a learner. A submission may only name files its learner uploaded.
create table if not exists upload_grants (
  upload_id text primary key,
  user_id text not null,
  filename text not null,
  content_type text not null,
  bytes bigint not null,
  created_at timestamptz not null default now()
);

-- The finish button is now one "Done" card that also moves on; the sample lesson names it.
update lessons set body = replace(body, '**Done, next lesson**', '**Done**') where body like '%**Done, next lesson**%';
