import { Events, type GuildMember, type PartialGuildMember } from 'discord.js';
import { infoEmbed, warnEmbed } from '../lib/embeds.js';
import { getGuildConfig } from '../lib/stores.js';

function render(template: string, member: GuildMember | PartialGuildMember): string {
  return template
    .replaceAll('{user}', `${member}`)
    .replaceAll('{tag}', member.user?.tag ?? 'Unknown')
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(member.guild.memberCount));
}

export async function onMemberAdd(member: GuildMember): Promise<void> {
  const config = await getGuildConfig(member.guild.id);
  if (config.autoroleId) {
    await member.roles.add(config.autoroleId).catch(() => undefined);
  }
  if (!config.welcomeChannelId) return;
  const channel = await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({
    embeds: [
      infoEmbed('New member', render(config.welcomeMessage, member)).setThumbnail(
        member.user.displayAvatarURL({ size: 256 }),
      ),
    ],
  });
}

export async function onMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
  const config = await getGuildConfig(member.guild.id);
  if (!config.goodbyeChannelId) return;
  const channel = await member.guild.channels.fetch(config.goodbyeChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({
    embeds: [warnEmbed('Member left', render(config.goodbyeMessage, member))],
  });
}

export const memberAdd = { name: Events.GuildMemberAdd, execute: onMemberAdd };
export const memberRemove = { name: Events.GuildMemberRemove, execute: onMemberRemove };
