import path from 'node:path';
import {
  JsonStore,
  TxtList,
  appendTextFile,
  contentFile,
  runtimeFile,
} from './storage.js';
import type {
  EcoProfile,
  GiveawayRecord,
  GuildConfig,
  LevelProfile,
  NoteItem,
  PollRecord,
  Quote,
  Reminder,
  ShopItem,
  Suggestion,
  Tag,
  TicketRecord,
  TodoItem,
  TriviaQuestion,
  Warning,
} from '../types.js';
import { userKey } from './util.js';

export const DEFAULT_GUILD_CONFIG: GuildConfig = {
  prefix: '!',
  welcomeChannelId: null,
  welcomeMessage: 'Welcome {user} to **{server}**! You are member #{count}.',
  goodbyeChannelId: null,
  goodbyeMessage: '{user} left **{server}**. We now have {count} members.',
  autoroleId: null,
  modLogChannelId: null,
  suggestChannelId: null,
  ticketCategoryId: null,
  ticketLogChannelId: null,
  starboardChannelId: null,
  starboardMin: 3,
  automodEnabled: false,
  automodWarn: false,
  levelUpChannelId: null,
  levelUpEnabled: true,
};

export const DEFAULT_ECO: EcoProfile = {
  wallet: 0,
  bank: 0,
  lastDaily: 0,
  lastWork: 0,
  lastCrime: 0,
  lastRob: 0,
  inventory: {},
};

export const DEFAULT_LEVEL: LevelProfile = {
  xp: 0,
  level: 0,
  lastXp: 0,
  totalMessages: 0,
};

export const guildConfigs = new JsonStore<Record<string, GuildConfig>>(
  runtimeFile('guilds.json'),
  {},
);
export const economyStore = new JsonStore<Record<string, EcoProfile>>(
  runtimeFile('economy.json'),
  {},
);
export const levelsStore = new JsonStore<Record<string, LevelProfile>>(
  runtimeFile('levels.json'),
  {},
);
export const warningsStore = new JsonStore<Record<string, Warning[]>>(
  runtimeFile('warnings.json'),
  {},
);
export const tagsStore = new JsonStore<Record<string, Tag[]>>(runtimeFile('tags.json'), {});
export const quotesStore = new JsonStore<Record<string, Quote[]>>(runtimeFile('quotes.json'), {});
export const suggestionsStore = new JsonStore<Record<string, Suggestion[]>>(
  runtimeFile('suggestions.json'),
  {},
);
export const ticketsStore = new JsonStore<TicketRecord[]>(runtimeFile('tickets.json'), []);
export const giveawaysStore = new JsonStore<GiveawayRecord[]>(runtimeFile('giveaways.json'), []);
export const remindersStore = new JsonStore<Reminder[]>(runtimeFile('reminders.json'), []);
export const notesStore = new JsonStore<Record<string, NoteItem[]>>(runtimeFile('notes.json'), {});
export const todosStore = new JsonStore<Record<string, TodoItem[]>>(runtimeFile('todos.json'), {});
export const afkStore = new JsonStore<Record<string, { reason: string; at: number }>>(
  runtimeFile('afk.json'),
  {},
);
export const pollsStore = new JsonStore<Record<string, PollRecord>>(runtimeFile('polls.json'), {});
export const starboardStore = new JsonStore<Record<string, string>>(
  runtimeFile('starboard.json'),
  {},
);
export const shopStore = new JsonStore<ShopItem[]>(contentFile('shop.json'), []);
export const triviaStore = new JsonStore<TriviaQuestion[]>(contentFile('trivia.json'), []);

export const jokes = new TxtList(contentFile('jokes.txt'));
export const facts = new TxtList(contentFile('facts.txt'));
export const fortunes = new TxtList(contentFile('fortunes.txt'));
export const eightball = new TxtList(contentFile('eightball.txt'));
export const compliments = new TxtList(contentFile('compliments.txt'));
export const roasts = new TxtList(contentFile('roasts.txt'));
export const wouldYouRather = new TxtList(contentFile('wouldyourather.txt'));
export const workLines = new TxtList(contentFile('work.txt'));
export const crimeWin = new TxtList(contentFile('crime-win.txt'));
export const crimeFail = new TxtList(contentFile('crime-fail.txt'));
export const defaultBadwords = new TxtList(contentFile('badwords.txt'));
export const quotesSeed = new TxtList(contentFile('quotes.txt'));

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  const all = await guildConfigs.read();
  return { ...DEFAULT_GUILD_CONFIG, ...(all[guildId] ?? {}) };
}

export async function updateGuildConfig(
  guildId: string,
  patch: Partial<GuildConfig>,
): Promise<GuildConfig> {
  let next: GuildConfig = { ...DEFAULT_GUILD_CONFIG };
  await guildConfigs.update((all) => {
    next = { ...DEFAULT_GUILD_CONFIG, ...(all[guildId] ?? {}), ...patch };
    all[guildId] = next;
  });
  return next;
}

export async function getEco(guildId: string, userId: string): Promise<EcoProfile> {
  const all = await economyStore.read();
  const saved = all[userKey(guildId, userId)];
  return {
    ...DEFAULT_ECO,
    ...saved,
    inventory: { ...(saved?.inventory ?? {}) },
  };
}

export async function updateEco(
  guildId: string,
  userId: string,
  mutator: (profile: EcoProfile) => void,
): Promise<EcoProfile> {
  const key = userKey(guildId, userId);
  let result: EcoProfile = { ...DEFAULT_ECO };
  await economyStore.update((all) => {
    const saved = all[key];
    const profile: EcoProfile = {
      ...DEFAULT_ECO,
      ...saved,
      inventory: { ...(saved?.inventory ?? {}) },
    };
    mutator(profile);
    profile.wallet = Math.max(0, Math.floor(profile.wallet));
    profile.bank = Math.max(0, Math.floor(profile.bank));
    all[key] = profile;
    result = profile;
  });
  return result;
}

export async function getLevel(guildId: string, userId: string): Promise<LevelProfile> {
  const all = await levelsStore.read();
  return { ...DEFAULT_LEVEL, ...(all[userKey(guildId, userId)] ?? {}) };
}

export async function updateLevel(
  guildId: string,
  userId: string,
  mutator: (profile: LevelProfile) => void,
): Promise<LevelProfile> {
  const key = userKey(guildId, userId);
  let result: LevelProfile = { ...DEFAULT_LEVEL };
  await levelsStore.update((all) => {
    const profile = { ...DEFAULT_LEVEL, ...(all[key] ?? {}) };
    mutator(profile);
    all[key] = profile;
    result = profile;
  });
  return result;
}

export async function logMod(guildId: string, line: string): Promise<void> {
  const file = path.join(runtimeFile('logs'), `${guildId}.txt`);
  const stamp = new Date().toISOString();
  await appendTextFile(file, `[${stamp}] ${line}`);
}

export async function getShop(): Promise<ShopItem[]> {
  return shopStore.read();
}

export async function getTrivia(): Promise<TriviaQuestion[]> {
  return triviaStore.read();
}
