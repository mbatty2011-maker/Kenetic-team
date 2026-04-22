import fs from "fs/promises";
import path from "path";

const PROJECT_ROOT = process.cwd();

export async function writeFile(filePath: string, content: string): Promise<string> {
  // Resolve against project root and reject any path that escapes it
  const resolved = path.resolve(PROJECT_ROOT, filePath);
  if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
    throw new Error(`Path '${filePath}' is outside the project directory`);
  }

  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, "utf-8");
  return resolved;
}
