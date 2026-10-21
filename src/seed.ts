// A first install gets one sample course, so the portal is never empty. Editors can change or
// delete it. Nothing is added once any course exists. The live demo also gets a few sample
// learners, so every staff screen has something on it: progress, a quiz tried twice, coursework
// waiting to be marked and a certificate. It runs the same seed every night (src/demo.ts).
import { randomBytes } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import type { Choice, Kind } from "./model.js";

type SeedLesson = { title: string; slug: string; kind?: Kind; minutes: number; depth?: number; optional?: boolean; body: string; quiz?: { prompt: string; choices: Choice[]; explanation: string }[] };
type SeedModule = { title: string; summary: string; lessons: SeedLesson[] };

const ok = (text: string): Choice => ({ text, correct: true });
const no = (text: string): Choice => ({ text, correct: false });

const course = {
  slug: "getting-started",
  title: "Getting started with your training portal",
  summary: "A short tour for the people who will write courses here. Take it as a learner, then change it or delete it.",
};

const modules: SeedModule[] = [
  {
    title: "Welcome",
    summary: "What this portal is for and how a lesson works, from a learner's side.",
    lessons: [
      {
        title: "Welcome",
        slug: "welcome",
        minutes: 2,
        body: `This portal holds short courses for your customers: how to order, how to install what you sell, how to get the most out of it.

Each course is a set of **modules**, and each module is a line of **lessons**. On the left you can see this module's lessons as a thread. The lesson you are on stands out from the line, and lessons you have finished fill it in.

> Everything here can be changed by your editors: this course included.

When you are ready, press **Done** at the bottom.`,
      },
      {
        title: "How lessons work",
        slug: "how-lessons-work",
        minutes: 3,
        body: `There are four kinds of lesson:

- **Lessons** you read, like this one.
- **Videos**, which play on any phone or browser.
- **Quizzes**, which check what you remember. You can try a quiz as many times as you like.
- **Assignments**, where you upload your work and a trainer marks it.

Some lessons are marked **optional**. You can skip them and still finish the course.`,
      },
      {
        title: "Marking a lesson done",
        slug: "marking-done",
        minutes: 1,
        depth: 1,
        body: `Press **Done** at the end of a lesson to mark it finished. Changed your mind? Open the lesson again and press **Mark as not done**.

Your progress is kept against your sign-in, so you can stop at any time and carry on later from any device.`,
      },
      {
        title: "Shortcuts",
        slug: "shortcuts",
        minutes: 1,
        depth: 1,
        optional: true,
        body: `This lesson is optional, so the course does not wait for it.

- **My learning** at the top shows every course you have started and your certificates.
- The course page always has a **Continue** button that takes you to the next lesson you have not done.`,
      },
      {
        title: "Check what you know",
        slug: "check-welcome",
        kind: "quiz",
        minutes: 2,
        body: "Three quick questions about how the portal works.",
        quiz: [
          {
            prompt: "What do you need to do to finish a course?",
            choices: [no("Every lesson, including the optional ones"), ok("Every lesson that is not optional, including passing its quizzes"), no("Only the quizzes")],
            explanation: "Optional lessons are there if you want them. Everything else, including each quiz, counts toward finishing.",
          },
          {
            prompt: "You failed a quiz. What happens?",
            choices: [no("You are locked out of the course"), no("You have to start the course again"), ok("You see which answers were wrong and can try again")],
            explanation: "There is no limit on tries. Read why each answer was right or wrong, then try again.",
          },
          {
            prompt: "Where is your progress kept?",
            choices: [ok("Against your sign-in, so it follows you to any device"), no("Only in this browser"), no("Nowhere: it resets each visit")],
            explanation: "",
          },
        ],
      },
    ],
  },
  {
    title: "Writing a course",
    summary: "For editors: make a course, write lessons, add videos and quizzes.",
    lessons: [
      {
        title: "Make a course",
        slug: "make-a-course",
        minutes: 3,
        body: `Open **Edit** at the top of the page. It is only there for your team's owners, admins and developers, and for anyone in the **trainers** group.

1. Under **New course**, give the course a name and a one-line summary.
2. Add modules: a module is a chapter, usually three to eight lessons on one topic.
3. Add lessons to each module, then open a lesson to write it.
4. When the course is ready, check **Live for learners** and save. Until then it is a draft that only editors can see.`,
      },
      {
        title: "Write a lesson",
        slug: "write-a-lesson",
        minutes: 4,
        body: `Lessons are written in Markdown, a plain way to format text. Press **Preview** in the editor to see the lesson as learners will.

Keep lessons short. One idea per lesson works better than one long page, and a learner who stops halfway can pick up exactly where they were.

Two settings change how a lesson sits on the thread:

- **Tuck under the lesson above** shows it as a smaller step branching off the line, like the two lessons under *How lessons work*.
- **Optional** means learners can skip it and still finish.`,
      },
      {
        title: "Markdown cheat sheet",
        slug: "markdown",
        minutes: 2,
        depth: 1,
        optional: true,
        body: `| You type | You get |
| --- | --- |
| \`## Heading\` | a heading |
| \`**bold**\` | **bold** |
| \`*italic*\` | *italic* |
| \`[our website](https://example.com)\` | a link |
| \`- item\` | a bullet list |
| \`1. step\` | a numbered list |
| \`> Tip: …\` | a highlighted tip |
| \`![a photo](https://…/photo.jpg)\` | a picture |`,
      },
      {
        title: "Add a video",
        slug: "add-a-video",
        minutes: 2,
        body: `Make a lesson of the kind **Video**, open it, and press **Upload a video**. Videos up to 5 GB work, straight from a phone or a screen recording.

The file goes straight to storage, and Whisk converts it so it plays smoothly on every phone and browser. It plays at once and gets sharper when the conversion is done. Only signed-in learners can watch it.

Write a short summary under the video too. People skim, and some will read rather than watch.`,
      },
      {
        title: "Write a quiz",
        slug: "write-a-quiz",
        minutes: 3,
        body: `Make a lesson of the kind **Quiz**. Each question has two to six answers with one marked correct, and an optional **why** that learners see after they answer.

The **pass mark** is a percentage, 80 unless you change it. A learner must pass every quiz that is not optional to finish the course.

Good quiz questions check something a customer will actually do, not a word from the lesson.`,
      },
      {
        title: "Try it: plan a lesson",
        slug: "plan-a-lesson",
        kind: "assignment",
        minutes: 15,
        optional: true,
        body: `An **assignment** asks the learner to hand in their work: a photo, a PDF, a document or a short video. A trainer opens it under **Edit > To mark** and marks it **Pass** or **Try again**, with a note. A pass finishes the lesson.

To try one, plan a lesson for your own customers: its title, the one thing it teaches, and how you would check they got it. Hand in the plan below.

This one is optional, so the course does not wait for it.`,
      },
    ],
  },
  {
    title: "Bringing customers in",
    summary: "Invite customers, follow their progress, and hand out certificates.",
    lessons: [
      {
        title: "Invite your customers",
        slug: "invite",
        minutes: 2,
        body: `Customers sign in with their email. Nobody can join unless you invite them, so the courses stay yours.

Open **Edit**, then **Learners**, and fill in **Invite a customer**. You get a sign-in link for that person: send it to them however you like. Your own team signs in as usual and can take every course too.`,
      },
      {
        title: "Follow their progress",
        slug: "progress",
        minutes: 2,
        body: `**Learners** lists everyone who has opened a lesson, how many lessons they have done, and when they were last here. Open a person to see each course they started and how far they got.

Quiz attempts are kept too, so you can see which questions trip people up and improve the lesson.`,
      },
      {
        title: "Certificates",
        slug: "certificates",
        minutes: 1,
        body: `When a learner finishes every required lesson, they get a certificate with their name, the course and the date. It prints on one page or saves as a PDF.

Each certificate has its own link that anyone can open to check it is genuine. That is handy when a customer needs to show their staff are trained.`,
      },
      {
        title: "Final check",
        slug: "final-check",
        kind: "quiz",
        minutes: 2,
        body: "Pass this one and the course is done.",
        quiz: [
          {
            prompt: "Who can open the editor?",
            choices: [no("Any signed-in customer"), ok("Your team's owners, admins and developers, and the trainers group"), no("Anyone with the link")],
            explanation: "Customers only ever take courses. Add a colleague to the trainers group to let them edit.",
          },
          {
            prompt: "How does a new customer get in?",
            choices: [ok("You add them under Learners, and they get an email with their link"), no("They sign up on the home page"), no("They need a Whisk account")],
            explanation: "Invitations keep the portal to the customers you choose. Paste a whole list at once if you have one.",
          },
          {
            prompt: "What does a course need before learners can see it?",
            choices: [no("At least one video"), no("A quiz in every module"), ok("Live for learners checked in its details")],
            explanation: "Courses start as drafts, visible only to editors, until you make them live.",
          },
        ],
      },
    ],
  },
];

// Sample learners are plainly made up, with example.com addresses, and are not enrolled in
// anything, so reminders never write to them.
type SampleLearner = {
  user_id: string;
  email: string;
  name: string;
  group?: string;
  seenDaysAgo: number;
  done: string[];
  quizzes?: { lesson: string; right: number[] }[];
};

const day = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * day);

const learners: SampleLearner[] = [
  {
    user_id: "sample-ana",
    email: "ana@example.com",
    name: "Ana Example",
    group: "Front counter",
    seenDaysAgo: 2,
    done: ["welcome", "how-lessons-work", "marking-done", "check-welcome", "make-a-course", "write-a-lesson", "add-a-video", "write-a-quiz", "plan-a-lesson", "invite", "progress", "certificates", "final-check"],
    quizzes: [
      { lesson: "check-welcome", right: [0, 1, 2] },
      { lesson: "final-check", right: [0, 1, 2] },
    ],
  },
  {
    user_id: "sample-ben",
    email: "ben@example.com",
    name: "Ben Sample",
    group: "Front counter",
    seenDaysAgo: 0.2,
    done: ["welcome", "how-lessons-work", "marking-done", "check-welcome", "make-a-course", "write-a-lesson"],
    quizzes: [
      { lesson: "check-welcome", right: [0, 2] },
      { lesson: "check-welcome", right: [0, 1, 2] },
    ],
  },
  { user_id: "sample-cleo", email: "cleo@example.com", name: "Cleo Placeholder", group: "Workshop", seenDaysAgo: 9, done: ["welcome", "how-lessons-work"] },
  {
    user_id: "sample-dan",
    email: "dan@example.com",
    name: "Dan Demo",
    group: "Workshop",
    seenDaysAgo: 1,
    done: ["welcome", "how-lessons-work", "marking-done", "shortcuts"],
    quizzes: [{ lesson: "check-welcome", right: [2] }],
  },
];

// sampleData writes the sample course inside the caller's transaction, and with withLearners
// (the live demo only) the sample learners, their progress, a certificate and coursework. A real
// install never gets made-up learners, so nothing it sends can reach them.
export const sampleData = async (tx: TransactionSql, withLearners = false) => {
  const [{ id: courseId }] = await tx<{ id: number }[]>`insert into courses (slug, title, summary, published, position)
    values (${course.slug}, ${course.title}, ${course.summary}, true, 0) returning id`;
  const lessonIds = new Map<string, number>();
  const questionIds = new Map<string, number[]>();
  for (const [mi, m] of modules.entries()) {
    const [{ id: moduleId }] = await tx<{ id: number }[]>`insert into modules (course_id, position, title, summary)
      values (${courseId}, ${mi}, ${m.title}, ${m.summary}) returning id`;
    for (const [li, l] of m.lessons.entries()) {
      const [{ id: lessonId }] = await tx<{ id: number }[]>`insert into lessons (module_id, position, slug, title, kind, depth, optional, minutes, body)
        values (${moduleId}, ${li}, ${l.slug}, ${l.title}, ${l.kind ?? "read"}, ${l.depth ?? 0}, ${l.optional ?? false}, ${l.minutes}, ${l.body}) returning id`;
      lessonIds.set(l.slug, lessonId);
      const ids: number[] = [];
      for (const [qi, q] of (l.quiz ?? []).entries())
        ids.push(
          (
            await tx<{ id: number }[]>`insert into questions (lesson_id, position, prompt, choices, explanation)
              values (${lessonId}, ${qi}, ${q.prompt}, ${tx.json(q.choices)}, ${q.explanation}) returning id`
          )[0].id,
        );
      questionIds.set(l.slug, ids);
    }
  }

  if (!withLearners) return;

  const quizOf = new Map(modules.flatMap((m) => m.lessons).map((l) => [l.slug, l.quiz ?? []]));
  const groups = new Map<string, number>();
  for (const name of [...new Set(learners.flatMap((l) => (l.group ? [l.group] : [])))])
    groups.set(name, (await tx<{ id: number }[]>`insert into groups (name) values (${name}) returning id`)[0].id);

  for (const l of learners) {
    const seen = daysAgo(l.seenDaysAgo);
    await tx`insert into learners (user_id, email, name, audience, status, group_id, first_seen, last_seen)
      values (${l.user_id}, ${l.email}, ${l.name}, 'customer', 'active', ${l.group ? groups.get(l.group)! : null}, ${daysAgo(l.seenDaysAgo + 14)}, ${seen})`;
    await tx`insert into audit (at, actor, action, subject, detail)
      values (${daysAgo(l.seenDaysAgo + 14)}, 'trainer@example.com', 'Invited', ${l.user_id}, ${tx.json({ email: l.email, courses: "" })})`;
    for (const [i, slug] of l.done.entries())
      await tx`insert into progress (user_id, lesson_id, completed_at) values (${l.user_id}, ${lessonIds.get(slug)!}, ${new Date(seen.getTime() - (l.done.length - i) * 3_600_000)})`;
    for (const [i, a] of (l.quizzes ?? []).entries()) {
      const quiz = quizOf.get(a.lesson)!;
      const ids = questionIds.get(a.lesson)!;
      // Each question answered right when listed in right, else with its first wrong answer.
      const answers = Object.fromEntries(quiz.map((q, qi) => [String(ids[qi]), a.right.includes(qi) ? q.choices.findIndex((c) => c.correct) : q.choices.findIndex((c) => !c.correct)]));
      const score = a.right.length;
      await tx`insert into attempts (user_id, lesson_id, score, total, passed, answers, created_at)
        values (${l.user_id}, ${lessonIds.get(a.lesson)!}, ${score}, ${quiz.length}, ${score * 100 >= 80 * quiz.length}, ${tx.json(answers)}, ${new Date(seen.getTime() - (3 - i) * 600_000)})`;
    }
  }

  // Ana finished the course; Ben handed in the optional plan and is waiting to hear back.
  await tx`insert into certificates (code, user_id, course_id, learner_name, course_title, issued_at)
    values (${randomBytes(9).toString("base64url")}, 'sample-ana', ${courseId}, 'Ana Example', ${course.title}, ${daysAgo(2)})`;
  await tx`insert into submissions (user_id, lesson_id, note, status, feedback, marked_by, marked_at, created_at)
    values ('sample-ana', ${lessonIds.get("plan-a-lesson")!}, 'My lesson: how to set up the register for a new day. One idea, three steps, and a short quiz at the end.',
      'passed', 'Clear and short. The quiz idea is a good check.', 'trainer@example.com', ${daysAgo(3)}, ${daysAgo(4)})`;
  await tx`insert into submissions (user_id, lesson_id, note, created_at)
    values ('sample-ben', ${lessonIds.get("plan-a-lesson")!}, 'Lesson plan: cleaning the coffee machine at closing time. Learners would watch a one minute video, then answer two questions about the order of the steps.', ${daysAgo(0.3)})`;
};

export const seed = async (sql: Sql): Promise<boolean> => {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from courses`;
  if (n > 0) return false;
  await sql.begin((tx) => sampleData(tx, process.env.DEMO === "1"));
  return true;
};
