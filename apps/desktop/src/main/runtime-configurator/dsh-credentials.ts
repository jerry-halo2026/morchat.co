/**
 * The harness credential store.
 *
 * The harness never reads a provider key from its own process environment: a
 * provider's `apiKeyEnv` is a *credential reference*, resolved against
 * `$DSH_HOME/.credentials.yaml`, whose `refs:` block maps a name to the secret.
 * That is why handing the daemon `DEEPSEEK_API_KEY=…` had no effect on model
 * calls while the file still held an old key.
 *
 * This module writes exactly one entry and leaves every other line alone,
 * including the account grants the user signed in with. The value never leaves
 * this process through a log line, and the file is written owner-only.
 */

const REFS_HEADER = "refs:";

/** True when the value needs quoting to survive a YAML round trip. */
function needsQuoting(value: string): boolean {
  return !/^[A-Za-z0-9._~+/=:@-]+$/.test(value);
}

function encodeValue(value: string): string {
  return needsQuoting(value) ? JSON.stringify(value) : value;
}

/**
 * Sets `refs.<name>` in a credentials file's text, creating the block when the
 * file is new and replacing the value when the name is already there.
 *
 * Pure: the caller decides whether to write. Comments and unrelated entries are
 * preserved byte for byte, which matters because this file also holds the grant
 * the user signed in with.
 */
export function upsertCredentialRef(text: string, name: string, value: string): string {
  const lines = text.length > 0 ? text.split(/\r?\n/) : ["version: 1", "records:"];
  // A trailing empty line from split() would otherwise become a blank line in the
  // middle of the block once we append.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const refsIndex = lines.findIndex((line) => line.trimEnd() === REFS_HEADER);
  const entry = `  ${name}: ${encodeValue(value)}`;

  if (refsIndex === -1) {
    return [...lines, REFS_HEADER, entry].join("\n") + "\n";
  }

  // The block ends at the next line that is not indented under `refs:`.
  let blockEnd = lines.length;
  for (let i = refsIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length > 0 && !line.startsWith(" ")) {
      blockEnd = i;
      break;
    }
  }

  const existing = lines.findIndex(
    (line, index) =>
      index > refsIndex && index < blockEnd && line.trimStart().startsWith(`${name}:`),
  );

  if (existing !== -1) {
    lines[existing] = entry;
    return lines.join("\n") + "\n";
  }

  lines.splice(blockEnd, 0, entry);
  return lines.join("\n") + "\n";
}

/** Removes `refs.<name>`; other refs and every record stay untouched. */
export function removeCredentialRef(text: string, name: string): string {
  const lines = text.split(/\r?\n/);
  const refsIndex = lines.findIndex((line) => line.trimEnd() === REFS_HEADER);
  if (refsIndex === -1) return text;

  let blockEnd = lines.length;
  for (let i = refsIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length > 0 && !line.startsWith(" ")) {
      blockEnd = i;
      break;
    }
  }

  const kept = lines.filter(
    (line, index) =>
      !(
        index > refsIndex &&
        index < blockEnd &&
        line.trimStart().startsWith(`${name}:`)
      ),
  );
  return kept.join("\n");
}
