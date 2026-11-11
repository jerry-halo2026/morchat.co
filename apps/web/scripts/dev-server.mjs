// Starts the Next dev server without shell expansion.
//
// The previous script was `sh -c 'next dev --port "${FRONTEND_PORT:-3000}"'`,
// which needs a POSIX shell on PATH - unavailable in a plain Windows shell, and
// the whole point of the entry-point work is that `pnpm dev:web` works there.
import { spawn } from "node:child_process";
import { join } from "node:path";

const port = process.env.FRONTEND_PORT || "3000";
const child = spawn(process.execPath, [join("node_modules", "next", "dist", "bin", "next"), "dev", "-p", port], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
