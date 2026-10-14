/**
 * Copy the browser app into public/ for Vercel.
 * The local Node server is not the hosted entrypoint.
 */
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "index.html"), join(out, "index.html"));
cpSync(join(root, "css"), join(out, "css"), { recursive: true });
cpSync(join(root, "js"), join(out, "js"), { recursive: true });

function copyJsonFiles(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const source = join(from, name);
    if (!statSync(source).isFile() || !name.endsWith(".json")) continue;
    cpSync(source, join(to, name));
  }
}

copyJsonFiles(join(root, "experiments"), join(out, "experiments"));
copyJsonFiles(join(root, "experiments", "fashion-mnist"), join(out, "experiments", "fashion-mnist"));
console.log(`Staged static site in ${out}`);
