import { Events, type Message, type PartialMessage } from 'discord.js';
import { baseEmbed } from '../lib/embeds.js';
import { getGuildConfig, starboardStore } from '../lib/stores.js';
import { COLORS, truncate } from '../lib/util.js';
import type { DiscClient, SnipedMessage } from '../types.js';

function toSnipe(message: Message | PartialMessage): SnipedMessage | null {
  if (!message.author) return null;
  return {
    content: truncate(message.content ?? '', 1900) || '*no text*',
    authorId: message.author.id,
    authorTag: message.author.tag,
    authorAvatar: message.author.displayAvatarURL(),
    createdAt: message.createdTimestamp ?? Date.now(),
    image: message.attachments.first()?.url,
  };
}

export async function onMessageDelete(message: Message | PartialMessage, client: DiscClient): Promise<void> {
  if (!message.guild || message.author?.bot) return;
  const snipe = toSnipe(message);
  if (snipe) client.snipes.set(message.channelId, snipe);
}

export async function onMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
  client: DiscClient,
): Promise<void> {
  if (!oldMessage.guild || oldMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  const snipe = toSnipe(oldMessage);
  if (snipe) client.editSnipes.set(oldMessage.channelId, snipe);
}

export async function onReactionAdd(
  reaction: import('discord.js').MessageReaction | import('discord.js').PartialMessageReaction,
): Promise<void> {
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }
  if (reaction.emoji.name !== '⭐') return;
  const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
  if (!message.guild || message.author.bot) return;
  const config = await getGuildConfig(message.guild.id);
  if (!config.starboardChannelId) return;
  const count = reaction.count ?? 0;
  if (count < config.starboardMin) return;

  const board = await message.guild.channels.fetch(config.starboardChannelId).catch(() => null);
  if (!board?.isTextBased()) return;

  const mapKey = `${message.guild.id}:${message.id}`;
  const existing = await starboardStore.read();
  const embed = baseEmbed(COLORS.gold)
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
    .setDescription(truncate(message.content || '*attachment*', 1800))
    .addFields({ name: 'Source', value: `[Jump to message](${message.url})` })
    .setFooter({ text: `⭐ ${count}` })
    .setTimestamp(message.createdAt);
  const image = message.attachments.first()?.url;
  if (image) embed.setImage(image);

  const postedId = existing[mapKey];
  if (postedId) {
    const posted = await board.messages.fetch(postedId).catch(() => null);
    if (posted) {
      await posted.edit({ embeds: [embed] });
      return;
    }
  }
  const sent = await board.send({ embeds: [embed] });
  await starboardStore.update((all) => {
    all[mapKey] = sent.id;
  });
}

export const messageDelete = { name: Events.MessageDelete, execute: onMessageDelete };
export const messageUpdate = { name: Events.MessageUpdate, execute: onMessageUpdate };
export const reactionAdd = { name: Events.MessageReactionAdd, execute: onReactionAdd };
