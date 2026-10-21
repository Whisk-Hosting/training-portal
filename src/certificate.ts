// The certificate as a PDF, typeset with Typst. The learner's name and the course title go in
// as inputs, never into the markup, so no text can change the layout.
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import { readFile } from "node:fs/promises";
import { isColor } from "./model.js";

const template = String.raw`
#let i = sys.inputs
#let accent = rgb(i.accent)
#let muted = rgb("#6b665d")
#set document(title: i.course + " certificate", author: i.portal)
#set page(paper: "a4", flipped: true, margin: 0pt, fill: rgb("#fffdf8"))
#set text(font: "Figtree", fill: rgb("#1f1d1a"), size: 11pt)

#let star(r) = {
  let pts = range(10).map(k => {
    let a = -90deg + k * 36deg
    let d = if calc.even(k) { r } else { r * 0.42 }
    (r + d * calc.cos(a), r + d * calc.sin(a))
  })
  polygon(fill: white, ..pts)
}

#place(top + left, dx: 14mm, dy: 14mm, rect(width: 100% - 28mm, height: 100% - 28mm, stroke: 1.5pt + accent, radius: 2pt))

#pad(x: 32mm, y: 30mm)[
  #block(height: 100%)[
    #text(size: 9pt, weight: "bold", tracking: 0.18em, fill: muted)[#upper(i.portal + " · Certificate of completion")]

    #v(1fr)
    #text(size: 9pt, weight: "bold", tracking: 0.1em, fill: muted)[THIS CERTIFIES THAT]
    #v(4mm)
    #text(size: 40pt, weight: "extrabold", tracking: -0.02em)[#i.name]
    #v(8mm)
    #text(size: 9pt, weight: "bold", tracking: 0.1em, fill: muted)[FINISHED THE COURSE]
    #v(3mm)
    #text(size: 20pt, weight: "semibold", fill: accent)[#i.course]
    #v(1fr)

    #grid(columns: (1fr, auto), align: (left + bottom, right + bottom),
      text(size: 9pt, fill: muted)[Issued #i.issued \ Check it at #link(i.url)[#i.urlText]],
      circle(radius: 16mm, fill: accent, stroke: 5pt + accent.transparentize(70%))[
        #set align(center + horizon)
        #star(7mm)
      ],
    )
  ]
]
`;

let compiler: NodeCompiler | undefined;
const getCompiler = async () => {
  if (compiler) return compiler;
  const dir = new URL("../node_modules/@expo-google-fonts/figtree/", import.meta.url);
  const fontBlobs = await Promise.all(
    ["400Regular/Figtree_400Regular.ttf", "600SemiBold/Figtree_600SemiBold.ttf", "700Bold/Figtree_700Bold.ttf", "800ExtraBold/Figtree_800ExtraBold.ttf"].map((f) => readFile(new URL(f, dir))),
  );
  compiler = NodeCompiler.create({ fontArgs: [{ fontBlobs }] });
  return compiler;
};

export const certificatePdf = async (p: { portal: string; accent: string; name: string; course: string; issued: Date; url: string }): Promise<Buffer> => {
  const c = await getCompiler();
  const inputs = {
    portal: p.portal,
    accent: isColor(p.accent) ? p.accent : "#e85d2a",
    name: p.name,
    course: p.course,
    issued: new Date(p.issued).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
    url: p.url,
    urlText: p.url.replace(/^https?:\/\//, ""),
  };
  try {
    return c.pdf({ mainFileContent: template, inputs });
  } finally {
    c.evictCache(10);
  }
};
