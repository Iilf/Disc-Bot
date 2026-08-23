import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
export const CONTENT_DIR = path.join(ROOT, 'data', 'content');
export const RUNTIME_DIR = path.join(ROOT, 'data', 'runtime');

const writeQueues = new Map<string, Promise<unknown>>();

async function enqueue<T>(file: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(file) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  writeQueues.set(
    file,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readTextFile(filePath: string, fallback = ''): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeTextFileUnlocked(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, filePath);
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await enqueue(filePath, () => writeTextFileUnlocked(filePath, content));
}

export async function appendTextFile(filePath: string, line: string): Promise<void> {
  await enqueue(filePath, async () => {
    await ensureDir(path.dirname(filePath));
    await fs.appendFile(filePath, line.endsWith('\n') ? line : `${line}\n`, 'utf8');
  });
}

export function parseList(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export class TxtList {
  constructor(private readonly filePath: string) {}

  async all(): Promise<string[]> {
    return parseList(await readTextFile(this.filePath));
  }

  async random(): Promise<string | null> {
    const items = await this.all();
    if (!items.length) return null;
    return items[Math.floor(Math.random() * items.length)] ?? null;
  }

  async add(line: string): Promise<void> {
    await appendTextFile(this.filePath, line.trim());
  }

  async remove(predicate: (line: string) => boolean): Promise<boolean> {
    const items = await this.all();
    const next = items.filter((item) => !predicate(item));
    if (next.length === items.length) return false;
    await writeTextFile(this.filePath, `${next.join('\n')}\n`);
    return true;
  }
}

export class JsonStore<T> {
  constructor(
    private readonly filePath: string,
    private readonly fallback: T,
  ) {}

  async read(): Promise<T> {
    const raw = await readTextFile(this.filePath);
    if (!raw.trim()) return structuredClone(this.fallback);
    try {
      return JSON.parse(raw) as T;
    } catch {
      return structuredClone(this.fallback);
    }
  }

  async write(data: T): Promise<void> {
    await writeTextFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`);
  }

  async update(mutator: (data: T) => T | void): Promise<T> {
    return enqueue(this.filePath, async () => {
      const current = await this.read();
      const next = mutator(current);
      const value = (next ?? current) as T;
      await writeTextFileUnlocked(this.filePath, `${JSON.stringify(value, null, 2)}\n`);
      return value;
    });
  }
}

export function runtimeFile(name: string): string {
  return path.join(RUNTIME_DIR, name);
}

export function contentFile(name: string): string {
  return path.join(CONTENT_DIR, name);
}

export async function ensureRuntime(): Promise<void> {
  await ensureDir(RUNTIME_DIR);
  await ensureDir(path.join(RUNTIME_DIR, 'transcripts'));
  await ensureDir(path.join(RUNTIME_DIR, 'logs'));
}
