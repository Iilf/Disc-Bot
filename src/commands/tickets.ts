import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { JsonStore, runtimeFile } from '../lib/storage.js';
import { defineCommand, replyError } from '../lib/command.js';
import { infoEmbed, successEmbed, warnEmbed } from '../lib/embeds.js';
import { getGuildConfig, ticketsStore, updateGuildConfig } from '../lib/stores.js';
import type { Command, TicketRecord } from '../types.js';
import path from 'node:path';

export const ticketCommands: Command[] = [
  defineCommand({
    category: 'tickets',
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Support ticket system')
      .addSubcommand((s) =>
        s
          .setName('setup')
          .setDescription('Post a ticket panel in this channel')
          .addChannelOption((o) =>
            o
              .setName('category')
              .setDescription('Category for new tickets')
              .addChannelTypes(ChannelType.GuildCategory)
              .setRequired(false),
          ),
      )
      .addSubcommand((s) => s.setName('close').setDescription('Close the current ticket'))
      .addSubcommand((s) =>
        s
          .setName('add')
          .setDescription('Add a member to this ticket')
          .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)),
      ),
    async execute(interaction) {
      if (!interaction.guild || !interaction.guildId) return;
      const sub = interaction.options.getSubcommand();
      if (sub === 'setup') {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          await replyError(interaction, 'You need **Manage Channels** to post a ticket panel.');
          return;
        }
        const category = interaction.options.getChannel('category');
        if (category) {
          await updateGuildConfig(interaction.guildId, { ticketCategoryId: category.id });
        }
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket:open')
            .setLabel('Open a ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫'),
        );
        await interaction.reply({
          embeds: [
            infoEmbed(
              'Need help?',
              'Click the button below to open a private support ticket with the staff team.',
            ),
          ],
          components: [row],
        });
        return;
      }

      if (sub === 'close') {
        await closeTicket(interaction.channelId, interaction.guild, interaction.user.id, async (embed) => {
          if (interaction.deferred || interaction.replied) await interaction.followUp({ embeds: [embed] });
          else await interaction.reply({ embeds: [embed] });
        });
        return;
      }

      const user = interaction.options.getUser('user', true);
      const channel = interaction.channel;
      if (!channel || !('permissionOverwrites' in channel)) {
        await replyError(interaction, 'Use this inside a ticket channel.');
        return;
      }
      await channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      await interaction.reply({ embeds: [successEmbed('Added', `${user} can now see this ticket.`)] });
    },
  }),
];

export async function handleTicketButton(
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  if (!interaction.guild || !interaction.inGuild()) return;
  if (interaction.customId === 'ticket:open') {
    const existing = (await ticketsStore.read()).find(
      (t) => t.guildId === interaction.guildId && t.userId === interaction.user.id && !t.closedAt,
    );
    if (existing) {
      await interaction.reply({
        embeds: [warnEmbed('You already have a ticket', `<#${existing.channelId}>`)],
        ephemeral: true,
      });
      return;
    }
    const config = await getGuildConfig(interaction.guild.id);
    const created = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90),
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId ?? undefined,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: interaction.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });
    const record: TicketRecord = {
      channelId: created.id,
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      openedAt: Date.now(),
    };
    await ticketsStore.update((all) => {
      all.push(record);
    });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ticket:close').setLabel('Close ticket').setStyle(ButtonStyle.Danger),
    );
    await created.send({
      content: `${interaction.user}`,
      embeds: [
        infoEmbed(
          'Ticket opened',
          'Staff will be with you shortly. Explain your issue here.\nUse the button or `/ticket close` when finished.',
        ),
      ],
      components: [row],
    });
    await interaction.reply({
      embeds: [successEmbed('Ticket created', `Head to ${created}`)],
      ephemeral: true,
    });
    return;
  }

  if (interaction.customId === 'ticket:close') {
    await closeTicket(interaction.channelId, interaction.guild, interaction.user.id, async (embed) => {
      await interaction.reply({ embeds: [embed] });
    });
  }
}

async function closeTicket(
  channelId: string,
  guild: import('discord.js').Guild,
  closerId: string,
  reply: (embed: import('discord.js').EmbedBuilder) => Promise<void>,
): Promise<void> {
  const tickets = await ticketsStore.read();
  const ticket = tickets.find((t) => t.channelId === channelId && !t.closedAt);
  if (!ticket) {
    await reply(warnEmbed('Not a ticket', 'This channel is not an open ticket.'));
    return;
  }
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  const messages =
    channel && 'messages' in channel
      ? [...(await channel.messages.fetch({ limit: 100 })).values()].reverse().map((m) => ({
          at: m.createdAt.toISOString(),
          authorId: m.author.id,
          author: m.author.tag,
          content: m.cleanContent,
        }))
      : [];
  const transcript = {
    channelId,
    guildId: guild.id,
    openedBy: ticket.userId,
    closedBy: closerId,
    openedAt: ticket.openedAt,
    closedAt: Date.now(),
    messages,
  };
  const store = new JsonStore(path.join(runtimeFile('transcripts'), `${channelId}.json`), transcript);
  await store.write(transcript);
  await ticketsStore.update((all) => {
    const found = all.find((t) => t.channelId === channelId && !t.closedAt);
    if (found) found.closedAt = Date.now();
  });
  await reply(successEmbed('Ticket closed', `Transcript saved to \`data/runtime/transcripts/${channelId}.json\`.`));
  if (channel) {
    setTimeout(() => {
      channel.delete('Ticket closed').catch(() => undefined);
    }, 4000);
  }
}
