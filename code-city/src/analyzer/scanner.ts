import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { compareCodepoints } from "../util/compare.ts";

const execFileAsync = promisify(execFile);

const LANGUAGES: Readonly<Record<string, string>> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
};

export interface ScannedFile {
  absolutePath: string;
  path: string;
  language: string;
}

export function languageForPath(path: string): string {
  return LANGUAGES[extname(path).toLowerCase()] ?? "unknown";
}

function isSourceFile(path: string): boolean {
  return Object.hasOwn(LANGUAGES, extname(path).toLowerCase());
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

async function gitFiles(repoPath: string): Promise<string[] | undefined> {
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repoPath });
    const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
      cwd: repoPath,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout.split("\0").filter(Boolean);
  } catch {
    return undefined;
  }
}

async function walk(root: string, directory: string, result: string[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => compareCodepoints(a.name, b.name));
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(root, absolutePath, result);
    } else if (entry.isFile()) {
      result.push(toPosix(relative(root, absolutePath)));
    }
  }
}

export async function scanSourceFiles(repoPath: string): Promise<ScannedFile[]> {
  const root = resolve(repoPath);
  const trackedPaths = await gitFiles(root);
  const paths = trackedPaths ?? [];
  if (trackedPaths === undefined) await walk(root, root, paths);

  return paths
    .map(toPosix)
    .filter(isSourceFile)
    .sort(compareCodepoints)
    .map((path) => ({ absolutePath: join(root, ...path.split("/")), path, language: languageForPath(path) }));
}
