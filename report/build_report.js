// Builds report/Coin_Counter_Report.docx from report/figures + stats.json
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, WidthType, ShadingType, BorderStyle, Footer, Header,
  PageNumber, PageBreak, LevelFormat, TabStopType, VerticalAlign,
} = require("docx");

const ROOT = process.argv[2];
const FIG = path.join(ROOT, "report", "figures");
const stats = JSON.parse(fs.readFileSync(path.join(FIG, "stats.json"), "utf8"));
const rows = stats.rows;

const BLUE_DARK = "0B3C74", BLUE = "1565C0", BLUE_LIGHT = "EAF2FC", GREEN = "2E9E6B", GREEN_SOFT = "A9E3C6",
  GREEN_LIGHT = "E7F6EE", GREY = "5F6B7A", FONT = "Calibri";
const NAVY = BLUE_DARK, ACCENT = GREEN, LIGHT = BLUE_LIGHT;
const PAGE_W = 12240, MARGIN = 1080, CONTENT = PAGE_W - 2 * MARGIN; // 10080 DXA
const PX_PER_DXA = 96 / 1440;

// ── numbers ────────────────────────────────────────────────────────
const sum = (a) => a.reduce((x, y) => x + y, 0);
const T = sum(rows.map((r) => r.true));
const P = sum(rows.map((r) => r.pred));
const E = sum(rows.map((r) => Math.abs(r.pred - r.true)));
const exact = rows.filter((r) => r.pred === r.true).length;
const within1 = rows.filter((r) => Math.abs(r.pred - r.true) <= 1).length;
const over = rows.filter((r) => r.pred > r.true).length;
const under = rows.filter((r) => r.pred < r.true).length;
const mae = E / rows.length;
const countAcc = 100 * (1 - E / T);
const btnTrue = sum(rows.map((r) => r.true_buttons));
const btnFound = sum(rows.map((r) => r.pred_buttons));
const ms = rows.map((r) => r.ms);
const msMean = sum(ms) / ms.length;
const byCat = {};
for (const c of ["clean", "noisy", "damaged"]) {
  const g = rows.filter((r) => r.category === c);
  const e = g.map((r) => Math.abs(r.pred - r.true));
  byCat[c] = { n: g.length, coins: sum(g.map((r) => r.true)), mae: sum(e) / g.length,
    exact: g.filter((r) => r.pred === r.true).length, w1: e.filter((x) => x <= 1).length };
}
const f2 = (x) => x.toFixed(2);
const byId = Object.fromEntries(rows.map((r) => [r.short, r]));
const pid = (short) => byId[short].id;

// ── helpers ────────────────────────────────────────────────────────
const run = (text, o = {}) => new TextRun({ text, font: o.font || FONT, size: o.size || 21, bold: o.bold,
  italics: o.italics, color: o.color, characterSpacing: o.spacing });
const para = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [run(children, o)],
  alignment: o.align || AlignmentType.JUSTIFIED, spacing: { after: o.after ?? 140, before: o.before ?? 0, line: o.line || 276 },
  keepNext: o.keepNext, indent: o.indent });
const body = (text) => para(text);
const rich = (parts) => para(parts.map((p) => (typeof p === "string" ? run(p) : run(p[0], p[1]))));
const label = (text, o = {}) => para([run(text, { size: 22, bold: true, color: o.color || BLUE })],
  { after: 60, before: o.before ?? 120, align: AlignmentType.LEFT, keepNext: true });

// Chapter heading: dark-blue band, green number, white title, green rule underneath
const h1 = (num, text) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { before: 0, after: 280 },
  shading: { fill: BLUE_DARK, type: ShadingType.CLEAR, color: "auto" },
  border: { bottom: { style: BorderStyle.SINGLE, size: 36, color: GREEN, space: 0 } },
  children: [run(" " + String(num).replace(/^0/, "") + "   ", { size: 44, bold: true, color: GREEN_SOFT }), run(text, { size: 40, bold: true, color: "FFFFFF" })] });
// Section heading: blue text with a green bar on the left
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 120 }, keepNext: true,
  border: { left: { style: BorderStyle.SINGLE, size: 36, color: GREEN, space: 8 } },
  children: [run(text, { size: 27, bold: true, color: BLUE })] });

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b };
}
function image(name, widthDxa, o = {}) {
  const { w, h, data } = pngSize(path.join(FIG, name));
  let wpx = widthDxa * PX_PER_DXA, hpx = (wpx * h) / w;
  if (o.maxH && hpx > o.maxH) { hpx = o.maxH; wpx = (hpx * w) / h; }
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 60 }, keepNext: true,
    children: [new ImageRun({ type: "png", data, transformation: { width: Math.round(wpx), height: Math.round(hpx) } })] });
}
const caption = (num, text) => para([run(`Fig. ${num}  `, { bold: true, size: 18, color: GREEN }), run(text, { size: 18, color: GREY })],
  { after: 240, align: AlignmentType.CENTER, line: 252 });
const figLabel = () => new Paragraph({ spacing: { before: 0, after: 0 }, keepNext: true, children: [] });

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const THIN = { style: BorderStyle.SINGLE, size: 4, color: "C9D8EC" };
const WHITE_GAP = { style: BorderStyle.SINGLE, size: 48, color: "FFFFFF" };

function cell(children, width, o = {}) {
  return new TableCell({ width: { size: width, type: WidthType.DXA }, verticalAlign: o.vAlign || VerticalAlign.TOP,
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: o.pad ?? 100, bottom: o.pad ?? 100, left: o.padX ?? 160, right: o.padX ?? 160 },
    borders: o.borders || NO_BORDERS, columnSpan: o.span, children });
}

// Green note box (full width)
function callout(title, lines) {
  return new Table({ width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [CONTENT], rows: [new TableRow({ children: [
    cell([label(title, { before: 0, color: GREEN }), ...lines.map((l) => para(l, { after: 60, align: AlignmentType.LEFT }))], CONTENT,
      { fill: GREEN_LIGHT, pad: 180, padX: 240, borders: { top: { style: BorderStyle.SINGLE, size: 24, color: GREEN }, bottom: NONE, left: NONE, right: NONE } }),
  ] })] });
}

// Two light-blue boxes side by side
function twoBoxes(a, b) {
  const w = CONTENT / 2;
  const mk = ([t, lines]) => cell([label(t, { before: 0 }), ...lines.map((l) => para(l, { after: 60, align: AlignmentType.LEFT }))], w,
    { fill: BLUE_LIGHT, pad: 120, padX: 220, borders: { top: { style: BorderStyle.SINGLE, size: 24, color: BLUE }, bottom: NONE, left: WHITE_GAP, right: WHITE_GAP } });
  return new Table({ width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [w, w], rows: [new TableRow({ children: [mk(a), mk(b)] })] });
}

// Solid blue stat tiles with white numbers
function statTiles(items) {
  const w = Math.floor(CONTENT / items.length);
  const widths = items.map((_, i) => (i === items.length - 1 ? CONTENT - w * (items.length - 1) : w));
  return new Table({ width: { size: CONTENT, type: WidthType.DXA }, columnWidths: widths, rows: [new TableRow({ children: items.map(([big, small, note], i) =>
    cell([
      para([run(big, { size: 46, bold: true, color: "FFFFFF" })], { align: AlignmentType.CENTER, after: 20 }),
      para([run(small, { size: 20, bold: true, color: GREEN_SOFT })], { align: AlignmentType.CENTER, after: 40 }),
      para([run(note, { size: 16, color: "D6E4F5" })], { align: AlignmentType.CENTER, after: 0, line: 240 }),
    ], widths[i], { fill: i % 2 ? BLUE : BLUE_DARK, pad: 180, borders: { top: NONE, bottom: { style: BorderStyle.SINGLE, size: 24, color: GREEN }, left: NONE, right: NONE } })) })] });
}

// Data table: blue header, light-blue banding, green total row
function dataTable(header, data, widths, o = {}) {
  const total = sum(widths);
  const hdr = new TableRow({ tableHeader: true, children: header.map((h, i) => cell([para([run(h, { size: 18, bold: true, color: "FFFFFF" })],
    { align: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER, after: 0, keepNext: o.keep })], widths[i], { fill: BLUE, pad: 80 })) });
  const body = data.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((v, i) => {
    const last = o.boldLast && ri === data.length - 1;
    const colour = o.colourFn ? o.colourFn(ri, i, v) : undefined;
    return cell([para([run(String(v), { size: 18, bold: last || i === 0, color: colour || (i === 0 ? BLUE_DARK : undefined) })],
      { align: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER, after: 0, keepNext: o.keep && ri < data.length - 1 })],
      widths[i], { fill: last ? GREEN_LIGHT : ri % 2 ? BLUE_LIGHT : undefined, pad: 55,
        borders: { top: NONE, left: NONE, right: NONE, bottom: last ? { style: BorderStyle.SINGLE, size: 12, color: GREEN } : THIN } });
  }) }));
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, rows: [hdr, ...body] });
}

// Stage cards: green step number beside a blue title, text below
function stageGrid(items) {
  const w = CONTENT / 2;
  const trs = [];
  for (let i = 0; i < items.length; i += 2) {
    trs.push(new TableRow({ cantSplit: true, children: [0, 1].map((k) => {
      const it = items[i + k];
      if (!it) return cell([para("")], w);
      const m = it[0].match(/^(\d+)\.\s*(.*)$/);
      return cell([
        para([run(m[1] + "  ", { size: 26, bold: true, color: GREEN }), run(m[2], { size: 21, bold: true, color: BLUE_DARK })], { align: AlignmentType.LEFT, after: 20 }),
        para([run(it[1], { size: 18 })], { align: AlignmentType.LEFT, after: 0, line: 240 }),
      ], w, { fill: BLUE_LIGHT, pad: 80, padX: 180, borders: { top: WHITE_GAP, bottom: WHITE_GAP, left: WHITE_GAP, right: WHITE_GAP } });
    }) }));
  }
  return new Table({ width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [w, w], rows: trs });
}

// Code listing: light-blue background with a thin blue rule on the left
function codeBlock(title, file) {
  const lines = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r/g, "").split("\n");
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  const out = [label(`${title}: ${file}`, { before: 240 })];
  for (const l of lines) {
    out.push(new Paragraph({ spacing: { after: 0, line: 228 }, shading: { fill: "F3F7FC", type: ShadingType.CLEAR, color: "auto" },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: BLUE, space: 6 } }, indent: { left: 160, right: 120 },
      children: [new TextRun({ text: l.length ? l : " ", font: "Consolas", size: 15, color: "1E2A3A" })] }));
  }
  return out;
}

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
const bullets = (items) => items.map((t) => new Paragraph({ numbering: { reference: "bul", level: 0 }, spacing: { after: 70, line: 264 },
  children: (typeof t === "string" ? [t] : t).map((p) => (typeof p === "string" ? run(p) : run(p[0], p[1]))) }));

// ── Cover ──────────────────────────────────────────────────────────
const cover = [
  new Table({ width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [CONTENT], rows: [
    new TableRow({ height: { value: 5200, rule: "atLeast" }, children: [cell([
      para([run("IMAGE PROCESSING  ·  FINAL PROJECT", { size: 20, bold: true, color: GREEN_SOFT, spacing: 40 })], { align: AlignmentType.LEFT, before: 500, after: 400 }),
      para([run("Every Coin", { size: 96, bold: true, color: "FFFFFF" })], { align: AlignmentType.LEFT, after: 0, line: 240 }),
      para([run("Counts", { size: 96, bold: true, color: GREEN_SOFT })], { align: AlignmentType.LEFT, after: 300, line: 240 }),
      para([run("Counting coins on a textured pad with classical image processing", { size: 30, color: "D6E4F5" })], { align: AlignmentType.LEFT, after: 200 }),
    ], CONTENT, { fill: BLUE_DARK, padX: 560, pad: 200, vAlign: VerticalAlign.BOTTOM,
      borders: { top: NONE, left: NONE, right: NONE, bottom: { style: BorderStyle.SINGLE, size: 48, color: GREEN } } })] }),
  ] }),
  para("", { after: 300 }),
  new Table({ width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [CONTENT / 3, CONTENT / 3, CONTENT / 3], rows: [new TableRow({ children: [
    ["Authors", ["[Student Name 1]", "[Student Name 2]"]],
    ["Course", ["Image Processing", "[Semester, Year]"]],
    ["Institution", ["[Institution]", "Instructor: [Lecturer Name]"]],
  ].map(([t, ls]) => cell([para([run(t, { size: 18, bold: true, color: GREEN })], { align: AlignmentType.LEFT, after: 60 }),
    ...ls.map((l) => para([run(l, { size: 22, color: BLUE_DARK })], { align: AlignmentType.LEFT, after: 20 }))], CONTENT / 3,
    { padX: 160, borders: { top: NONE, bottom: NONE, right: NONE, left: { style: BorderStyle.SINGLE, size: 12, color: BLUE } } })) })] }),
  para("", { after: 200 }),
  new Table({ width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [CONTENT], rows: [new TableRow({ children: [cell([
    para([run("Abstract", { size: 26, bold: true, color: BLUE })], { align: AlignmentType.LEFT, after: 100 }),
    para(`Counting coins sounds easy until the coins lie on a crumpled white pad full of folds and seams, some photos are dark or blurred, coins pile up on each other, and buttons of the same size are mixed in. We built a classical image-processing system, with no machine learning, that counts only the coins. It models the pad and the lighting with a very large median filter, finds round blobs with a multi-scale Laplacian of Gaussian, rejects pad folds with a Hessian shape test and a grayscale opening, and separates touching coins with a Hough circle transform. Buttons are recognised by their sewing holes (black-hat transform) and by colours no coin has.`, { after: 100 }),
    para(`On ${rows.length} phone photographs with ${T} coins and ${btnTrue} buttons the system reported ${P} coins, a total counting error of ${E} coins (${f2(countAcc)}% count accuracy). ${exact} photographs were counted exactly and ${within1} were within one coin; on clean photographs the mean error was ${f2(byCat.clean.mae)} coins per photo. ${btnFound} of the ${btnTrue} buttons were recognised and excluded. The hard cases were strong motion blur, dense piles and coins cut by the image frame.`, { after: 60 }),
  ], CONTENT, { fill: BLUE_LIGHT, pad: 220, padX: 300 })] })] }),
  para([run("Keywords  ", { size: 18, bold: true, color: GREEN }), run("coin counting · Laplacian of Gaussian · Hessian · Hough circles · morphology · black-hat · button rejection", { size: 18, color: GREY })],
    { align: AlignmentType.LEFT, before: 200 }),
];

// ── 01 Introduction ────────────────────────────────────────────────
const intro = [
  h1("01", "Introduction"),
  body("A person looking at a handful of coins on a table can count them at a glance. A computer receives only a grid of pixel values, and many things in a real photograph look round, dark or shiny: folds in the cloth, shadows, the pattern printed on the pad, and in our case buttons that have almost exactly the size of a coin."),
  body("Our photographs were taken with a phone from above, on a white disposable pad. The pad is the main difficulty: it has a quilted texture and deep fold lines that form a grid across the whole image. A simple threshold sees those folds as objects, and a circle detector finds circles in the texture. On top of that, some photos were taken in a dark room or with a moving hand, so coins become dim or smeared."),
  body("The system follows fixed rules chosen by us; it does not learn from labelled examples. We wanted every decision to be explainable with techniques from the course: filtering, morphology, derivatives, blob detection and the Hough transform."),
  body("The project does not try to recognise the value of a coin. It answers only one question per object: is this a coin that should be counted, or something else (a fold, a shadow, a button)?"),
  callout("Research question", ["Can a classical image-processing pipeline count the coins in phone photographs taken on a textured, folded pad, when the photos may be dark or blurred, coins may touch, overlap or be cut by the frame, and buttons of similar size are mixed in?"]),
  para("", { after: 120 }),
  body("We expected clean photographs to be easy and the damaged ones, especially dense piles, to remain the main source of error, since a coin that is mostly hidden gives very little visible evidence."),
];

// ── 02 Methods ─────────────────────────────────────────────────────
const catRows = [
  ["Clean", `${byCat.clean.n}`, `${byCat.clean.coins}`, "Sharp, well lit, coins spread over the pad"],
  ["Noisy", `${byCat.noisy.n}`, `${byCat.noisy.coins}`, "Dark room and/or motion blur"],
  ["Damaged", `${byCat.damaged.n}`, `${byCat.damaged.coins}`, "Dense pile, coins cut by the frame, buttons among coins"],
  ["Total", `${rows.length}`, `${T}`, `Plus ${btnTrue} buttons in three photographs`],
];
const methods = [
  h1("02", "Methods"),
  h2("2.1 The photographs"),
  body(`We used ${rows.length} photographs taken with a phone camera (1600 × 900 pixels). All show Israeli coins on the same kind of white pad, photographed from roughly the same height. Before running the program we counted the visible coins in each photograph by hand and wrote the counts to ground_truth.csv. A coin was counted when any part of it was visible; a coin completely hidden under others was not. Every photo received an ID (P01–P26) that is used throughout this report. The program is written in Python with OpenCV and NumPy.`),
  dataTable(["Category", "Photos", "Coins", "What makes it hard"], catRows, [1700, 1100, 1100, 6180], { boldLast: true, keep: true }),
  para("", { after: 80 }),
  body("We also generated a synthetic test image with six coloured discs on a light, noisy background, to check that detection, drawing and counting work before looking at the real photos."),
  h2("2.2 How we measured success"),
  body("We did not mark the position of every coin, so the evaluation is done at the level of counts. For each photo we compare the predicted number of coins with the manual count and report:"),
  ...bullets([
    [["Mean absolute error (MAE): ", { bold: true }], "the average of |predicted − true| over photos."],
    [["Exact photos: ", { bold: true }], "how many photos received exactly the right count (a strict measure: one coin off makes the whole photo wrong)."],
    [["Within ±1: ", { bold: true }], "how many photos were off by at most one coin."],
    [["Count accuracy: ", { bold: true }], "1 − (sum of absolute errors ÷ total number of coins)."],
    [["Buttons flagged: ", { bold: true }], "how many of the real buttons were recognised as buttons and removed from the coin count."],
  ]),
  h2("2.3 The system from start to finish"),
  figLabel(1), image("fig01_pipeline.png", CONTENT),
  caption(1, "The complete pipeline. Dark-blue stages prepare the image; green stages find and classify objects. LoG finds blob-shaped candidates, Hough separates touching coins, and the classifier removes buttons."),
  body("The key idea is to stop working on raw brightness. The pad is bright and colourless, while every coin, bronze or silver, differs from it either in lightness or in colour. So we first estimate what the pad would look like without the coins, and then measure how far every pixel is from that estimate. All later stages work on this foreground map, which is why the same settings work for bright and dark photos."),
  h2("2.4 How each stage works"),
  stageGrid([
    ["1. Background model", "Each Lab channel is median-filtered at quarter resolution with a window of 45% of the image width. Coins and even small piles disappear, leaving the pad and the lighting gradient."],
    ["2. Foreground map", "For each pixel: relative darkness (L_bg − L)/L_bg, half-weighted relative brightness, and colour distance in the a,b plane. The maximum of the three, lightly smoothed, gives a 0–255 score."],
    ["3. Pad mask", "Bright, colourless background region connected to the image centre. Knees, floor or bed around the pad are ignored."],
    ["4. Multi-scale LoG", "−σ²∇²G on the foreground map for 12 radii (2.5–5.5% of width), σ = r/√2, max over scales. Local maxima are coin candidates with their radius."],
    ["5. Blob verification", "Hessian eigenvalue ratio ≥ 0.25 (round, not a ridge); peak ≥ 20% of a typical coin; radius ≥ 70% of the typical coin; ≥ 40% of the response survives a grayscale opening; no stronger coin within 0.95 r."],
    ["6. Hough circles", "HOUGH_GRADIENT_ALT on the median-blurred gray image with radius 0.6–1.3 × coin radius. Circles must lie on the pad and differ from the background. LoG blobs not explained by any circle are added."],
    ["7. Button test", "Black-hat (closing − image) highlights small dark spots. 2–4 similar, round spots grouped around the centre = sewing holes. Strongly blue/purple or pink/red objects are also buttons."],
    ["8. Final count", "Green circles are counted as coins; red circles with an X are buttons and are not counted. Annotated images and results.csv are saved."],
  ]),
  para("", { after: 120 }),
  figLabel(2), image("fig02_stages.png", CONTENT, { maxH: 250 }),
  caption(2, `The main stages for one clean photograph (${pid("12.48.26 (3)")}). The foreground map (2) already separates coins from the pad, but the fold lines are still visible. They produce many LoG peaks (5); the verification stage rejects all of them and exactly 14 coins remain (6).`),
  twoBoxes(
    ["Self-calibrating setup", ["No fixed pixel sizes or gray levels: radii scale with the image width and every threshold is relative to the coins measured in the same photo."]],
    ["Input requirements", ["Top view, a bright colourless pad, coins 5–11% of the image width, and some part of every coin visible."]],
  ),
];

// ── 03 Results ─────────────────────────────────────────────────────
const catTable = ["clean", "noisy", "damaged"].map((c) => [c[0].toUpperCase() + c.slice(1), byCat[c].n, f2(byCat[c].mae), `${byCat[c].exact}/${byCat[c].n}`, `${byCat[c].w1}/${byCat[c].n}`]);
catTable.push(["All photos", rows.length, f2(mae), `${exact}/${rows.length}`, `${within1}/${rows.length}`]);
const perPhoto = rows.map((r) => {
  const d = r.pred - r.true;
  return [r.id, r.category, r.true, r.pred, d > 0 ? `+${d}` : `${d}`, r.true_buttons ? `${r.pred_buttons}/${r.true_buttons}` : "–", r.ms.toFixed(0)];
});
perPhoto.push(["Total", "", T, P, `${E} abs.`, `${btnFound}/${btnTrue}`, `${msMean.toFixed(0)} avg`]);
const results = [
  h1("03", "Results"),
  h2("3.1 The synthetic check"),
  twoBoxes(
    ["Synthetic test", [`6 discs expected, ${stats.synthetic_detected} detected.`, "The synthetic image is processed by exactly the same code as the photographs. It confirms that background modelling, blob detection, drawing and counting work end to end."]],
    ["Why a synthetic image", ["In a synthetic image the right answer is known with certainty. Any error there would be a bug, not a hard photo."]],
  ),
  figLabel(3), image("fig03_synthetic.png", CONTENT * 0.55, { maxH: 330 }),
  caption(3, "The synthetic input and its result."),
  h2("3.2 The overall result"),
  statTiles([
    [`${f2(countAcc)}%`, "Count accuracy", `Total error of ${E} coins out of ${T}`],
    [f2(mae), "Mean abs. error", "Coins per photograph"],
    [`${exact}/${rows.length}`, "Exact photos", `${within1} of ${rows.length} within ±1 coin`],
    [`${btnFound}/${btnTrue}`, "Buttons flagged", "Excluded from the count"],
  ]),
  para("", { after: 160 }),
  label("Results by category"),
  dataTable(["Category", "Photos", "MAE", "Exact", "Within ±1"], catTable, [2800, 1600, 1800, 1900, 1980], { boldLast: true, keep: true }),
  para("", { after: 100 }),
  body(`The difference between the categories is large. On clean photographs the system is almost perfect: ${byCat.clean.exact} of ${byCat.clean.n} exact and every photo within one coin. Most errors come from the noisy and damaged sets. The system over-counted in ${over} photos and under-counted in ${under}, so missing coins is the more common failure.`),
  h2("3.3 Results by photograph"),
  body("Predicted minus true count for every photo. Positive means extra detections, negative means missed coins. Buttons are shown as flagged / present. Runtime is the time of count_coins on a 1600 × 900 image."),
  dataTable(["Photo", "Category", "True", "Predicted", "Error", "Buttons", "Runtime (ms)"], perPhoto,
    [1100, 1500, 1100, 1400, 1300, 1400, 2280], { boldLast: true,
      colourFn: (ri, i, v) => (i === 4 && ri < rows.length && v !== "0" ? (v.startsWith("+") ? "C0392B" : BLUE) : undefined) }),
  para("", { after: 100 }),
  figLabel(4), image("fig04_per_image.png", CONTENT),
  caption(4, "Counting error per photograph, coloured by category. Clean photos (green) are almost all exact; the single large over-count is the motion-blurred photo P14."),
  h2("3.4 Examples that received the exact count"),
  figLabel(5), image("fig05_exact.png", CONTENT, { maxH: 520 }),
  caption(5, `Three exact results: ${pid("12.48.26 (4)")} and ${pid("12.48.26 (1)")} (clean) and ${pid("12.48.26 (12)")} (a dark photo). Coins that touch each other are still counted separately, and the fold grid of the pad produces no false detections.`),
  h2("3.5 How each stage reduced the error"),
  body("We built the system step by step and measured it on all 26 photographs after every change. This turned out to be the most useful part of the project, because it shows which idea actually solved which problem."),
  figLabel(6), image("fig06_progress.png", CONTENT * 0.8),
  caption(6, "Mean absolute error of each development version on the same 26 photos."),
  ...bullets([
    [["Threshold + watershed (MAE 7.38). ", { bold: true }], "Our first version thresholded the foreground map and split touching blobs with a watershed. The pad folds passed the threshold, and in dark photos the threshold missed coins completely."],
    [["LoG blobs (5.81). ", { bold: true }], "Looking for blob-shaped peaks instead of thresholded regions helped in dark photos, but fold intersections also look like blobs."],
    [["+ Hessian shape test (2.54). ", { bold: true }], "The biggest single improvement. A fold is a ridge: one eigenvalue of the Hessian is large and the other near zero. A coin is round, so both are similar. Rejecting ridge-like peaks removed most false detections."],
    [["+ Hough circles (1.19). ", { bold: true }], "LoG merges coins that touch into one blob. The circle Hough transform uses the visible arc of each coin, so it separates them."],
    [["+ Button classifier (1.27). ", { bold: true }], "The final step targets buttons rather than the coin count. It made the button test more sensitive, and the coin MAE changed only slightly."],
  ]),
  h2("3.6 The pad folds"),
  body(`The folds and seams of the pad were the most common source of false detections during development. Figure 7 shows one damaged photograph (${pid("12.48.26 (21)")}): LoG finds dozens of peaks along the fold lines. The Hessian test rejected ${stats.folds_rejected} of them in this photo alone.`),
  figLabel(7), image("fig07_folds.png", CONTENT * 0.75, { maxH: 560 }),
  caption(7, "Red: LoG peaks rejected as ridge-like (fold lines). Green: the final detections. Almost all rejected peaks lie exactly on the folds."),
  h2("3.7 Buttons"),
  body(`Three photographs contain four buttons each, among the coins. ${btnFound} of the ${btnTrue} buttons were flagged (red circle with an X) and excluded from the count. In our visual check of the annotated outputs, every red mark sat on a button, so no coin was removed by mistake.`),
  figLabel(8), image("fig08_buttons.png", CONTENT, { maxH: 470 }),
  caption(8, `The three photographs with buttons (${pid("12.48.26 (18)")}, ${pid("12.48.26 (19)")}, ${pid("12.48.26 (20)")}). Blue, dark-navy and pink buttons are recognised by colour; the marbled grey button in the first photo has no telling colour and its holes were not found, so it was counted as a coin.`),
  figLabel(9), image("fig09_holes.png", CONTENT * 0.85),
  caption(9, "The black-hat transform keeps only small dark details. On a button the sewing holes light up as a symmetric group near the centre; on a coin the embossing gives no such group."),
  h2("3.8 Where the errors came from"),
  figLabel(10), image("fig10_errors.png", CONTENT, { maxH: 520 }),
  caption(10, `The three largest errors. ${pid("12.48.26 (15)")}: strong motion blur smears each coin into several blobs (22 counted, 14 real). ${pid("12.48.25")}: a dense pile where several coins are almost completely hidden (10 of 14). ${pid("12.48.26 (6)")}: coins cut by the image frame are only half-circles (8 of 11).`),
];

// ── 04 Discussion ──────────────────────────────────────────────────
const discussion = [
  h1("04", "Discussion and conclusions"),
  h2("What worked"),
  body(`On clean photographs the system is almost perfect (MAE ${f2(byCat.clean.mae)}), and this includes coins that touch each other and a pad covered with folds. It also worked on several dark photographs, because every decision is made on the foreground map rather than on raw brightness, and every threshold is relative to the coins in the same photo. Two detectors were needed: LoG is robust to blur but merges touching coins, while Hough separates touching coins but needs sharp edges.`),
  h2("What failed and why"),
  body("Motion blur caused the largest single error: a coin smeared along the direction of motion is no longer a disk, so it produces several blobs and each is counted. Dense piles caused the opposite problem: a coin that shows only a thin crescent gives neither a LoG blob nor enough arc for Hough. Coins cut by the image frame are half-disks with a weak response. Most errors are undercounts, which means the system prefers to miss a coin rather than invent one."),
  h2("What the folds taught us"),
  body("Brightness alone is not enough to decide what is an object: the folds of the pad are as different from the pad as a coin is. What separates them is shape, measured locally by the Hessian: a fold is long and thin, a coin is round. This single shape test reduced the error by more than half."),
  h2("What the buttons taught us"),
  body("Size and roundness cannot separate a button from a coin. Colour (no coin is blue or pink) and sewing holes, isolated by the black-hat transform, can. A grey button is the hard case: only its small holes reveal it, and they may not survive blur."),
  h2("Reading the measures"),
  body(`Only ${exact} of ${rows.length} photos were counted exactly, yet the count accuracy is ${f2(countAcc)}% and ${within1} photos are within one coin. The exact-photo measure is strict: a single missed coin among fourteen makes the whole photo wrong.`),
  h2("What could be improved"),
  ...bullets([
    "Estimate the direction of motion blur (e.g. from the elongation of the strongest blobs) and merge detections lying along it.",
    "Detect coins cut by the frame with partial-circle fitting near the image border.",
    "Use the colour of the coin rim in addition to holes to catch grey buttons.",
    "Mark coin positions in the ground truth so errors can be split into false positives and false negatives.",
    "A fully hidden coin cannot be counted from a single photo; a second view would be needed.",
  ]),
  h2("Final conclusion"),
  body(`The project answered its research question for the clean and moderately difficult cases. With classical tools only (a median background model, a Lab foreground map, multi-scale LoG, a Hessian shape test, grayscale morphology, a Hough transform and a black-hat hole detector), the system counted coins with ${f2(countAcc)}% count accuracy and recognised ${btnFound} of ${btnTrue} buttons, with no training data and about ${(msMean / 1000).toFixed(1)} seconds per photo. Strong blur, dense piles and coins cut by the frame remain the main limitations; for piles this is a limit of the photo itself.`),
];

// ── Appendices ─────────────────────────────────────────────────────
const appendix = [
  h1("A", "Full code"),
  body("The project has two Python files. coin_counter.py holds the whole pipeline. run.py runs it on every image in the data folder, saves the annotated images and results.csv, and prints the evaluation. All figures in this report are produced by report/make_figures.py."),
  callout("Minimal working example", ["python run.py                  # all photos in data/", "python run.py \"data/photo.jpeg\"   # a single photo"]),
  ...codeBlock("Listing 1", "coin_counter.py"),
  ...codeBlock("Listing 2", "run.py"),
  h1("B", "Original test photographs"),
  body("All 26 photographs with their ID, category and manual coin count."),
  image("figA_inputs.png", CONTENT, { maxH: 820 }),
];

// ── Document ───────────────────────────────────────────────────────
const footer = new Footer({ children: [new Paragraph({
  border: { top: { style: BorderStyle.SINGLE, size: 8, color: GREEN, space: 6 } },
  tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
  children: [
    run("Every Coin Counts", { size: 16, bold: true, color: BLUE_DARK }),
    run("   ·   [AUTHORS]", { size: 16, color: GREY }),
    new TextRun({ children: ["\tPage ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: BLUE }),
  ] })] });

const doc = new Document({
  creator: "Coin counter project", title: "Every Coin Counts — Final Project Report",
  styles: { default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 40, bold: true, color: "FFFFFF" }, paragraph: { outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 27, bold: true, color: BLUE }, paragraph: { outlineLevel: 1 } },
    ] },
  numbering: { config: [{ reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "■", alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 440, hanging: 260 } }, run: { color: GREEN, size: 16 } } }] }] },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: 15840 }, margin: { top: 1080, bottom: 1080, left: MARGIN, right: MARGIN } } },
    footers: { default: footer },
    children: [...cover, ...intro, ...methods, ...results, ...discussion, ...appendix],
  }],
});

const out = process.argv[3] || path.join(ROOT, "report", "Every_Coin_Counts_Report.docx");
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(out, buf); console.log("wrote", out); });
