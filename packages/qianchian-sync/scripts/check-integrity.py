import json, glob, os, collections, sys

BASE = "data/raw"
SRC = ["accounts", "anchors", "plans", "uni_image", "uni_video", "uni_live", "balance", "violations"]

def load(f):
    try:
        return json.load(open(f, encoding="utf-8"))
    except Exception:
        return None

def rows_of(d):
    dd = (d or {}).get("data") or {}
    for k in ["rows", "list", "ad_list", "adv_id_list", "authorization_infos", "adv_score_event"]:
        v = dd.get(k)
        if isinstance(v, list) and v:
            # 只认对象数组
            if isinstance(v[0], dict):
                return v
    return []

print("=" * 96)
print("1. 各源文件覆盖 / 截断 / 空返回 / 错误")
print("=" * 96)
print(f"{'源':14s} {'文件':>5s} {'有数据':>6s} {'空返回':>6s} {'截断':>5s} {'错误':>5s} {'总行数':>9s}")
detail = {}
for s in SRC:
    files = glob.glob(f"{BASE}/{s}/*.json")
    ok = empty = trunc = err = 0
    total_rows = 0
    tr_list = []
    err_list = []
    for f in files:
        d = load(f)
        if d is None:
            err += 1
            err_list.append(os.path.basename(f))
            continue
        if d.get("code") not in (0, None):
            err += 1
            err_list.append(f"{os.path.basename(f)} code={d.get('code')}")
            continue
        r = rows_of(d)
        dd = d.get("data") or {}
        total_rows += len(r)
        if not r:
            empty += 1
        else:
            ok += 1
        if dd.get("truncated"):
            trunc += 1
            tr_list.append((os.path.basename(f), len(r), dd.get("pagesFetched"), dd.get("totalPage")))
    print(f"{s:14s} {len(files):5d} {ok:6d} {empty:6d} {trunc:5d} {err:5d} {total_rows:9d}")
    detail[s] = dict(files=len(files), ok=ok, empty=empty, trunc=trunc, err=err, rows=total_rows,
                     tr=tr_list, errs=err_list)

print()
print("=" * 96)
print("2. 被截断的文件（数据不全）")
print("=" * 96)
any_tr = False
for s in SRC:
    for t in detail[s]["tr"]:
        any_tr = True
        print(f"  [{s}] {t[0]}  rows={t[1]}  pages={t[2]}/{t[3]}")
if not any_tr:
    print("  无")

print()
print("=" * 96)
print("3. 错误文件")
print("=" * 96)
any_err = False
for s in SRC:
    for e in detail[s]["errs"][:8]:
        any_err = True
        print(f"  [{s}] {e}")
    n = len(detail[s]["errs"])
    if n > 8:
        print(f"  [{s}] ... 另有 {n-8} 个")
if not any_err:
    print("  无")

print()
print("=" * 96)
print("4. 账户覆盖：45 个账户在各源的落盘情况")
print("=" * 96)
acc_d = load(f"{BASE}/accounts/accounts-p1.json")
accs = []
if acc_d:
    dd = acc_d.get("data") or {}
    al = dd.get("adv_id_list") or dd.get("list") or []
    accs = [str(x.get("adv_id")) if isinstance(x, dict) else str(x) for x in al]
print(f"accounts 接口返回账户数: {len(accs)}")

def accs_in(src):
    got = set()
    # balance 是批量接口（balance-batch-N.json），文件名里没有账户 ID，
    # 只能从返回行里读 account_id；否则会误报"覆盖 0/45"。
    if src == "balance":
        for f in glob.glob(f"{BASE}/{src}/*.json"):
            d = load(f)
            if not d:
                continue
            for r in rows_of(d):
                if isinstance(r, dict) and r.get("account_id") is not None:
                    got.add(str(r["account_id"]))
        return got
    for f in glob.glob(f"{BASE}/{src}/*.json"):
        b = os.path.basename(f).replace(f"{src}-", "").replace(".json", "")
        # plans 文件名: plans-<acc>-<TYPE>.json
        parts = b.split("-")
        for p in parts:
            if p.isdigit() and len(p) >= 15:
                got.add(p)
                break
    return got

for s in ["uni_image", "uni_video", "uni_live", "plans", "anchors", "balance", "violations"]:
    got = accs_in(s)
    miss = [a for a in accs if a not in got]
    print(f"  {s:12s} 覆盖 {len(got):2d}/45  缺 {len(miss):2d} {miss if miss else ''}")

print()
print("=" * 96)
print("5. plans 计划类型覆盖")
print("=" * 96)
types = collections.Counter()
for f in glob.glob(f"{BASE}/plans/*.json"):
    b = os.path.basename(f).replace("plans-", "").replace(".json", "")
    t = b.split("-")[-1]
    types[t] += 1
for t, n in types.most_common():
    print(f"  {t:26s} {n:4d} 个文件")
