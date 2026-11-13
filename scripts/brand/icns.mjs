// Packs an `.iconset` directory into an `.icns`.
//
// An ICNS file is a nested length-prefixed container: "icns" + total length, then
// one entry per image, each carrying a four-character type tag and its own length.
// Every entry written here is a PNG, so the format needs no encoder — which is why
// a macOS-only `iconutil` is not required to rebuild the app icon.
//
// The tag set and its order match what `iconutil` produced for this repository, so
// rebuilding on another platform yields a comparable file.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * `[tag, pixel size, .iconset file]`, in file order.
 *
 * A macOS iconset names each render by its logical size and scale; ICNS tags the
 * same pixels by their own size. `ic10` is the 1024px render, which is why it maps
 * to `512x512@2x` rather than to a 1024 row.
 */
export const ICNS_ENTRIES = [
  ["ic07", 128, "icon_128x128.png"],
  ["ic08", 256, "icon_256x256.png"],
  ["ic09", 512, "icon_512x512.png"],
  ["ic10", 1024, "icon_512x512@2x.png"],
  ["ic11", 32, "icon_16x16@2x.png"],
  ["ic12", 64, "icon_32x32@2x.png"],
  ["ic13", 256, "icon_128x128@2x.png"],
  ["ic14", 512, "icon_256x256@2x.png"],
];

/** Width and height from a PNG's IHDR chunk. */
export function icnsDimensions(png) {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error("ICNS entries must be PNG images");
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Pack `[{type, data}]` into one ICNS buffer. */
export function packIcns(entries) {
  const chunks = entries.map(({ type, data }) => {
    const tag = Buffer.from(type, "ascii");
    if (tag.length !== 4) throw new Error(`ICNS tags are four characters: ${type}`);
    const header = Buffer.alloc(8);
    tag.copy(header, 0);
    header.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([header, data]);
  });
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

/** Split an ICNS buffer back into its entries; throws on a malformed file. */
export function readIcns(buffer) {
  if (buffer.length < 8 || buffer.subarray(0, 4).toString("ascii") !== "icns") {
    throw new Error("not an ICNS file");
  }
  const declared = buffer.readUInt32BE(4);
  if (declared !== buffer.length) {
    throw new Error(`ICNS declares ${declared} bytes but the file is ${buffer.length}`);
  }
  const entries = [];
  let offset = 8;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) throw new Error("truncated ICNS entry header");
    const type = buffer.subarray(offset, offset + 4).toString("ascii");
    const length = buffer.readUInt32BE(offset + 4);
    if (length < 8 || offset + length > buffer.length) {
      throw new Error(`ICNS entry ${type} has an invalid length`);
    }
    entries.push({ type, data: buffer.subarray(offset + 8, offset + length) });
    offset += length;
  }
  return entries;
}

/** Write `outFile` from the renders in `iconsetDir`; returns the entries written. */
export function writeIcns(iconsetDir, outFile) {
  const entries = ICNS_ENTRIES.map(([type, size, file]) => {
    const data = readFileSync(join(iconsetDir, file));
    const { width, height } = icnsDimensions(data);
    if (width !== size || height !== size) {
      throw new Error(`${file} is ${width}x${height}, expected ${size}x${size}`);
    }
    return { type, data };
  });
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, packIcns(entries));
  return entries;
}
