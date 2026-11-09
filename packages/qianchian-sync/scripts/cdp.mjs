// 极简 CDP 客户端：借用已开 --remote-debugging-port 的 Chrome 读页面内容
// 用法：
//   node scripts/cdp.mjs text                 打印当前页正文
//   node scripts/cdp.mjs html                 打印当前页 HTML（截断 200k）
//   node scripts/cdp.mjs goto <url>           导航并等 domContentLoaded
//   node scripts/cdp.mjs eval "<js>"          在页面上下文求值（返回 await 结果）
//   node scripts/cdp.mjs links                打印所有链接 [文本, href]
// 环境变量 CDP_PORT 默认 9222

const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;

async function pickTarget() {
  const list = await (await fetch(`${BASE}/json/list`)).json();
  const pages = list.filter((t) => t.type === "page" && !t.url.startsWith("chrome://"));
  if (!pages.length) throw new Error("没有可用的 page target，请先在 Chrome 里打开目标页面");
  return pages[0];
}

async function connect() {
  const t = await pickTarget();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = (e) => rej(new Error("ws 连接失败: " + (e?.message || "unknown")));
  });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method) {
      events.push(m);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  return { ws, send, events, target: t };
}

const [, , cmd, ...rest] = process.argv;
const { ws, send, events } = await connect();

try {
  await send("Page.enable");
  await send("Runtime.enable");

  if (cmd === "text") {
    const r = await send("Runtime.evaluate", {
      expression: "document.body.innerText",
      returnByValue: true,
      awaitPromise: true,
    });
    console.log(r.result?.value ?? "");
  } else if (cmd === "html") {
    const r = await send("Runtime.evaluate", {
      expression: "document.documentElement.outerHTML",
      returnByValue: true,
    });
    console.log(String(r.result?.value ?? "").slice(0, 200000));
  } else if (cmd === "goto") {
    const url = rest[0];
    await send("Page.navigate", { url });
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      await new Promise((r) => setTimeout(r, 500));
      if (events.some((e) => e.method === "Page.loadEventFired")) break;
    }
    await new Promise((r) => setTimeout(r, 1500)); // SPA 首屏渲染
    const r = await send("Runtime.evaluate", {
      expression: "document.title + '\\n' + location.href",
      returnByValue: true,
    });
    console.log(r.result?.value ?? "");
  } else if (cmd === "links") {
    const r = await send("Runtime.evaluate", {
      expression: `JSON.stringify([...document.querySelectorAll('a[href]')].map(a=>[a.innerText.trim().slice(0,40), a.getAttribute('href')]).filter(x=>x[0]))`,
      returnByValue: true,
    });
    for (const [txt, href] of JSON.parse(r.result?.value || "[]")) console.log(`${txt}\t${href}`);
  } else if (cmd === "eval") {
    const r = await send("Runtime.evaluate", {
      expression: rest.join(" "),
      returnByValue: true,
      awaitPromise: true,
      timeout: 30000,
    });
    const v = r.result?.value;
    console.log(typeof v === "string" ? v : JSON.stringify(v, null, 1));
  } else {
    console.error("未知命令:", cmd);
  }
} finally {
  ws.close();
}
