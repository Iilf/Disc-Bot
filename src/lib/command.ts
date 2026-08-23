import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildMember,
  type PermissionResolvable,
} from 'discord.js';
import type { Command, CommandCategory, DiscClient, SlashData } from '../types.js';
import { errorEmbed } from './embeds.js';

export function defineCommand(command: Command): Command {
  return command;
}

export async function replyError(
  interaction: ChatInputCommandInteraction,
  description: string,
  title = 'That did not work',
): Promise<void> {
  const payload = { embeds: [errorEmbed(title, description)], ephemeral: true };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }
  await interaction.reply(payload);
}

export function memberPerms(
  member: GuildMember | null,
  perms: PermissionResolvable,
): boolean {
  if (!member) return false;
  return member.permissions.has(perms);
}

export function requireGuild(interaction: ChatInputCommandInteraction): boolean {
  return Boolean(interaction.inGuild() && interaction.guild);
}

export function botCan(
  interaction: ChatInputCommandInteraction,
  perms: PermissionResolvable,
): boolean {
  return Boolean(interaction.guild?.members.me?.permissions.has(perms));
}

export function higherThan(
  actor: GuildMember,
  target: GuildMember,
): boolean {
  if (actor.id === actor.guild.ownerId) return target.id !== actor.id;
  return actor.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

export const ModPerms = PermissionFlagsBits.ModerateMembers;
export const BanPerms = PermissionFlagsBits.BanMembers;
export const KickPerms = PermissionFlagsBits.KickMembers;
export const ManageChan = PermissionFlagsBits.ManageChannels;
export const ManageMsg = PermissionFlagsBits.ManageMessages;
export const ManageRoles = PermissionFlagsBits.ManageRoles;
export const ManageGuild = PermissionFlagsBits.ManageGuild;
export const Admin = PermissionFlagsBits.Administrator;

export function categoryMeta(): Record<
  CommandCategory,
  { label: string; emoji: string; blurb: string }
> {
  return {
    utility: { label: 'Utility', emoji: '🛠️', blurb: 'Info, polls, reminders, and helpers' },
    moderation: { label: 'Moderation', emoji: '🛡️', blurb: 'Keep the server clean and safe' },
    economy: { label: 'Economy', emoji: '🪙', blurb: 'Work, gamble, shop, and flex coins' },
    levels: { label: 'Levels', emoji: '📈', blurb: 'Chat XP, ranks, and leaderboards' },
    fun: { label: 'Fun', emoji: '🎉', blurb: 'Games, jokes, roasts, and chaos' },
    social: { label: 'Social', emoji: '💬', blurb: 'AFK, tags, quotes, notes, suggestions' },
    tickets: { label: 'Tickets', emoji: '🎫', blurb: 'Private support channels' },
    giveaways: { label: 'Giveaways', emoji: '🎁', blurb: 'Timed prize drops' },
    config: { label: 'Config', emoji: '⚙️', blurb: 'Welcome, automod, autorole, starboard' },
  };
}

export function commandHint(command: Command): string {
  return `\`/${command.data.name}\` — ${command.data.description}`;
}

export type CommandFactory = (client: DiscClient) => Command[] | Command;
