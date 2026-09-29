// Builds report/Coin_Counter_Poster.docx: A3 portrait, blue/green theme (scales to A1 / 70x100 cm)
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, ShadingType, BorderStyle, VerticalAlign,
} = require("docx");

const ROOT = process.argv[2];
const FIG = path.join(ROOT, "report", "figures");
const stats = JSON.parse(fs.readFileSync(path.join(FIG, "stats.json"), "utf8"));
const rows = stats.rows;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const T = sum(rows.map((r) => r.true)), E = sum(rows.map((r) => Math.abs(r.pred - r.true)));
const exact = rows.filter((r) => r.pred === r.true).length;
const within1 = rows.filter((r) => Math.abs(r.pred - r.true) <= 1).length;
const btnT = sum(rows.map((r) => r.true_buttons)), btnF = sum(rows.map((r) => r.pred_buttons));
const clean = rows.filter((r) => r.category === "clean");
const cleanMae = sum(clean.map((r) => Math.abs(r.pred - r.true))) / clean.length;
const acc = (100 * (1 - E / T)).toFixed(2);
const msMean = sum(rows.map((r) => r.ms)) / rows.length;

const BLUE_DARK = "0B3C74", BLUE = "1565C0", BLUE_LIGHT = "EAF2FC", GREEN = "2E9E6B", GREEN_SOFT = "A9E3C6",
  GREEN_LIGHT = "E7F6EE", GREY = "5F6B7A", FONT = "Calibri";
const PAGE_W = 16838, PAGE_H = 23811, M = 620, CONTENT = PAGE_W - 2 * M;
const PX = 96 / 1440;

const run = (t, o = {}) => new TextRun({ text: t, font: FONT, size: o.size || 23, bold: o.bold, italics: o.italics,
  color: o.color, characterSpacing: o.sp });
const p = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [run(children, o)],
  alignment: o.align || AlignmentType.LEFT, spacing: { after: o.after ?? 100, before: o.before ?? 0, line: o.line || 260 } });
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NB = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const GAP = { style: BorderStyle.SINGLE, size: 72, color: "FFFFFF" };

function img(name, widthDxa, maxH) {
  const b = fs.readFileSync(path.join(FIG, name));
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  let wp = widthDxa * PX, hp = (wp * h) / w;
  if (maxH && hp > maxH) { hp = maxH; wp = (hp * w) / h; }
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 40 },
    children: [new ImageRun({ type: "png", data: b, transformation: { width: Math.round(wp), height: Math.round(hp) } })] });
}
const cap = (t) => p([run(t, { size: 19, color: GREY })], { align: AlignmentType.CENTER, after: 80 });

// Heading: blue text on a light-blue band with a green block on the left
const heading = (t) => new Paragraph({ spacing: { before: 60, after: 120 },
  shading: { fill: BLUE_LIGHT, type: ShadingType.CLEAR, color: "auto" },
  border: { left: { style: BorderStyle.SINGLE, size: 48, color: GREEN, space: 6 } },
  children: [run(" " + t, { size: 34, bold: true, color: BLUE_DARK })] });

function cell(children, width, o = {}) {
  return new TableCell({ width: { size: width, type: WidthType.DXA }, children, verticalAlign: o.v || VerticalAlign.TOP,
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: o.pad ?? 0, bottom: o.pad ?? 0, left: o.padX ?? 0, right: o.padX ?? 0 }, borders: o.borders || NB, columnSpan: o.span });
}
const table = (widths, rowsCells) => new Table({ width: { size: sum(widths), type: WidthType.DXA }, columnWidths: widths,
  rows: rowsCells.map((cells) => new TableRow({ children: cells })) });
const split = (n) => { const w = Math.floor(CONTENT / n); return Array.from({ length: n }, (_, i) => (i === n - 1 ? CONTENT - w * (n - 1) : w)); };

// ── Header ─────────────────────────────────────────────────────────
const hL = Math.round(CONTENT * 0.66), hR = CONTENT - hL;
const header = table([hL, hR], [[
  cell([
    p([run("IMAGE PROCESSING  ·  FINAL PROJECT", { size: 22, bold: true, color: GREEN_SOFT, sp: 40 })], { after: 120 }),
    p([run("Every Coin ", { size: 104, bold: true, color: "FFFFFF" }), run("Counts", { size: 104, bold: true, color: GREEN_SOFT })], { after: 80, line: 240 }),
    p([run("Counting coins on a textured pad with classical image processing", { size: 36, color: "D6E4F5" })], { after: 0 }),
  ], hL, { fill: BLUE_DARK, pad: 420, padX: 500, v: VerticalAlign.CENTER }),
  cell([
    p([run("Authors", { size: 20, bold: true, color: GREEN_SOFT })], { after: 20 }),
    p([run("[Student Name 1]", { size: 26, color: "FFFFFF" })], { after: 0 }),
    p([run("[Student Name 2]", { size: 26, color: "FFFFFF" })], { after: 140 }),
    p([run("Lecturer", { size: 20, bold: true, color: GREEN_SOFT })], { after: 20 }),
    p([run("[Lecturer Name]", { size: 26, color: "FFFFFF" })], { after: 140 }),
    p([run("[Institution]  ·  [Semester, Year]", { size: 22, color: "D6E4F5" })], { after: 0 }),
  ], hR, { fill: BLUE, pad: 420, padX: 360, v: VerticalAlign.CENTER }),
]]);
const greenBar = new Paragraph({ spacing: { before: 0, after: 200 }, border: { top: { style: BorderStyle.SINGLE, size: 48, color: GREEN, space: 0 } }, children: [] });

// ── Key numbers strip ──────────────────────────────────────────────
const tiles = [[`${acc}%`, "count accuracy", `${E} coins off out of ${T}`], [(E / rows.length).toFixed(2), "mean abs. error", "coins per photo"],
  [`${exact}/${rows.length}`, "exact photos", `${within1}/${rows.length} within ±1 coin`], [`${btnF}/${btnT}`, "buttons excluded", "by holes or colour"]];
const tw = split(4);
const numbers = table(tw, [tiles.map(([big, small, note], i) => cell([
  p([run(big, { size: 64, bold: true, color: i % 2 ? BLUE_DARK : "FFFFFF" })], { align: AlignmentType.CENTER, after: 0, line: 240 }),
  p([run(small, { size: 24, bold: true, color: i % 2 ? GREEN : GREEN_SOFT })], { align: AlignmentType.CENTER, after: 0 }),
  p([run(note, { size: 19, color: i % 2 ? GREY : "D6E4F5" })], { align: AlignmentType.CENTER, after: 0 }),
], tw[i], { fill: i % 2 ? GREEN_LIGHT : BLUE, pad: 160, padX: 80, borders: NB }))]);

// ── Row A: the problem | the pipeline ──────────────────────────────
const aL = Math.round(CONTENT * 0.44), aG = 360, aRw = CONTENT - aL - aG;
const rowA = table([aL, aG, aRw], [[
  cell([
    heading("The problem"),
    p("People count coins at a glance; a computer sees only pixels. Our phone photos add three traps: a white pad full of folds and seams, dark or motion-blurred shots, and buttons the size of a coin mixed in."),
    p([run("Question  ", { bold: true, color: GREEN }), run("Can fixed classical rules, with no training, count only the coins under these conditions?")]),
    p([run("Data  ", { bold: true, color: GREEN }), run(`${rows.length} photos · ${T} coins · ${btnT} buttons, hand-counted and split into clean, noisy (dark / blurred) and damaged (piles, cut coins, buttons). A synthetic image with 6 discs checked the code: ${stats.synthetic_detected} of 6 found.`)]),
  ], aL),
  cell([p("")], aG),
  cell([
    heading("The pipeline"),
    img("fig01_pipeline.png", aRw),
    ...[
      ["Background", "a huge median filter models pad and light; each pixel gets a Lab “difference from background” score."],
      ["Blobs", "multi-scale Laplacian of Gaussian finds round, coin-sized peaks."],
      ["Folds", "a Hessian test rejects ridges; a grayscale opening removes thin seams."],
      ["Touching coins", "Hough circles split what LoG merges."],
      ["Buttons", "black-hat reveals sewing holes; blue or pink objects are never coins."],
    ].map(([k, v]) => p([run("■ ", { color: GREEN, size: 18 }), run(k + ": ", { bold: true, color: BLUE_DARK }), run(v)], { after: 50 })),
  ], aRw),
]]);

// ── Row B: full-width stages ───────────────────────────────────────
const rowB = [heading("From photo to count"), img("fig02_stages.png", CONTENT, 225),
  cap("Input → foreground map → pad mask → LoG response → raw peaks (mostly folds) → 14 coins after verification.")];

// ── Row C: three columns — exact results | development | buttons ──
const G = 300, c3 = Math.floor((CONTENT - 2 * G) / 3), c3r = CONTENT - 2 * G - 2 * c3;
const rowC = table([c3, G, c3, G, c3r], [[
  cell([
    heading("Results"),
    img("fig05_exact.png", c3),
    cap("Exact counts on clean and dark photos."),
    p(`Clean photos: MAE ${cleanMae.toFixed(2)}, all within one coin. About ${(msMean / 1000).toFixed(1)} s per 1600 × 900 photo.`),
  ], c3),
  cell([p("")], G),
  cell([
    heading("What made it work"),
    img("fig06_progress.png", c3),
    cap("Error after each development step."),
    p("Pad folds fooled every early version. The Hessian test, round versus ridge, cut the error by more than half."),
  ], c3),
  cell([p("")], G),
  cell([
    heading("Coins vs. buttons"),
    img("fig08_buttons.png", c3r),
    cap("Red X = button, not counted."),
    p("Blue, navy and pink buttons fail the colour test; for the rest, black-hat reveals 2–4 sewing holes around the centre."),
  ], c3r),
]]);

// ── Row D: three green take-away boxes ─────────────────────────────
const dw = split(3);
const take = [
  ["Conclusion", `Classical tools alone reached ${acc}% count accuracy and excluded ${btnF} of ${btnT} buttons. Shape (Hessian) beat brightness for ignoring folds, and LoG + Hough together handled blurry and touching coins.`],
  ["Limitations", "Strong motion blur splits a coin into several blobs (22 vs 14). Dense piles hide coins, coins cut by the frame are half-circles, and a grey button without visible holes looks like a coin."],
  ["Next steps", "Merge detections along the blur direction, fit partial circles at the image border, use rim colour for grey buttons, and mark coin positions to separate false positives from misses."],
];
const rowD = table(dw, [take.map(([t, v], i) => cell([
  p([run(t, { size: 30, bold: true, color: i === 0 ? "FFFFFF" : GREEN })], { after: 80 }),
  p([run(v, { color: i === 0 ? "FFFFFF" : undefined })], { after: 0 }),
], dw[i], { fill: i === 0 ? GREEN : GREEN_LIGHT, pad: 170, padX: 240, borders: { top: NONE, bottom: NONE, left: i ? GAP : NONE, right: NONE } }))]);

const sp = (a) => p("", { after: a });
const doc = new Document({
  creator: "Coin counter project", title: "Every Coin Counts — Poster",
  styles: { default: { document: { run: { font: FONT, size: 23 } } } },
  sections: [{ properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: M, bottom: M, left: M, right: M } } },
    children: [header, greenBar, numbers, sp(120), rowA, sp(40), ...rowB, rowC, sp(120), rowD] }],
});
const out = process.argv[3] || path.join(ROOT, "report", "Every_Coin_Counts_Poster.docx");
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(out, b); console.log("wrote", out); });
