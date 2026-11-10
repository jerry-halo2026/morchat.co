import { readFileSync } from "node:fs";
function pl(l){const c=[];let cur="",q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(q){if(ch==='"'&&l[i+1]==='"'){cur+='"';i++;}else if(ch==='"')q=false;else cur+=ch;}else if(ch==='"')q=true;else if(ch===','){c.push(cur);cur="";}else cur+=ch;}c.push(cur);return c;}
function load(f){const L=readFileSync("data/flat/"+f,"utf8").split("\n").filter(Boolean);const h=pl(L[0]);return L.slice(1).map(l=>{const c=pl(l);const o={};h.forEach((k,i)=>o[k]=c[i]);return o;});}
const fl=load("material_flag.csv"), uv=load("uni_video.csv");
const orig=new Set(fl.filter(r=>r.is_original==="1").map(r=>r.account_id+":"+r.material_id));
const agg=new Map();
for(const r of uv){
  if(!r.dim_id||r.dim_id==="null"||r.dim_id==="-")continue;
  const k=r.account_id+":"+r.dim_id;
  let a=agg.get(k);if(!a){a={cost:0,gmv:0};agg.set(k,a);}
  a.cost+=Number(r.stat_cost_for_roi2)||0;
  a.gmv+=Number(r.stat_cost_for_roi2)||0>0?Number(r.total_order_settle_amount_for_roi2_1h)||0:0;
}
let o={n:0,cost:0,gmv:0}, n={n:0,cost:0,gmv:0};
for(const [k,a] of agg){
  const t=orig.has(k)?o:n;
  t.n++;t.cost+=a.cost;t.gmv+=a.gmv;
}
console.log("=== 首发素材 vs 普通素材（180 天累计）===");
for(const [label,t] of [["首发素材",o],["其他素材",n]]){
  console.log(label, "| 素材", String(t.n).padStart(5),
    "| 消耗", (t.cost/1e4).toFixed(1).padStart(7)+" 万",
    "| 成交", (t.gmv/1e4).toFixed(1).padStart(7)+" 万",
    "| ROI", (t.cost>0?t.gmv/t.cost:0).toFixed(2),
    "| 单素材均耗", (t.cost/t.n).toFixed(0), "元");
}
const allCost=o.cost+n.cost;
console.log("\n首发素材占比: 数量", (o.n/(o.n+n.n)*100).toFixed(1)+"%", "| 消耗", (o.cost/allCost*100).toFixed(1)+"%");
