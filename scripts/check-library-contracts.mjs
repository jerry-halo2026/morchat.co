#!/usr/bin/env node
// Validates the library contracts: every domain manifest against the meta-schema,
// every fixture against its own domain schema, and every enum binding against the
// tag set it claims to mirror.
//
//   node scripts/check-library-contracts.mjs
//
// The point of the check is that a domain is *data*: the platform never learns a
// field or a tag name, so a new department must be addable without code. The
// second domain (legal) exists only to keep the video one from silently becoming
// the platform's assumption.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "contracts", "library");
const DOMAINS = join(ROOT, "domains");
const FIXTURES = join(ROOT, "fixtures");

const ajv = new Ajv({ allErrors: true, strict: false, jsonPointers: true });
const problems = [];
const fail = (message) => problems.push(message);

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function listFiles(dir) {
  if (!statSync(FIXTURES, { throwIfNoEntry: false })) return [];
  try {
    return readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

/** Resolve a JSON Pointer (`/a/b/0`) inside a parsed document. */
function resolvePointer(document, pointer) {
  return pointer
    .split("/")
    .slice(1)
    .reduce((node, raw) => {
      if (node == null) return undefined;
      const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
      return node[key];
    }, document);
}

const manifestSchema = readJson(join(ROOT, "manifest.schema.json"));
const validateManifest = ajv.compile(manifestSchema);

let domains = 0;
let fixtures = 0;

for (const domain of readdirSync(DOMAINS).sort()) {
  const domainDir = join(DOMAINS, domain);
  if (!statSync(domainDir).isDirectory()) continue;

  for (const file of readdirSync(domainDir).filter((name) => name.endsWith(".json")).sort()) {
    domains += 1;
    const path = join(domainDir, file);
    const manifest = readJson(path);
    const where = relative(ROOT, path);

    if (!validateManifest(manifest)) {
      for (const error of validateManifest.errors ?? []) fail(`${where}: ${error.dataPath || "/"} ${error.message}`);
      continue;
    }
    const expected = `${manifest.schema_key}.v${manifest.version}.json`;
    if (file !== expected) fail(`${where}: file name should be ${expected}`);

    // Tags: unique keys, unique values inside a set.
    const tagSets = new Map();
    for (const set of manifest.tag_sets) {
      if (tagSets.has(set.key)) fail(`${where}: duplicate tag set "${set.key}"`);
      tagSets.set(set.key, set);
      const seen = new Set();
      for (const entry of set.values) {
        if (seen.has(entry.value)) fail(`${where}: duplicate value "${entry.value}" in "${set.key}"`);
        seen.add(entry.value);
      }
    }

    // Every enum binding must point at an enum that matches its tag set exactly:
    // a value that exists on one side only is how tag drift starts.
    for (const binding of manifest.enum_bindings) {
      const set = tagSets.get(binding.tag_set);
      if (!set) {
        fail(`${where}: binding references unknown tag set "${binding.tag_set}"`);
        continue;
      }
      const enumValues = resolvePointer(manifest.json_schema, binding.path);
      if (!Array.isArray(enumValues)) {
        fail(`${where}: ${binding.path} is not an enum array`);
        continue;
      }
      const expectedValues = set.values.map((entry) => entry.value).sort();
      const actual = [...enumValues].sort();
      if (JSON.stringify(actual) !== JSON.stringify(expectedValues)) {
        fail(
          `${where}: ${binding.path} does not match tag set "${binding.tag_set}" (schema=${actual.join(",")} tags=${expectedValues.join(",")})`,
        );
      }
    }

    // Summary and search paths are JSON Pointers into the *artifact*, so the only
    // structural guarantee to check here is that their first segment is a declared
    // property. Wildcards (`/shots/*/text`) are for the projection layer later.
    for (const pointer of [manifest.summary_path, ...(manifest.searchable_paths ?? [])]) {
      const head = pointer.split("/")[1];
      const properties = manifest.json_schema.properties ?? {};
      if (!head || !(head in properties)) {
        fail(`${where}: ${pointer} does not start at a declared property`);
      }
    }

    const validateArtifact = ajv.compile(manifest.json_schema);
    for (const fixture of listFiles(join(FIXTURES, domain))) {
      fixtures += 1;
      const fixturePath = join(FIXTURES, domain, fixture);
      const data = readJson(fixturePath);
      const ok = validateArtifact(data);
      const expectValid = fixture.includes(".valid.");
      const expectInvalid = fixture.includes(".invalid.");
      if (!expectValid && !expectInvalid) {
        fail(`${relative(ROOT, fixturePath)}: name must contain .valid. or .invalid.`);
        continue;
      }
      if (expectValid && !ok) {
        const first = validateArtifact.errors?.[0];
        fail(`${relative(ROOT, fixturePath)}: expected valid, got ${first?.dataPath || "/"} ${first?.message}`);
      }
      if (expectInvalid && ok) {
        fail(`${relative(ROOT, fixturePath)}: expected the domain schema to reject this fixture`);
      }
    }
  }
}

console.log(`library contracts: ${domains} manifest(s), ${fixtures} fixture(s)`);
if (problems.length > 0) {
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log("OK: manifests, tag bindings and fixtures agree");
