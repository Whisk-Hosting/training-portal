-- The portal's settings: one row.
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  portal_name text not null default 'Training',
  tagline text not null default 'Short courses to help you get the most out of what we sell.',
  accent text not null default '#e85d2a',
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict do nothing;

create table if not exists courses (
  id serial primary key,
  slug text not null unique,
  title text not null,
  summary text not null default '',
  published boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists modules (
  id serial primary key,
  course_id int not null references courses(id) on delete cascade,
  position int not null default 0,
  title text not null,
  summary text not null default ''
);
create index if not exists modules_course on modules(course_id, position);

-- kind: read (a written lesson), video, quiz. depth 1 tucks a lesson under the one above it.
create table if not exists lessons (
  id serial primary key,
  module_id int not null references modules(id) on delete cascade,
  position int not null default 0,
  slug text not null,
  title text not null,
  kind text not null default 'read' check (kind in ('read', 'video', 'quiz')),
  depth int not null default 0 check (depth in (0, 1)),
  optional boolean not null default false,
  minutes int not null default 5 check (minutes between 0 and 600),
  body text not null default '',
  video_upload_id text,
  pass_mark int not null default 80 check (pass_mark between 0 and 100),
  updated_at timestamptz not null default now()
);
create index if not exists lessons_module on lessons(module_id, position);

-- choices: [{"text": "...", "correct": true}]
create table if not exists questions (
  id serial primary key,
  lesson_id int not null references lessons(id) on delete cascade,
  position int not null default 0,
  prompt text not null,
  choices jsonb not null default '[]',
  explanation text not null default ''
);
create index if not exists questions_lesson on questions(lesson_id, position);

-- Everyone who has opened a lesson, keyed on the platform's user id.
create table if not exists learners (
  user_id text primary key,
  email text not null,
  name text not null default '',
  audience text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists progress (
  user_id text not null references learners(user_id) on delete cascade,
  lesson_id int not null references lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table if not exists attempts (
  id serial primary key,
  user_id text not null references learners(user_id) on delete cascade,
  lesson_id int not null references lessons(id) on delete cascade,
  score int not null,
  total int not null,
  passed boolean not null,
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists attempts_user_lesson on attempts(user_id, lesson_id, created_at desc);

-- A certificate keeps the name and course title as they were when it was issued.
create table if not exists certificates (
  code text primary key,
  user_id text not null references learners(user_id) on delete cascade,
  course_id int not null references courses(id) on delete cascade,
  learner_name text not null,
  course_title text not null,
  issued_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create table if not exists invites (
  id serial primary key,
  email text not null,
  name text not null default '',
  invite_url text not null,
  invited_by text not null,
  created_at timestamptz not null default now()
);
