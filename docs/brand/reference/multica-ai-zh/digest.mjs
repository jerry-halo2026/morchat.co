// Turns structure.json into a compact, human-readable digest for NOTES.md and
// for the rebuild mapping. Not part of the app build.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const s = JSON.parse(readFileSync(join(HERE, "structure.json"), "utf8"));
const out = [];

out.push(`title: ${s.title}`);
out.push(`lang: ${s.lang}  contentHeight: ${s.contentHeight}  docHeight: ${s.docHeight}`);
out.push(`scrollers: ${JSON.stringify(s.scrollers)}`);
out.push(`nav: ${JSON.stringify(s.nav)}`);
out.push("");

s.sections.forEach((x, i) => {
  out.push(`### S${i}  y=${x.rect.y} h=${x.rect.h} w=${x.rect.w} bg=${x.background} ${x.tag}#${x.id ?? ""}`);
  out.push(`  cls=${x.className}`);
  for (const h of x.headings) {
    out.push(`  ${h.tag} [${h.style.fontSize}/${h.style.fontWeight}/${h.style.lineHeight} ls${h.style.letterSpacing} ${h.style.color}] ${h.text}`);
  }
  for (const b of x.buttons) {
    out.push(`  btn "${b.text}" -> ${b.href} [bg${b.style.backgroundColor} r${b.style.borderRadius} bd${b.style.borderColor} fs${b.style.fontSize} pad${b.style.padding}] ${b.rect.w}x${b.rect.h}`);
  }
  for (const c of x.cards.slice(0, 16)) {
    out.push(`  card ${c.rect.w}x${c.rect.h} [bg${c.style.backgroundColor} r${c.style.borderRadius} bd${c.style.borderColor}] T="${c.title}" D="${c.description.slice(0, 200)}"`);
  }
  for (const m of x.images.slice(0, 12)) {
    out.push(`  img ${m.tag} ${m.rect.w}x${m.rect.h} r${m.style.borderRadius} src=${(m.src ?? "").slice(0, 90)}`);
  }
  out.push(`  text: ${x.textSample.slice(0, 500)}`);
  out.push("");
});

out.push("## rhythm (gap between sections)");
out.push(JSON.stringify(s.rhythm));
out.push("");
out.push("## docHeadings");
for (const h of s.docHeadings) out.push(`${h.tag} @${h.y}  ${h.text}`);
out.push("");
out.push("## layout");
out.push(`topFonts: ${JSON.stringify(s.layout.topFonts, null, 1)}`);
out.push(`topRadii: ${JSON.stringify(s.layout.topRadii)}`);
out.push(`topColors: ${JSON.stringify(s.layout.topColors, null, 1)}`);
out.push(`topBorders: ${JSON.stringify(s.layout.topBorders)}`);
out.push("");
out.push("### widest");
for (const w of s.layout.widest) out.push(`${w.width} max=${w.maxWidth} ${w.className}`);
out.push("");
out.push("### grids");
for (const g of s.layout.grids) out.push(`${g.width} cols=${g.gridTemplateColumns} colGap=${g.columnGap} rowGap=${g.rowGap} n=${g.childCount} | ${g.className}`);

writeFileSync(join(HERE, "_digest.txt"), out.join("\n"), "utf8");
console.log(`digest lines: ${out.length}`);
