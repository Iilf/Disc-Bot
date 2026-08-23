import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
  userMention,
} from 'discord.js';
import { defineCommand, replyError } from '../lib/command.js';
import { baseEmbed, errorEmbed, infoEmbed, successEmbed, warnEmbed } from '../lib/embeds.js';
import { giveawaysStore } from '../lib/stores.js';
import { COLORS, canSend, formatDuration, parseDuration, pick, relative, shortId, truncate } from '../lib/util.js';
import type { Command, DiscClient, GiveawayRecord } from '../types.js';

function giveawayEmbed(giveaway: GiveawayRecord) {
  return baseEmbed(COLORS.pink)
    .setTitle('🎁 Giveaway')
    .setDescription(
      [
        `**Prize:** ${giveaway.prize}`,
        `**Winners:** ${giveaway.winners}`,
        `**Ends:** ${relative(giveaway.endsAt)}`,
        `**Host:** ${userMention(giveaway.hostId)}`,
        `**Entries:** ${giveaway.entries.length}`,
      ].join('\n'),
    )
    .setFooter({ text: giveaway.id });
}

export const giveawayCommands: Command[] = [
  defineCommand({
    category: 'giveaways',
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('giveaway')
      .setDescription('Run file-backed giveaways')
      .addSubcommand((s) =>
        s
          .setName('start')
          .setDescription('Start a giveaway')
          .addStringOption((o) => o.setName('duration').setDescription('e.g. 10m, 2h, 1d').setRequired(true))
          .addStringOption((o) => o.setName('prize').setDescription('What people win').setRequired(true))
          .addIntegerOption((o) =>
            o.setName('winners').setDescription('How many winners').setMinValue(1).setMaxValue(20).setRequired(false),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName('end')
          .setDescription('End a giveaway now')
          .addStringOption((o) => o.setName('id').setDescription('Giveaway id').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('reroll')
          .setDescription('Pick new winners')
          .addStringOption((o) => o.setName('id').setDescription('Giveaway id').setRequired(true)),
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased()) {
        await replyError(interaction, 'Use this in a server text channel.');
        return;
      }
      const sub = interaction.options.getSubcommand();
      if (sub === 'start') {
        const duration = parseDuration(interaction.options.getString('duration', true));
        const prize = interaction.options.getString('prize', true);
        const winners = interaction.options.getInteger('winners') ?? 1;
        if (!duration || duration < 15_000 || duration > 30 * 86_400_000) {
          await replyError(interaction, 'Duration must be between 15 seconds and 30 days.');
          return;
        }
        const id = shortId(6);
        const record: GiveawayRecord = {
          id,
          guildId: interaction.guild.id,
          channelId: interaction.channelId,
          messageId: '',
          prize: truncate(prize, 200),
          winners,
          endsAt: Date.now() + duration,
          hostId: interaction.user.id,
          entries: [],
          ended: false,
          winnerIds: [],
        };
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`giveaway:enter:${id}`).setLabel('Enter').setStyle(ButtonStyle.Success).setEmoji('🎉'),
        );
        const message = await interaction.reply({
          embeds: [giveawayEmbed(record)],
          components: [row],
          fetchReply: true,
        });
        record.messageId = message.id;
        await giveawaysStore.update((all) => {
          all.push(record);
        });
        return;
      }

      const id = interaction.options.getString('id', true);
      const all = await giveawaysStore.read();
      const giveaway = all.find((g) => g.id === id && g.guildId === interaction.guildId);
      if (!giveaway) {
        await replyError(interaction, 'Giveaway not found.');
        return;
      }
      if (sub === 'end') {
        await finishGiveaway(interaction.client as DiscClient, giveaway, true);
        await interaction.reply({ embeds: [successEmbed('Giveaway ended', `Forced end for \`${id}\`.`)] });
        return;
      }
      if (!giveaway.ended) {
        await replyError(interaction, 'That giveaway has not ended yet.');
        return;
      }
      const pool = giveaway.entries.filter((e) => !giveaway.winnerIds.includes(e));
      if (!pool.length) {
        await interaction.reply({ embeds: [warnEmbed('No one left to reroll')] });
        return;
      }
      const winner = pick(pool);
      await giveawaysStore.update((list) => {
        const found = list.find((g) => g.id === id);
        if (found) found.winnerIds.push(winner);
      });
      await interaction.reply({
        content: `🎁 New winner for **${giveaway.prize}**: ${userMention(winner)}`,
      });
    },
  }),
];

export async function handleGiveawayButton(
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  const id = interaction.customId.split(':')[2];
  if (!id) return;
  let entered = false;
  let count = 0;
  let exists = false;
  await giveawaysStore.update((all) => {
    const giveaway = all.find((g) => g.id === id && !g.ended);
    if (!giveaway) return;
    exists = true;
    if (!giveaway.entries.includes(interaction.user.id)) {
      giveaway.entries.push(interaction.user.id);
      entered = true;
    }
    count = giveaway.entries.length;
  });
  if (!exists) {
    await interaction.reply({ embeds: [errorEmbed('Giveaway closed')], ephemeral: true });
    return;
  }
  await interaction.reply({
    embeds: [
      entered
        ? successEmbed('You are in!', `There are now **${count}** entries.`)
        : infoEmbed('Already entered', `Still **${count}** entries.`),
    ],
    ephemeral: true,
  });
}

export async function finishGiveaway(
  client: DiscClient,
  giveaway: GiveawayRecord,
  force = false,
): Promise<void> {
  const freshList = await giveawaysStore.read();
  const current = freshList.find((g) => g.id === giveaway.id);
  if (!current || current.ended) return;
  if (!force && current.endsAt > Date.now()) return;

  const winners: string[] = [];
  const pool = [...current.entries];
  while (winners.length < current.winners && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    const [picked] = pool.splice(idx, 1);
    if (picked) winners.push(picked);
  }

  await giveawaysStore.update((all) => {
    const found = all.find((g) => g.id === current.id);
    if (!found || found.ended) return;
    found.ended = true;
    found.winnerIds = winners;
  });

  const fetched = await client.channels.fetch(current.channelId).catch(() => null);
  if (!fetched || !canSend(fetched) || !('messages' in fetched)) return;
  const channel = fetched as import('discord.js').TextChannel;
  const message = await channel.messages.fetch(current.messageId).catch(() => null);
  const result = winners.length
    ? winners.map((id) => userMention(id)).join(', ')
    : 'No valid entries.';
  if (message) {
    await message.edit({
      embeds: [
        baseEmbed(COLORS.gold)
          .setTitle('🎁 Giveaway ended')
          .setDescription(`**Prize:** ${current.prize}\n**Winners:** ${result}`)
          .setFooter({ text: current.id }),
      ],
      components: [],
    });
  }
  await channel.send({
    content: winners.length
      ? `Congratulations ${result}! You won **${current.prize}**.`
      : `Giveaway \`${current.id}\` ended with no entries.`,
  });
}

export async function tickGiveaways(client: DiscClient): Promise<void> {
  const all = await giveawaysStore.read();
  const due = all.filter((g) => !g.ended && g.endsAt <= Date.now());
  for (const giveaway of due) {
    await finishGiveaway(client, giveaway);
  }
}

export function giveawayDurationHint(ms: number): string {
  return formatDuration(ms);
}
