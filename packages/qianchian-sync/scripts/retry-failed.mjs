// 补拉失败的调用（只跑 state.issues 里记录的，不重拉已成功的）
// 用法：node scripts/retry-failed.mjs --source=material_meta
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../core/env.mjs";
import { callOEPaged } from "../core/client.mjs";

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const source = arg("source", "material_meta");
const day = arg("date", new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10));

const statePath = join(PKG, "data", "state", `sync-${day}.json`);
if (!existsSync(statePath)) { console.error("找不到 state:", statePath); process.exit(1); }
const state = JSON.parse(readFileSync(statePath, "utf8"));
const bad = (state.issues || []).filter((x) => x.source === source);
console.log(`${source} 待补拉 ${bad.length} 个`);

// 依据 name 推断 URL（目前只覆盖 material_meta）
const URLS = {
  material_video: "https://open.oceanengine.com/open_api/v1.0/qianchuan/video/get/",
  material_image: "https://open.oceanengine.com/open_api/v1.0/qianchuan/image/get/",
  material_carousel: "https://open.oceanengine.com/open_api/v1.0/qianchuan/carousel/get/",
};

const outDir = join(PKG, "data", "raw", source);
const verDir = join(outDir, "versions");
mkdirSync(verDir, { recursive: true });

let ok = 0, fail = 0;
for (const b of bad) {
  const m = b.name.match(/^material_(video|image|carousel)-(\d+)$/);
  if (!m) { console.log("  跳过（不认识的调用名）:", b.name); continue; }
  const [, tag, adv] = m;
  const url = URLS[`material_${tag}`];
  const r = await callOEPaged(url, { advertiser_id: Number(adv), page: 1, page_size: 100 }, {});
  if (r.body.code === 0 && r.rows.length) {
    const body = { code: 0, message: "OK", data: { rows: r.rows, pagesFetched: r.pagesFetched, totalPage: r.totalPage, truncated: !!r.truncated, partial: !!r.partial } };
    writeFileSync(join(outDir, `${b.name}.json`), JSON.stringify(body, null, 1), "utf8");
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
    writeFileSync(join(verDir, `${b.name}--${ts}..json`), JSON.stringify(body, null, 1), "utf8");
    console.log(`  ✓ ${b.name} → ${r.rows.length} 行 (${r.pagesFetched}页${r.partial ? ", 部分" : ""})`);
    ok++;
  } else {
    console.log(`  ✗ ${b.name} → code=${r.body.code} ${String(r.body.message || "").slice(0, 60)}`);
    fail++;
  }
}
console.log(`\n补拉完成: OK ${ok} / FAIL ${fail}`);
