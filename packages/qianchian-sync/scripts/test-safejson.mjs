// safeJsonParse 回归测试（纯离线，不发请求）
// 跑法：node scripts/test-safejson.mjs
//
// 覆盖四类边界：
//   1) 19 位 ID 必须转字符串且零失真
//   2) 浮点指标必须保持 number（不能被当成超长整数加引号 → 非法 JSON）
//   3) 字符串字面量里的长数字不能被误改
//   4) 负数 / 小整数 / 指数写法保持原样
import assert from "node:assert";
import { safeJsonParse } from "../core/client.mjs";

// ── 1. 精度：19 位整数超出 Number.MAX_SAFE_INTEGER ──
const raw = '{"material_id":7705286888558821386,"stat_cost":1234.56,"name":"a:1234567890123456","small":42,"neg":-1234567890123456789}';
const o = safeJsonParse(raw);

assert.strictEqual(o.material_id, "7705286888558821386", "19 位 ID 必须精确保留为字符串");
assert.strictEqual(typeof o.material_id, "string", "超长整数必须转成字符串");
console.log("✓ 19 位 ID 零失真:", o.material_id);

// 对照：原生 JSON.parse 会静默舍入
assert.strictEqual(JSON.parse(raw).material_id, 7705286888558821000, "原生 parse 的失真行为未变，说明测试前提成立");
console.log("✓ 对照 JSON.parse 失真:", JSON.parse(raw).material_id);

// ── 2. 浮点必须保持 number ──
assert.strictEqual(o.stat_cost, 1234.56);
assert.strictEqual(typeof o.stat_cost, "number");
console.log("✓ 浮点保持 number:", o.stat_cost);

// 17 位小数（曾因正则方案被拆成 0."5622..." 而拼出非法 JSON）
const ratio = safeJsonParse('{"ratio":0.5622720166753518}');
assert.strictEqual(typeof ratio.ratio, "number");
assert.strictEqual(ratio.ratio, 0.5622720166753518);
console.log("✓ 长小数不误伤:", ratio.ratio);

// ── 3. 字符串内数字不动 ──
assert.strictEqual(o.name, "a:1234567890123456");
console.log("✓ 字符串内数字未被改写");

// ── 4. 其它数值形态 ──
assert.strictEqual(o.small, 42);
assert.strictEqual(o.neg, "-1234567890123456789", "负超长整数同样转字符串");
assert.strictEqual(safeJsonParse('{"a":1e10}').a, 1e10, "指数写法保持 number");
console.log("✓ 负数/小整数/指数形态正常");

console.log("\n全部通过");
