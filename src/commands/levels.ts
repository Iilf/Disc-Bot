import { PermissionFlagsBits, SlashCommandBuilder, userMention } from 'discord.js';
import { defineCommand, replyError } from '../lib/command.js';
import { baseEmbed, infoEmbed, successEmbed } from '../lib/embeds.js';
import { getLevel, levelsStore, updateLevel } from '../lib/stores.js';
import { COLORS, levelFromTotalXp, progressBar, totalXpForLevel, xpForLevel } from '../lib/util.js';
import type { Command } from '../types.js';

export const levelCommands: Command[] = [
  defineCommand({
    category: 'levels',
    cooldown: 4,
    data: new SlashCommandBuilder()
      .setName('rank')
      .setDescription('Show XP and level')
      .addUserOption((o) => o.setName('user').setDescription('Whose rank').setRequired(false)),
    async execute(interaction) {
      if (!interaction.guildId) {
        await replyError(interaction, 'Levels are per-server.');
        return;
      }
      const user = interaction.options.getUser('user') ?? interaction.user;
      const profile = await getLevel(interaction.guildId, user.id);
      const needed = xpForLevel(profile.level);
      const all = await levelsStore.read();
      const ranked = Object.entries(all)
        .filter(([key]) => key.startsWith(`${interaction.guildId}:`))
        .sort((a, b) => b[1].xp - a[1].xp);
      const place = ranked.findIndex(([key]) => key.endsWith(`:${user.id}`)) + 1;
      await interaction.reply({
        embeds: [
          baseEmbed(COLORS.teal)
            .setAuthor({ name: `${user.username} — rank`, iconURL: user.displayAvatarURL() })
            .setDescription(
              [
                `**Level** ${profile.level} ${place ? `• Server rank #${place}` : ''}`,
                `**XP** ${profile.xp.toLocaleString()} total`,
                `${progressBar(profile.xp - totalXpForLevel(profile.level), needed)} ${profile.xp - totalXpForLevel(profile.level)} / ${needed}`,
                `Messages counted: ${profile.totalMessages.toLocaleString()}`,
              ].join('\n'),
            ),
        ],
      });
    },
  }),

  defineCommand({
    category: 'levels',
    cooldown: 5,
    data: new SlashCommandBuilder().setName('levels').setDescription('XP leaderboard for this server'),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const all = await levelsStore.read();
      const rows = Object.entries(all)
        .filter(([key]) => key.startsWith(`${interaction.guildId}:`))
        .map(([key, profile]) => ({ userId: key.split(':')[1] ?? '', ...profile }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 10);
      if (!rows.length) {
        await interaction.reply({ embeds: [infoEmbed('Leaderboard', 'No XP yet. Keep chatting!')] });
        return;
      }
      const lines = rows.map(
        (row, i) => `**${i + 1}.** ${userMention(row.userId)} — Lv **${row.level}** (${row.xp.toLocaleString()} XP)`,
      );
      await interaction.reply({
        embeds: [baseEmbed(COLORS.teal).setTitle('📈 Server levels').setDescription(lines.join('\n'))],
      });
    },
  }),

  defineCommand({
    category: 'levels',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('setxp')
      .setDescription('Set a member XP (admin)')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addIntegerOption((o) =>
        o.setName('xp').setDescription('Total XP').setRequired(true).setMinValue(0).setMaxValue(5_000_000),
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const user = interaction.options.getUser('user', true);
      const xp = interaction.options.getInteger('xp', true);
      const parsed = levelFromTotalXp(xp);
      const profile = await updateLevel(interaction.guildId, user.id, (p) => {
        p.xp = xp;
        p.level = parsed.level;
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            'XP updated',
            `${userMention(user.id)} is now level **${profile.level}** with **${profile.xp.toLocaleString()}** XP.`,
          ),
        ],
      });
    },
  }),
];
