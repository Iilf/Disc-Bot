import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Collection,
  Message,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';

export type SlashData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

export interface Command {
  data: SlashData;
  category: CommandCategory;
  cooldown?: number;
  execute: (interaction: ChatInputCommandInteraction, client: DiscClient) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, client: DiscClient) => Promise<void>;
}

export type CommandCategory =
  | 'utility'
  | 'moderation'
  | 'economy'
  | 'levels'
  | 'fun'
  | 'social'
  | 'tickets'
  | 'giveaways'
  | 'config';

export interface SnipedMessage {
  content: string;
  authorId: string;
  authorTag: string;
  authorAvatar: string | null;
  createdAt: number;
  image?: string;
}

export interface DiscClient extends Client<true> {
  commands: Collection<string, Command>;
  cooldowns: Collection<string, Collection<string, number>>;
  snipes: Collection<string, SnipedMessage>;
  editSnipes: Collection<string, SnipedMessage>;
  startedAt: number;
  prefixCache: Collection<string, Message[]>;
}

export interface GuildConfig {
  prefix: string;
  welcomeChannelId: string | null;
  welcomeMessage: string;
  goodbyeChannelId: string | null;
  goodbyeMessage: string;
  autoroleId: string | null;
  modLogChannelId: string | null;
  suggestChannelId: string | null;
  ticketCategoryId: string | null;
  ticketLogChannelId: string | null;
  starboardChannelId: string | null;
  starboardMin: number;
  automodEnabled: boolean;
  automodWarn: boolean;
  levelUpChannelId: string | null;
  levelUpEnabled: boolean;
}

export interface EcoProfile {
  wallet: number;
  bank: number;
  lastDaily: number;
  lastWork: number;
  lastCrime: number;
  lastRob: number;
  inventory: Record<string, number>;
}

export interface LevelProfile {
  xp: number;
  level: number;
  lastXp: number;
  totalMessages: number;
}

export interface Warning {
  id: string;
  userId: string;
  moderatorId: string;
  reason: string;
  at: number;
}

export interface Tag {
  name: string;
  content: string;
  ownerId: string;
  uses: number;
  createdAt: number;
}

export interface Quote {
  id: number;
  text: string;
  authorId: string;
  addedBy: string;
  at: number;
}

export interface Suggestion {
  id: number;
  userId: string;
  content: string;
  status: 'pending' | 'approved' | 'denied';
  messageId: string | null;
  channelId: string | null;
  at: number;
  reviewNote?: string;
}

export interface TicketRecord {
  channelId: string;
  userId: string;
  guildId: string;
  openedAt: number;
  closedAt?: number;
}

export interface GiveawayRecord {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  prize: string;
  winners: number;
  endsAt: number;
  hostId: string;
  entries: string[];
  ended: boolean;
  winnerIds: string[];
}

export interface Reminder {
  id: string;
  userId: string;
  channelId: string;
  guildId: string;
  message: string;
  at: number;
}

export interface NoteItem {
  id: number;
  text: string;
  at: number;
}

export interface TodoItem {
  id: number;
  text: string;
  done: boolean;
  at: number;
}

export interface ShopItem {
  id: string;
  name: string;
  price: number;
  description: string;
  emoji: string;
}

export interface TriviaQuestion {
  question: string;
  answers: string[];
  correct: number;
}

export interface PollRecord {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, number>;
  ownerId: string;
}
