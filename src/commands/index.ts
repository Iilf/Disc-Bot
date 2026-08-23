import type { Command } from '../types.js';
import { utilityCommands } from './utility.js';
import { moderationCommands } from './moderation.js';
import { economyCommands } from './economy.js';
import { levelCommands } from './levels.js';
import { funCommands } from './fun.js';
import { socialCommands } from './social.js';
import { ticketCommands } from './tickets.js';
import { giveawayCommands } from './giveaways.js';
import { configCommands } from './config.js';

export const allCommands: Command[] = [
  ...utilityCommands,
  ...moderationCommands,
  ...economyCommands,
  ...levelCommands,
  ...funCommands,
  ...socialCommands,
  ...ticketCommands,
  ...giveawayCommands,
  ...configCommands,
];
