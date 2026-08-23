import {
  EmbedBuilder,
  type APIEmbedField,
  type ColorResolvable,
  type User,
} from 'discord.js';
import { COLORS, truncate } from './util.js';

export function baseEmbed(color: ColorResolvable = COLORS.blurple): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setTimestamp();
}

export function successEmbed(title: string, description?: string): EmbedBuilder {
  const embed = baseEmbed(COLORS.green).setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

export function errorEmbed(title: string, description?: string): EmbedBuilder {
  const embed = baseEmbed(COLORS.red).setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  const embed = baseEmbed(COLORS.blurple).setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

export function warnEmbed(title: string, description?: string): EmbedBuilder {
  const embed = baseEmbed(COLORS.yellow).setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

export function fieldEmbed(
  title: string,
  fields: APIEmbedField[],
  color: ColorResolvable = COLORS.blurple,
): EmbedBuilder {
  return baseEmbed(color).setTitle(title).addFields(fields);
}

export function userFooter(embed: EmbedBuilder, user: User): EmbedBuilder {
  return embed.setFooter({
    text: user.username,
    iconURL: user.displayAvatarURL(),
  });
}

export function quoteBlock(text: string): string {
  return `>>> ${truncate(text, 1900)}`;
}
