import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ICNS_ENTRIES,
  icnsDimensions,
  packIcns,
  readIcns,
  writeIcns,
} from "./icns.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ICON = join(repo, "apps/desktop/build/icon.icns");

/** PNG magic plus an IHDR carrying the size: enough for every check here. */
function png(width, height) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

test("packs entries into the documented container layout", () => {
  const entries = [
    { type: "ic07", data: png(128, 128) },
    { type: "ic08", data: png(256, 256) },
  ];
  const packed = packIcns(entries);
  const body = 8 + (8 + 33) * 2;
  assert.equal(packed.subarray(0, 4).toString("ascii"), "icns");
  assert.equal(packed.readUInt32BE(4), body);
  assert.equal(packed.length, body);
  // First entry header sits right after the container header.
  assert.equal(packed.subarray(8, 12).toString("ascii"), "ic07");
  assert.equal(packed.readUInt32BE(12), 8 + 33);
});

test("round-trips through readIcns", () => {
  const entries = ICNS_ENTRIES.map(([type, size]) => ({ type, data: png(size, size) }));
  const parsed = readIcns(packIcns(entries));
  assert.deepEqual(parsed.map((entry) => entry.type), entries.map((entry) => entry.type));
  parsed.forEach((entry, index) => {
    assert.deepEqual(entry.data, entries[index].data);
    assert.deepEqual(icnsDimensions(entry.data), { width: entries[index].data.readUInt32BE(16), height: entries[index].data.readUInt32BE(20) });
  });
});

test("rejects a truncated or mislabelled file", () => {
  assert.throws(() => readIcns(Buffer.from("not an icns")), /not an ICNS/);
  const packed = packIcns([{ type: "ic07", data: png(128, 128) }]);
  assert.throws(() => readIcns(packed.subarray(0, packed.length - 1)), /declares .* bytes/);
  assert.throws(() => packIcns([{ type: "toolong", data: png(16, 16) }]), /four characters/);
});

test("writes one entry per iconset render, and refuses a size mismatch", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "icns-write-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(dir, { recursive: true });
  for (const [, size, file] of ICNS_ENTRIES) writeFileSync(join(dir, file), png(size, size));

  const out = join(dir, "icon.icns");
  writeIcns(dir, out);
  const parsed = readIcns(readFileSync(out));
  assert.deepEqual(parsed.map((entry) => entry.type), ICNS_ENTRIES.map(([type]) => type));
  parsed.forEach((entry, index) => {
    assert.equal(icnsDimensions(entry.data).width, ICNS_ENTRIES[index][1]);
  });

  writeFileSync(join(dir, ICNS_ENTRIES[0][2]), png(64, 64));
  assert.throws(() => writeIcns(dir, out), /expected 128x128/);
});

test("the committed icon.icns carries the full tag set as PNG", () => {
  const entries = readIcns(readFileSync(ICON));
  assert.deepEqual(entries.map((entry) => entry.type), ICNS_ENTRIES.map(([type]) => type));
  entries.forEach((entry, index) => {
    const expected = ICNS_ENTRIES[index][1];
    assert.deepEqual(icnsDimensions(entry.data), { width: expected, height: expected });
  });
});
