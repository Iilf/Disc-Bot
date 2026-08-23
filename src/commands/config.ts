import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { defineCommand, replyError } from '../lib/command.js';
import { infoEmbed, successEmbed } from '../lib/embeds.js';
import { defaultBadwords, getGuildConfig, updateGuildConfig } from '../lib/stores.js';
import { TxtList, runtimeFile } from '../lib/storage.js';
import type { Command, GuildConfig } from '../types.js';

function guildBadwords(guildId: string): TxtList {
  return new TxtList(runtimeFile(`badwords-${guildId}.txt`));
}

function configSummary(config: GuildConfig): string {
  return [
    `**Prefix:** \`${config.prefix}\``,
    `**Welcome:** ${config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : 'off'}`,
    `**Goodbye:** ${config.goodbyeChannelId ? `<#${config.goodbyeChannelId}>` : 'off'}`,
    `**Autorole:** ${config.autoroleId ? `<@&${config.autoroleId}>` : 'off'}`,
    `**Suggestions:** ${config.suggestChannelId ? `<#${config.suggestChannelId}>` : 'off'}`,
    `**Tickets category:** ${config.ticketCategoryId ? `<#${config.ticketCategoryId}>` : 'unset'}`,
    `**Starboard:** ${config.starboardChannelId ? `<#${config.starboardChannelId}> (${config.starboardMin}⭐)` : 'off'}`,
    `**Automod:** ${config.automodEnabled ? 'on' : 'off'}${config.automodWarn ? ' + warn' : ''}`,
    `**Level-up messages:** ${config.levelUpEnabled ? 'on' : 'off'}`,
  ].join('\n');
}

export const configCommands: Command[] = [
  defineCommand({
    category: 'config',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('config')
      .setDescription('View or update server settings')
      .addSubcommand((s) => s.setName('view').setDescription('Show current settings'))
      .addSubcommand((s) =>
        s
          .setName('prefix')
          .setDescription('Set the text-command prefix')
          .addStringOption((o) => o.setName('value').setDescription('e.g. ! or ?').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('levels')
          .setDescription('Toggle level-up messages')
          .addBooleanOption((o) => o.setName('enabled').setDescription('On or off').setRequired(true)),
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const sub = interaction.options.getSubcommand();
      if (sub === 'view') {
        const config = await getGuildConfig(interaction.guildId);
        await interaction.reply({ embeds: [infoEmbed('Server config', configSummary(config))] });
        return;
      }
      if (sub === 'prefix') {
        const value = interaction.options.getString('value', true).slice(0, 5);
        await updateGuildConfig(interaction.guildId, { prefix: value });
        await interaction.reply({
          embeds: [successEmbed('Prefix updated', `Text commands now use \`${value}\`. Slash commands always work.`)],
        });
        return;
      }
      const enabled = interaction.options.getBoolean('enabled', true);
      await updateGuildConfig(interaction.guildId, { levelUpEnabled: enabled });
      await interaction.reply({
        embeds: [successEmbed('Level-up messages', enabled ? 'Enabled.' : 'Disabled.')],
      });
    },
  }),

  defineCommand({
    category: 'config',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('welcome')
      .setDescription('Configure welcome and goodbye messages')
      .addSubcommand((s) =>
        s
          .setName('set')
          .setDescription('Set the welcome channel and message')
          .addChannelOption((o) =>
            o
              .setName('channel')
              .setDescription('Welcome channel')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true),
          )
          .addStringOption((o) =>
            o
              .setName('message')
              .setDescription('Use {user} {server} {count}')
              .setRequired(false),
          ),
      )
      .addSubcommand((s) => s.setName('off').setDescription('Disable welcome messages'))
      .addSubcommand((s) =>
        s
          .setName('goodbye')
          .setDescription('Set goodbye channel and message')
          .addChannelOption((o) =>
            o
              .setName('channel')
              .setDescription('Goodbye channel')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true),
          )
          .addStringOption((o) =>
            o.setName('message').setDescription('Use {user} {server} {count}').setRequired(false),
          ),
      )
      .addSubcommand((s) => s.setName('goodbye-off').setDescription('Disable goodbye messages'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const sub = interaction.options.getSubcommand();
      if (sub === 'off') {
        await updateGuildConfig(interaction.guildId, { welcomeChannelId: null });
        await interaction.reply({ embeds: [successEmbed('Welcome disabled')] });
        return;
      }
      if (sub === 'goodbye-off') {
        await updateGuildConfig(interaction.guildId, { goodbyeChannelId: null });
        await interaction.reply({ embeds: [successEmbed('Goodbye disabled')] });
        return;
      }
      const channel = interaction.options.getChannel('channel', true);
      const message = interaction.options.getString('message');
      if (sub === 'set') {
        await updateGuildConfig(interaction.guildId, {
          welcomeChannelId: channel.id,
          ...(message ? { welcomeMessage: message } : {}),
        });
        await interaction.reply({
          embeds: [successEmbed('Welcome set', `I will greet people in <#${channel.id}>.`)],
        });
        return;
      }
      await updateGuildConfig(interaction.guildId, {
        goodbyeChannelId: channel.id,
        ...(message ? { goodbyeMessage: message } : {}),
      });
      await interaction.reply({
        embeds: [successEmbed('Goodbye set', `I will say farewell in <#${channel.id}>.`)],
      });
    },
  }),

  defineCommand({
    category: 'config',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('autorole')
      .setDescription('Give a role to new members')
      .addRoleOption((o) => o.setName('role').setDescription('Role to grant').setRequired(false))
      .addBooleanOption((o) => o.setName('off').setDescription('Disable autorole').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    async execute(interaction) {
      if (!interaction.guildId || !interaction.guild) return;
      const off = interaction.options.getBoolean('off');
      const role = interaction.options.getRole('role');
      if (off || !role) {
        if (off) {
          await updateGuildConfig(interaction.guildId, { autoroleId: null });
          await interaction.reply({ embeds: [successEmbed('Autorole disabled')] });
          return;
        }
        const config = await getGuildConfig(interaction.guildId);
        await interaction.reply({
          embeds: [
            infoEmbed(
              'Autorole',
              config.autoroleId ? `Currently <@&${config.autoroleId}>` : 'Not set. Pass a role to enable.',
            ),
          ],
        });
        return;
      }
      const me = interaction.guild.members.me;
      if (me && role.position >= me.roles.highest.position) {
        await replyError(interaction, 'That role is above me. Move my role higher.');
        return;
      }
      await updateGuildConfig(interaction.guildId, { autoroleId: role.id });
      await interaction.reply({ embeds: [successEmbed('Autorole set', `New members get ${role}.`)] });
    },
  }),

  defineCommand({
    category: 'config',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('automod')
      .setDescription('Word-filter automod backed by txt lists')
      .addSubcommand((s) =>
        s
          .setName('toggle')
          .setDescription('Enable or disable automod')
          .addBooleanOption((o) => o.setName('enabled').setDescription('On or off').setRequired(true))
          .addBooleanOption((o) => o.setName('warn').setDescription('Also warn the user').setRequired(false)),
      )
      .addSubcommand((s) =>
        s
          .setName('add')
          .setDescription('Add a banned word for this server')
          .addStringOption((o) => o.setName('word').setDescription('Word or phrase').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('remove')
          .setDescription('Remove a banned word')
          .addStringOption((o) => o.setName('word').setDescription('Word').setRequired(true)),
      )
      .addSubcommand((s) => s.setName('list').setDescription('Show custom banned words'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const sub = interaction.options.getSubcommand();
      if (sub === 'toggle') {
        const enabled = interaction.options.getBoolean('enabled', true);
        const warn = interaction.options.getBoolean('warn') ?? false;
        await updateGuildConfig(interaction.guildId, { automodEnabled: enabled, automodWarn: warn });
        await interaction.reply({
          embeds: [successEmbed('Automod updated', `Filter is **${enabled ? 'on' : 'off'}**. Warn: **${warn ? 'yes' : 'no'}**.`)],
        });
        return;
      }
      const list = guildBadwords(interaction.guildId);
      if (sub === 'add') {
        const word = interaction.options.getString('word', true).toLowerCase().trim();
        await list.add(word);
        await interaction.reply({
          embeds: [successEmbed('Word added', `\`${word}\` will be filtered when automod is on.`)],
          ephemeral: true,
        });
        return;
      }
      if (sub === 'remove') {
        const word = interaction.options.getString('word', true).toLowerCase().trim();
        const ok = await list.remove((line) => line.toLowerCase() === word);
        await interaction.reply({
          embeds: [ok ? successEmbed('Word removed') : infoEmbed('Not found', 'That word was not in the custom list.')],
          ephemeral: true,
        });
        return;
      }
      const custom = await list.all();
      const defaults = await defaultBadwords.all();
      await interaction.reply({
        embeds: [
          infoEmbed(
            'Automod lists',
            [
              `**Default words:** ${defaults.length} (data/content/badwords.txt)`,
              `**Custom words:** ${custom.length ? custom.map((w) => `\`${w}\``).join(', ') : 'none'}`,
            ].join('\n'),
          ),
        ],
        ephemeral: true,
      });
    },
  }),

  defineCommand({
    category: 'config',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('starboard')
      .setDescription('Highlight popular messages')
      .addSubcommand((s) =>
        s
          .setName('set')
          .setDescription('Set starboard channel and threshold')
          .addChannelOption((o) =>
            o
              .setName('channel')
              .setDescription('Starboard channel')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true),
          )
          .addIntegerOption((o) =>
            o.setName('min').setDescription('Minimum stars').setMinValue(1).setMaxValue(25).setRequired(false),
          ),
      )
      .addSubcommand((s) => s.setName('off').setDescription('Disable starboard'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const sub = interaction.options.getSubcommand();
      if (sub === 'off') {
        await updateGuildConfig(interaction.guildId, { starboardChannelId: null });
        await interaction.reply({ embeds: [successEmbed('Starboard disabled')] });
        return;
      }
      const channel = interaction.options.getChannel('channel', true);
      const min = interaction.options.getInteger('min') ?? 3;
      await updateGuildConfig(interaction.guildId, { starboardChannelId: channel.id, starboardMin: min });
      await interaction.reply({
        embeds: [successEmbed('Starboard set', `Messages with ${min}+ ⭐ go to <#${channel.id}>.`)],
      });
    },
  }),
];

export { guildBadwords };
