import { randomBytes } from 'node:crypto';

export const COLORS = {
  blurple: 0x5865f2,
  green: 0x57f287,
  red: 0xed4245,
  yellow: 0xfee75c,
  gold: 0xf1c40f,
  dark: 0x2b2d31,
  pink: 0xeb459e,
  teal: 0x1abc9c,
} as const;

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function shortId(size = 6): string {
  return randomBytes(size).toString('hex').slice(0, size);
}

export function plural(n: number, word: string, words = `${word}s`): string {
  return `${n} ${n === 1 ? word : words}`;
}

export function truncate(text: string, max = 1024): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function escapeMd(text: string): string {
  return text.replace(/[\\*_`>|~]/g, '\\$&');
}

export function formatCoins(amount: number): string {
  return `${amount.toLocaleString()} 🪙`;
}

export function progressBar(current: number, max: number, size = 10): string {
  const ratio = max <= 0 ? 1 : clamp(current / max, 0, 1);
  const filled = Math.round(ratio * size);
  return `${'▰'.repeat(filled)}${'▱'.repeat(size - filled)}`;
}

const DURATION_UNITS: Record<string, number> = {
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
};

export function parseDuration(input: string): number | null {
  const cleaned = input.trim().toLowerCase();
  if (!cleaned) return null;
  if (/^\d+$/.test(cleaned)) return Number(cleaned) * 1000;

  let total = 0;
  const pattern = /(\d+)\s*([a-z]+)/g;
  let match: RegExpExecArray | null;
  let found = false;
  while ((match = pattern.exec(cleaned))) {
    const amount = Number(match[1]);
    const unit = DURATION_UNITS[match[2] ?? ''];
    if (!unit || !Number.isFinite(amount)) return null;
    total += amount * unit;
    found = true;
  }
  return found ? total : null;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const parts: string[] = [];
  const units: Array<[number, string]> = [
    [86_400_000, 'd'],
    [3_600_000, 'h'],
    [60_000, 'm'],
    [1000, 's'],
  ];
  let remaining = Math.max(0, Math.floor(ms));
  for (const [size, label] of units) {
    if (remaining < size) continue;
    const value = Math.floor(remaining / size);
    remaining %= size;
    parts.push(`${value}${label}`);
  }
  return parts.slice(0, 3).join(' ') || '0s';
}

export function relative(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

export function timestamp(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:F>`;
}

export function xpForLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let i = 0; i < level; i += 1) total += xpForLevel(i);
  return total;
}

export function levelFromTotalXp(total: number): { level: number; into: number; needed: number } {
  let level = 0;
  let remaining = Math.max(0, total);
  let needed = xpForLevel(0);
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = xpForLevel(level);
  }
  return { level, into: remaining, needed };
}

export function mentionUser(id: string): string {
  return `<@${id}>`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const SAFE_MATH = /^[0-9+\-*/().%\s^]+$/;

export function evalMath(expression: string): number | null {
  const cleaned = expression.replace(/\^/g, '**').trim();
  if (!cleaned || !SAFE_MATH.test(cleaned)) return null;
  try {
    const result = Function(`"use strict"; return (${cleaned});`)();
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export function userKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function canSend(
  channel: unknown,
): channel is { send: (options: unknown) => Promise<unknown>; toString: () => string } {
  return Boolean(
    channel &&
      typeof channel === 'object' &&
      'send' in channel &&
      typeof (channel as { send?: unknown }).send === 'function',
  );
}
