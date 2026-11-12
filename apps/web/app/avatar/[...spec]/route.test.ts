// @vitest-environment node
import { describe, expect, it } from "vitest";
import { encodeAoraSpec, deriveAoraSpec } from "@morechat/core/avatar/aora-spec";
import { GET } from "./route";

const ENTITY_ID = "66b31d32-da58-47a5-a2d5-cb09ebfb4783";

function request(path: string, query = ""): Request {
  return new Request(`http://localhost/avatar/${path}${query}`);
}

function call(spec: string[], query = ""): Promise<Response> {
  return GET(request(spec.join("/"), query), { params: Promise.resolve({ spec }) });
}

describe("GET /avatar/[...spec]", () => {
  it("renders a derived spec that names a cast character", async () => {
    const spec = deriveAoraSpec(ENTITY_ID);
    expect(spec.character).not.toBe("");

    const response = await call([ENTITY_ID]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");

    const svg = await response.text();
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.length).toBeGreaterThan(500);
  });

  it("draws the stored spec exactly as the id derives it", async () => {
    const encoded = encodeAoraSpec(deriveAoraSpec(ENTITY_ID));
    const derived = await (await call([ENTITY_ID])).text();
    const stored = await (await call([encoded])).text();
    expect(stored).toBe(derived);
  });

  it("keeps drawing specs written before derivation named a character", async () => {
    const legacy = await call(["aora::blob:cyan:capsule:vector:f3b0"]);
    expect(legacy.status).toBe(200);
    expect((await legacy.text()).startsWith("<svg")).toBe(true);
  });

  it("draws an unknown character name from its shape instead of failing", async () => {
    const unknown = await call(["aora:notacast:blob:cyan:capsule:vector:f3b0"]);
    expect(unknown.status).toBe(200);
    expect((await unknown.text()).startsWith("<svg")).toBe(true);
  });

  it("falls back to the derived face for a value the engine cannot draw", async () => {
    const response = await call(["aora:dot:circle:notacolor:capsule:vector:1a2b"], "?size=64");
    expect(response.status).toBe(200);
    const svg = await response.text();
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toContain("NaN");
  });
});
