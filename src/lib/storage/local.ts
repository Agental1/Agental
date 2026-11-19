import { promises as fs } from "node:fs";
import path from "node:path";
import type { Storage, StoredObject } from "./index";

const ROOT = path.join(process.cwd(), ".uploads");
const META = ".mime"; // sidecar file storing the mime type

/** Dev-only disk storage under <appRoot>/.uploads (gitignored). */
export class LocalStorage implements Storage {
  private full(key: string) {
    // Prevent path traversal.
    const safe = key.replace(/\.\.(\/|\\)/g, "");
    return path.join(ROOT, safe);
  }

  async put(key: string, bytes: Buffer, mime: string): Promise<StoredObject> {
    const file = this.full(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
    await fs.writeFile(file + META, mime, "utf8");
    return { key, size: bytes.length, mime };
  }

  async get(key: string): Promise<{ bytes: Buffer; mime: string } | null> {
    const file = this.full(key);
    try {
      const bytes = await fs.readFile(file);
      const mime = await fs
        .readFile(file + META, "utf8")
        .catch(() => "application/octet-stream");
      return { bytes, mime };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const file = this.full(key);
    await fs.rm(file, { force: true });
    await fs.rm(file + META, { force: true });
  }

  async head(key: string): Promise<{ size: number; mime: string } | null> {
    const file = this.full(key);
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) return null;
      const mime = await fs
        .readFile(file + META, "utf8")
        .catch(() => "application/octet-stream");
      return { size: stat.size, mime };
    } catch {
      return null;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const dir = this.full(prefix);
    let names: string[];
    try {
      names = await fs.readdir(dir, { recursive: true });
    } catch {
      return [];
    }
    const keys: string[] = [];
    for (const name of names) {
      if (name.endsWith(META)) continue;
      const stat = await fs.stat(path.join(dir, name)).catch(() => null);
      if (stat?.isFile()) {
        keys.push(path.posix.join(prefix, name.split(path.sep).join("/")));
      }
    }
    return keys;
  }
}
