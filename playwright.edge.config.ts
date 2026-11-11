// Local-only Playwright config: run the same suite against the installed Edge.
//
// The bundled Chromium download stalls on this network, and the suite does not
// depend on a specific engine. CI keeps using the default config; this file is
// only for running the suite on a machine that already has a browser.
import base from "./playwright.config";

export default {
  ...base,
  projects: [{ name: "msedge", use: { ...base.projects?.[0]?.use, browserName: "chromium", channel: "msedge" } }],
};
