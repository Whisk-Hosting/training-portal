// The whole stylesheet. Served once at /assets/app.css and cached by browsers and the edge.
export const css = String.raw`
@font-face { font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url(/assets/fonts/figtree-latin-wght-normal.woff2) format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url(/assets/fonts/figtree-latin-ext-wght-normal.woff2) format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: "Figtree"; font-style: italic; font-weight: 300 900; font-display: swap; src: url(/assets/fonts/figtree-latin-wght-italic.woff2) format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-style: normal; font-weight: 400; font-display: swap; src: url(/assets/fonts/jetbrains-mono-latin-400-normal.woff2) format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-style: normal; font-weight: 600; font-display: swap; src: url(/assets/fonts/jetbrains-mono-latin-600-normal.woff2) format("woff2"); }
:root {
  --bg: #f7f5f0; --surface: #ffffff; --surface-2: #f0ede6; --ink: #1f1d1a; --muted: #6b665d;
  --line: #e3dfd6; --line-strong: #cfc9bd; --good: #2f8a57; --bad: #c23b3b;
  --accent: #e85d2a; --on-accent: #ffffff;
  --accent-soft: color-mix(in oklab, var(--accent) 14%, transparent);
  --accent-ink: color-mix(in oklab, var(--accent) 78%, var(--ink));
  --shadow: 0 1px 2px rgb(30 25 15 / .06), 0 8px 24px -8px rgb(30 25 15 / .16);
  --radius: 16px; --font: "Figtree", system-ui, sans-serif; --mono: "JetBrains Mono", ui-monospace, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121110; --surface: #1b1a18; --surface-2: #25231f; --ink: #f1ede6; --muted: #a39d92;
    --line: #322f2a; --line-strong: #4a463f; --good: #5cc48a; --bad: #ef6b6b;
    --accent-ink: color-mix(in oklab, var(--accent) 70%, white);
    --shadow: 0 1px 2px rgb(0 0 0 / .4), 0 10px 30px -10px rgb(0 0 0 / .7);
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 17px/1.6 var(--font); -webkit-font-smoothing: antialiased; }
a { color: inherit; }
img { max-width: 100%; }
h1, h2, h3 { line-height: 1.2; letter-spacing: -0.015em; margin: 0 0 .4em; }
h1 { font-size: clamp(2rem, 4.5vw, 3rem); font-weight: 750; }
h2 { font-size: 1.5rem; font-weight: 700; }
h3 { font-size: 1.15rem; font-weight: 650; }
p { margin: 0 0 1em; }
.icon { flex: none; vertical-align: -0.2em; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.muted { color: var(--muted); }
.small { font-size: .875rem; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 6px; }

/* Header */
.site-header { border-bottom: 1px solid var(--line); background: color-mix(in oklab, var(--bg) 88%, transparent); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 10; }
.site-header .wrap { display: flex; align-items: center; gap: 24px; height: 64px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 750; font-size: 1.1rem; text-decoration: none; letter-spacing: -0.01em; }
.brand-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
.nav { display: flex; gap: 4px; margin-left: auto; align-items: center; }
.nav a { text-decoration: none; padding: 8px 12px; border-radius: 10px; color: var(--muted); font-weight: 550; font-size: .95rem; display: inline-flex; gap: 6px; align-items: center; }
.nav a:hover, .nav a[aria-current] { color: var(--ink); background: var(--surface-2); }
@media (max-width: 640px) { .nav a span.label { display: none; } .site-header .wrap { gap: 12px; } }

/* Buttons and badges */
.btn { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); font: 600 .95rem/1 var(--font); padding: 12px 18px; border-radius: 12px; text-decoration: none; cursor: pointer; transition: transform .12s, box-shadow .12s, background .12s; }
.btn:hover { transform: translateY(-1px); box-shadow: var(--shadow); }
.btn:active { transform: none; }
.btn.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); }
.btn.ghost { background: transparent; border-color: transparent; }
.btn.ghost:hover { background: var(--surface-2); box-shadow: none; }
.btn.small { padding: 8px 12px; font-size: .85rem; border-radius: 10px; }
.btn.danger { color: var(--bad); }
.btn[disabled] { opacity: .5; pointer-events: none; }
.badge { display: inline-flex; align-items: center; gap: 4px; font: 650 .72rem/1 var(--font); text-transform: uppercase; letter-spacing: .06em; padding: 5px 8px; border-radius: 999px; background: var(--surface-2); color: var(--muted); white-space: nowrap; }
.badge.accent { background: var(--accent); color: var(--on-accent); }
.badge.good { background: color-mix(in oklab, var(--good) 16%, transparent); color: var(--good); }
.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.spread { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }

/* Progress */
.bar { height: 8px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
.bar > i { display: block; height: 100%; background: var(--accent); border-radius: 99px; transition: width .6s cubic-bezier(.2,.8,.2,1); }
.ring { --p: 0; width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--accent) calc(var(--p) * 1%), var(--surface-2) 0); flex: none; }
.ring::before { content: ""; grid-area: 1/1; width: 50px; height: 50px; border-radius: 50%; background: var(--surface); }
.ring b { grid-area: 1/1; font-size: .85rem; position: relative; }

/* Home */
.hero { padding: 72px 0 40px; }
.hero p.lead { font-size: 1.2rem; color: var(--muted); max-width: 40rem; }
.course-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; padding-bottom: 80px; }
.course-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 28px; display: flex; flex-direction: column; gap: 14px; text-decoration: none; transition: transform .15s, box-shadow .15s, border-color .15s; position: relative; overflow: hidden; }
.course-card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 4px; background: var(--accent); opacity: .85; }
.course-card:hover { transform: translateY(-3px); box-shadow: var(--shadow); border-color: var(--line-strong); }
.course-card h2 { font-size: 1.35rem; margin: 0; }
.course-card p { color: var(--muted); margin: 0; flex: 1; }
.meta { display: flex; gap: 14px; flex-wrap: wrap; color: var(--muted); font-size: .875rem; align-items: center; }
.meta span { display: inline-flex; gap: 6px; align-items: center; }

/* Course page */
.course-hero { padding: 56px 0 36px; display: grid; grid-template-columns: 1fr auto; gap: 32px; align-items: end; }
.course-hero p.lead { font-size: 1.15rem; color: var(--muted); max-width: 42rem; }
.course-hero .cta { display: flex; flex-direction: column; gap: 12px; align-items: flex-end; }
@media (max-width: 760px) { .course-hero { grid-template-columns: 1fr; } .course-hero .cta { align-items: flex-start; } }
.modules { display: flex; flex-direction: column; gap: 24px; padding-bottom: 80px; }
.module-card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); }
.module-card .info { padding: 36px; display: flex; flex-direction: column; gap: 10px; }
.module-card .info .kicker { color: var(--accent-ink); font-weight: 650; font-size: .9rem; }
.module-card .info p { color: var(--muted); margin: 0; }
.module-card .lessons { padding: 28px 36px; border-left: 1px solid var(--line); }
@media (max-width: 760px) { .module-card { grid-template-columns: 1fr; } .module-card .lessons { border-left: 0; border-top: 1px solid var(--line); padding: 20px 24px; } .module-card .info { padding: 28px 24px 20px; } }

/* The thread: a lesson timeline. The open lesson pops out of the line. */
.thread { list-style: none; margin: 0; padding: 0; position: relative; }
.thread li { position: relative; padding: 3px 0 3px 34px; }
.thread li::before { content: ""; position: absolute; left: 10px; top: 0; bottom: 0; width: 2px; background: var(--line); }
.thread li:first-child::before { top: 50%; }
.thread li:last-child::before { bottom: 50%; }
.thread li:only-child::before { display: none; }
/* A line segment fills in once the lesson above it is done. Each item draws the half above its
   dot (joining the previous lesson) and the half below (joining the next). */
.thread li.done::before { background: linear-gradient(var(--line) 50%, var(--accent) 50%); }
.thread li.done + li::before { background: linear-gradient(var(--accent) 50%, var(--line) 50%); }
.thread li.done + li.done::before { background: var(--accent); }
.thread li.done:first-child::before { background: var(--accent); }
.thread li.done:last-child::before { background: var(--line); }
.thread li.done + li:last-child::before { background: var(--accent); }
.thread .dot { position: absolute; left: 4px; top: 50%; width: 14px; height: 14px; margin-top: -7px; border-radius: 50%; background: var(--surface); border: 2px solid var(--line-strong); display: grid; place-items: center; color: var(--on-accent); z-index: 1; transition: all .25s cubic-bezier(.2,.8,.2,1); }
.thread .dot .icon { width: 10px; height: 10px; stroke-width: 3.5; }
.thread li.done .dot { background: var(--accent); border-color: var(--accent); }
.thread li.optional .dot { border-style: dashed; }
.thread li.sub.optional .dot { border-style: solid; border-color: var(--line); }
.thread li.sub { padding-left: 58px; }
.thread li.sub .dot { left: 32px; width: 10px; height: 10px; margin-top: -5px; }
.thread li.sub::after { content: ""; position: absolute; left: 11px; width: 22px; top: 50%; height: 2px; background: var(--line); }
.thread li.sub.done::after { background: var(--accent); }
.thread li.sub.done .dot .icon { display: none; }
.thread .item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; margin-left: -10px; border-radius: 10px; text-decoration: none; color: var(--ink); font-weight: 550; transition: background .15s, transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s; border: 1px solid transparent; }
.thread a.item:hover { background: var(--surface-2); }
.thread .item .kind { color: var(--muted); display: inline-flex; }
.thread .item .kind .icon { width: 15px; height: 15px; }
.thread li.optional .item { font-style: italic; color: var(--muted); font-weight: 500; }
.thread li.sub .item { font-weight: 500; font-size: .95rem; }
.thread .item .grow { flex: 1; min-width: 0; }
.thread li.current .dot { width: 22px; height: 22px; margin-top: -11px; left: 0; background: var(--accent); border-color: var(--accent); box-shadow: 0 0 0 6px var(--accent-soft); animation: pulse 2.4s ease-in-out infinite; }
.thread li.sub.current .dot { left: 26px; }
.thread li.current .item { background: var(--surface); border-color: var(--line); border-left: 3px solid var(--accent); box-shadow: var(--shadow); transform: translateX(10px); margin-right: -4px; font-weight: 700; padding: 11px 14px; }
@keyframes pulse { 50% { box-shadow: 0 0 0 10px transparent; } }
@media (prefers-reduced-motion: reduce) { .thread li.current .dot { animation: none; } * { transition: none !important; } }

/* Lesson page */
.lesson-layout { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 56px; padding-top: 32px; padding-bottom: 80px; }
.sidebar { position: sticky; top: 88px; align-self: start; max-height: calc(100vh - 110px); overflow: auto; padding: 4px 18px 24px 4px; }
.sidebar .course-link { display: block; font-weight: 700; text-decoration: none; margin-bottom: 10px; }
.sidebar .bar { margin: 8px 0 22px; }
.side-module { margin-bottom: 6px; }
.side-module > a, .side-module > .head { display: flex; justify-content: space-between; gap: 8px; text-decoration: none; padding: 9px 10px; border-radius: 10px; font-weight: 600; font-size: .92rem; color: var(--muted); }
.side-module > a:hover { background: var(--surface-2); color: var(--ink); }
.side-module.open > .head { color: var(--ink); }
.side-module.open .thread { margin: 6px 0 18px 10px; }
.side-module .count { font-variant-numeric: tabular-nums; font-weight: 500; font-size: .85rem; }
.mobile-outline { display: none; }
@media (max-width: 900px) {
  .lesson-layout { grid-template-columns: 1fr; gap: 0; padding-top: 16px; }
  .sidebar { display: none; }
  .mobile-outline { display: block; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; margin-bottom: 28px; }
  .mobile-outline summary { padding: 14px 18px; cursor: pointer; font-weight: 600; list-style: none; display: flex; justify-content: space-between; gap: 12px; }
  .mobile-outline summary::-webkit-details-marker { display: none; }
  .mobile-outline .thread { padding: 4px 22px 18px 18px; }
}
.crumbs { color: var(--muted); font-size: .9rem; font-weight: 550; margin-bottom: 8px; display: flex; gap: 8px; flex-wrap: wrap; }
.crumbs a { text-decoration: none; }
.crumbs a:hover { color: var(--ink); }
.lesson-main h1 { font-size: clamp(1.9rem, 4vw, 2.6rem); }
.lesson-main > header { margin-bottom: 28px; }
.prose { max-width: 70ch; }
.prose h2 { margin-top: 1.8em; }
.prose h3 { margin-top: 1.5em; }
.prose a { color: var(--accent-ink); text-decoration-thickness: 2px; text-underline-offset: 3px; }
.prose ul, .prose ol { padding-left: 1.4em; margin: 0 0 1em; }
.prose li { margin: .3em 0; }
.prose blockquote { margin: 1.5em 0; padding: 16px 20px; border-radius: 12px; background: var(--accent-soft); border-left: 4px solid var(--accent); }
.prose blockquote p:last-child { margin: 0; }
.prose code { font: .88em var(--mono); background: var(--surface-2); padding: 2px 6px; border-radius: 6px; }
.prose pre { background: #1d1b18; color: #f1ede6; padding: 18px 20px; border-radius: 12px; overflow: auto; font-size: .88rem; }
.prose pre code { background: none; padding: 0; color: inherit; }
.prose img { border-radius: 12px; border: 1px solid var(--line); }
.prose table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: .95rem; }
.prose th, .prose td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); }
.prose hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
.video { margin: 0 0 28px; border-radius: 16px; overflow: hidden; background: #000; box-shadow: var(--shadow); aspect-ratio: 16 / 9; }
.video whisk-video { display: block; width: 100%; height: 100%; }
.video-missing { aspect-ratio: 16 / 9; border: 2px dashed var(--line-strong); border-radius: 16px; display: grid; place-items: center; color: var(--muted); margin-bottom: 28px; text-align: center; padding: 20px; }
.lesson-foot { margin-top: 48px; padding-top: 28px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 20px; max-width: 70ch; }
.pager { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pager a { display: flex; flex-direction: column; gap: 2px; padding: 14px 18px; border: 1px solid var(--line); border-radius: 14px; text-decoration: none; background: var(--surface); }
.pager a:hover { border-color: var(--line-strong); box-shadow: var(--shadow); }
.pager a.next, .pager form.next { text-align: right; grid-column: 2; margin: 0; }
.pager .done-next { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; padding: 14px 18px; border: 0; border-radius: 14px; background: var(--accent); color: var(--on-accent); font: inherit; text-align: right; cursor: pointer; transition: transform .12s, box-shadow .12s; }
.pager .done-next:hover { transform: translateY(-1px); box-shadow: var(--shadow); }
.pager .done-next small { color: inherit; opacity: .9; display: inline-flex; gap: 4px; align-items: center; }
@media (max-width: 560px) { .pager { grid-template-columns: 1fr; } .pager a.next, .pager form.next { grid-column: 1; } .pager form.next { order: -1; } }
.pager small { color: var(--muted); font-weight: 550; }
.pager b { font-weight: 650; }
.done-note { display: flex; align-items: center; gap: 10px; color: var(--good); font-weight: 650; }

/* Quiz */
.quiz { display: flex; flex-direction: column; gap: 22px; max-width: 70ch; }
.question { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 24px; }
.question legend { font-weight: 650; font-size: 1.05rem; padding: 0; margin-bottom: 14px; }
.question fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.question .num { color: var(--accent-ink); font-size: .85rem; font-weight: 700; display: block; margin-bottom: 4px; }
.choice { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; margin-top: 8px; cursor: pointer; transition: border-color .15s, background .15s; }
.choice:hover { border-color: var(--line-strong); }
.choice input { accent-color: var(--accent); margin-top: 5px; flex: none; }
.choice:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
.choice.right { border-color: var(--good); background: color-mix(in oklab, var(--good) 10%, transparent); }
.choice.wrong { border-color: var(--bad); background: color-mix(in oklab, var(--bad) 10%, transparent); }
.choice .tag { margin-left: auto; font-size: .8rem; font-weight: 650; white-space: nowrap; }
.choice.right .tag { color: var(--good); }
.choice.wrong .tag { color: var(--bad); }
.explain { margin-top: 14px; color: var(--muted); font-size: .95rem; }
.score { display: flex; gap: 20px; align-items: center; padding: 22px 24px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
.score.pass { border-color: var(--good); }
.score.fail { border-color: var(--bad); }
.score h2 { margin: 0; font-size: 1.25rem; }

/* Notices, empty states, tables, forms */
.notice { padding: 14px 18px; border-radius: 12px; background: var(--surface-2); margin: 0 0 20px; }
.notice.error { background: color-mix(in oklab, var(--bad) 12%, transparent); color: var(--ink); }
.notice.good { background: color-mix(in oklab, var(--good) 12%, transparent); }
fieldset.plain { border: 0; padding: 0; margin: 0; min-width: 0; }
.demo-strip { background: var(--surface-2); border-bottom: 1px solid var(--line); font-size: .875rem; color: var(--muted); }
.demo-strip .wrap { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding-top: 8px; padding-bottom: 8px; }
.demo-strip a { color: var(--ink); font-weight: 600; white-space: nowrap; }
.empty { text-align: center; padding: 64px 24px; border: 2px dashed var(--line); border-radius: 20px; color: var(--muted); }
.empty h2 { color: var(--ink); }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 24px; }
.table { width: 100%; border-collapse: collapse; font-size: .95rem; }
.table th { text-align: left; font-weight: 600; color: var(--muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.table td { padding: 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.table tr:last-child td { border-bottom: 0; }
.table-wrap { overflow-x: auto; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
.field label, .label { font-weight: 600; font-size: .9rem; }
.field .hint { color: var(--muted); font-size: .82rem; }
input[type=text], input[type=email], input[type=number], input[type=date], input[type=search], input[type=url], input[type=password], textarea, select { font: inherit; font-size: .95rem; color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px; padding: 10px 12px; width: 100%; }
input[type=color] { width: 52px; height: 40px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); padding: 3px; }
textarea { min-height: 120px; resize: vertical; line-height: 1.55; }
textarea.code { font-family: var(--mono); font-size: .88rem; min-height: 360px; }
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.check { display: flex; gap: 10px; align-items: center; font-weight: 550; }
.check input { accent-color: var(--accent); width: 18px; height: 18px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 18px; }
@media (max-width: 640px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }

/* Editor */
.page-head { padding: 40px 0 24px; }
.editor { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 32px; padding-bottom: 80px; align-items: start; }
@media (max-width: 900px) { .editor { grid-template-columns: 1fr; } }
.ed-module { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); margin-bottom: 18px; }
.ed-module > header { padding: 18px 20px; border-bottom: 1px solid var(--line); display: flex; gap: 12px; align-items: center; }
.ed-module > header h3 { margin: 0; flex: 1; }
.ed-lesson { display: flex; gap: 10px; align-items: center; padding: 10px 20px; border-bottom: 1px solid var(--line); }
.ed-lesson:last-of-type { border-bottom: 0; }
.ed-lesson.sub { padding-left: 48px; }
.ed-lesson a.title { flex: 1; text-decoration: none; font-weight: 550; display: flex; gap: 8px; align-items: center; min-width: 0; }
.ed-lesson a.title:hover { color: var(--accent-ink); }
.ed-add { padding: 14px 20px; border-top: 1px solid var(--line); background: var(--surface-2); border-radius: 0 0 var(--radius) var(--radius); }
.ed-add form { display: flex; gap: 8px; flex-wrap: wrap; }
.ed-add input[type=text] { flex: 1; min-width: 180px; }
.ed-add select { width: auto; }
.icon-btn { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; border: 1px solid transparent; background: transparent; color: var(--muted); cursor: pointer; padding: 0; }
.icon-btn:hover { background: var(--surface-2); color: var(--ink); border-color: var(--line); }
.icon-btn .icon { width: 17px; height: 17px; }
.inline { display: inline; margin: 0; }
.ed-question { border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 14px; background: var(--surface); }
.ed-choice { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
.ed-choice input[type=radio] { accent-color: var(--good); width: 18px; height: 18px; flex: none; }
.preview { border: 1px solid var(--line); border-radius: 12px; padding: 20px 24px; background: var(--bg); min-height: 120px; }
.tabs { display: flex; gap: 4px; margin-bottom: 8px; }
.tabs button { font: 600 .85rem var(--font); padding: 6px 12px; border-radius: 8px; border: 0; background: transparent; color: var(--muted); cursor: pointer; }
.tabs button[aria-selected=true] { background: var(--surface-2); color: var(--ink); }
.upload-box { border: 2px dashed var(--line-strong); border-radius: 14px; padding: 20px; text-align: center; }
.upload-box .bar { margin-top: 12px; }
.copyfield { display: flex; gap: 8px; }
.copyfield input { font-family: var(--mono); font-size: .8rem; }

/* Certificate */
.cert-page { padding-top: 48px; padding-bottom: 80px; display: flex; flex-direction: column; align-items: center; gap: 24px; }
.certificate { width: min(100%, 900px); aspect-ratio: 1.414; background: #fffdf8; color: #1f1d1a; border-radius: 8px; box-shadow: var(--shadow); padding: clamp(28px, 6vw, 72px); display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; border: 1px solid #e3dfd6; }
.certificate::before { content: ""; position: absolute; inset: 14px; border: 2px solid var(--accent); border-radius: 4px; pointer-events: none; }
.certificate .kicker { text-transform: uppercase; letter-spacing: .18em; font-size: clamp(.65rem, 1.4vw, .85rem); font-weight: 700; color: #6b665d; }
.certificate .who { font-size: clamp(1.6rem, 5vw, 3.4rem); font-weight: 750; letter-spacing: -0.02em; line-height: 1.1; margin: .2em 0; }
.certificate .what { font-size: clamp(1rem, 2.6vw, 1.6rem); font-weight: 600; color: var(--accent); }
.certificate .foot { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; font-size: clamp(.65rem, 1.4vw, .85rem); color: #6b665d; }
.certificate .seal { width: clamp(56px, 11vw, 110px); height: clamp(56px, 11vw, 110px); border-radius: 50%; background: var(--accent); color: #fff; display: grid; place-items: center; box-shadow: 0 0 0 6px color-mix(in oklab, var(--accent) 25%, transparent); }
.certificate .seal .icon { width: 45%; height: 45%; }

/* Celebration */
.celebrate { text-align: center; padding-top: 80px; padding-bottom: 80px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.celebrate .seal { width: 96px; height: 96px; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; box-shadow: 0 0 0 10px var(--accent-soft); }
.celebrate .seal .icon { width: 44px; height: 44px; }
#confetti { position: fixed; inset: 0; pointer-events: none; z-index: 50; }

/* People, marking, settings */
.badge.warn { background: color-mix(in oklab, #d99a1c 18%, transparent); color: #a8730c; }
.badge.bad { background: color-mix(in oklab, var(--bad) 14%, transparent); color: var(--bad); }
.subnav { margin-top: 12px; flex-wrap: wrap; }
.count-pill { background: var(--on-accent); color: var(--accent-ink); border-radius: 99px; padding: 2px 7px; font-size: .75rem; line-height: 1.2; }
.btn.ghost .count-pill { background: var(--accent); color: var(--on-accent); }
.toolbar { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0; }
.filters input[type=search] { width: 220px; }
.filters select { width: auto; }
.stack { display: grid; gap: 20px; max-width: 760px; }
.rule { border: 0; border-top: 1px solid var(--line); margin: 24px 0; }
.tabs a.tab { font: 600 .9rem var(--font); padding: 8px 14px; border-radius: 9px; color: var(--muted); text-decoration: none; }
.tabs a.tab[aria-selected=true] { background: var(--surface-2); color: var(--ink); }
.menu { position: relative; display: inline-block; }
.menu summary { list-style: none; }
.menu summary::-webkit-details-marker { display: none; }
.menu-body { position: absolute; right: 0; top: calc(100% + 4px); z-index: 5; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); padding: 6px; display: grid; gap: 2px; min-width: 220px; text-align: left; }
.menu-body form { margin: 0; }
.menu-body .btn { width: 100%; justify-content: flex-start; }
.segmented { display: inline-flex; width: fit-content; border: 1px solid var(--line-strong); border-radius: 12px; padding: 3px; gap: 3px; flex-wrap: wrap; }
.segmented label { margin: 0; }
.segmented input { position: absolute; opacity: 0; pointer-events: none; }
.segmented span { display: block; padding: 8px 14px; border-radius: 9px; font-weight: 600; font-size: .9rem; cursor: pointer; color: var(--muted); }
.segmented input:checked + span { background: var(--accent); color: var(--on-accent); }
.segmented input:focus-visible + span { outline: 3px solid var(--accent); outline-offset: 2px; }
.events { border: 0; padding: 0; margin: 0 0 16px; display: grid; gap: 6px; }
.events legend { margin-bottom: 8px; }
.codeblock { background: var(--surface-2); border-radius: 12px; padding: 14px 16px; overflow-x: auto; font: .8rem/1.6 var(--mono); white-space: pre; }
tr.faded td { opacity: .55; }
.files { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 6px; }
.files li { display: flex; align-items: center; gap: 10px; justify-content: space-between; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.files li a { display: inline-flex; gap: 8px; align-items: center; font-weight: 600; text-decoration: none; min-width: 0; }
.files li a span, .files li .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.files li .bar { width: 90px; flex: none; }
.files li.failed { border-color: var(--bad); }
.coursework { margin-top: 36px; max-width: 70ch; }
.coursework .panel { margin-bottom: 16px; }
.coursework .upload-box { padding: 24px; }
.feedback { margin-top: 12px; padding: 12px 16px; border-left: 3px solid var(--accent); background: var(--surface-2); border-radius: 0 10px 10px 0; }
.feedback p { margin: 4px 0 0; white-space: pre-wrap; }
.note { margin: 12px 0; padding: 12px 16px; border-left: 3px solid var(--line-strong); color: var(--ink); white-space: pre-wrap; }
.earlier summary { cursor: pointer; font-weight: 650; margin-bottom: 12px; }
.lock-note { display: flex; gap: 8px; align-items: center; color: var(--muted); max-width: 22rem; margin: 0; }

footer.site { border-top: 1px solid var(--line); padding: 28px 0 40px; color: var(--muted); font-size: .85rem; }

@media print {
  .site-header, footer.site, .no-print { display: none !important; }
  body { background: #fff; }
  .cert-page { padding: 0; }
  .certificate { box-shadow: none; width: 100%; border: 0; }
  @page { size: A4 landscape; margin: 10mm; }
}
`;
