import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  userMention,
} from 'discord.js';
import { defineCommand, higherThan, replyError } from '../lib/command.js';
import { errorEmbed, infoEmbed, successEmbed, warnEmbed } from '../lib/embeds.js';
import { getGuildConfig, logMod, updateGuildConfig, warningsStore } from '../lib/stores.js';
import { formatDuration, parseDuration, shortId, truncate } from '../lib/util.js';
import type { Command, Warning } from '../types.js';

function warningsKey(guildId: string): string {
  return guildId;
}

export const moderationCommands: Command[] = [
  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a member')
      .addUserOption((o) => o.setName('user').setDescription('Member to kick').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    async execute(interaction) {
      if (!interaction.guild || !interaction.member) return;
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') ?? 'No reason provided';
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      const actor = await interaction.guild.members.fetch(interaction.user.id);
      if (!target) {
        await replyError(interaction, 'That user is not in this server.');
        return;
      }
      if (!target.kickable || !higherThan(actor, target)) {
        await replyError(interaction, 'I cannot kick that member (role hierarchy).');
        return;
      }
      await target.kick(reason);
      await logMod(interaction.guild.id, `${interaction.user.tag} kicked ${user.tag}: ${reason}`);
      await interaction.reply({
        embeds: [successEmbed('Member kicked', `${userMention(user.id)}\n${truncate(reason, 300)}`)],
      });
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a member')
      .addUserOption((o) => o.setName('user').setDescription('User to ban').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why').setRequired(false))
      .addIntegerOption((o) =>
        o
          .setName('delete_days')
          .setDescription('Delete recent messages (0-7 days)')
          .setMinValue(0)
          .setMaxValue(7)
          .setRequired(false),
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction) {
      if (!interaction.guild) return;
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') ?? 'No reason provided';
      const days = interaction.options.getInteger('delete_days') ?? 0;
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      const actor = await interaction.guild.members.fetch(interaction.user.id);
      if (target && (!target.bannable || !higherThan(actor, target))) {
        await replyError(interaction, 'I cannot ban that member (role hierarchy).');
        return;
      }
      await interaction.guild.members.ban(user.id, { reason, deleteMessageSeconds: days * 86_400 });
      await logMod(interaction.guild.id, `${interaction.user.tag} banned ${user.tag}: ${reason}`);
      await interaction.reply({
        embeds: [successEmbed('User banned', `${userMention(user.id)}\n${truncate(reason, 300)}`)],
      });
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Unban a user by ID')
      .addStringOption((o) => o.setName('user_id').setDescription('Snowflake ID').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction) {
      if (!interaction.guild) return;
      const id = interaction.options.getString('user_id', true).trim();
      const reason = interaction.options.getString('reason') ?? 'No reason provided';
      try {
        await interaction.guild.members.unban(id, reason);
        await logMod(interaction.guild.id, `${interaction.user.tag} unbanned ${id}: ${reason}`);
        await interaction.reply({ embeds: [successEmbed('User unbanned', `ID \`${id}\``)] });
      } catch {
        await replyError(interaction, 'Could not unban that ID. Are they actually banned?');
      }
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('Timeout a member')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) =>
        o.setName('duration').setDescription('e.g. 10m, 1h, 1d').setRequired(true),
      )
      .addStringOption((o) => o.setName('reason').setDescription('Why').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      if (!interaction.guild) return;
      const user = interaction.options.getUser('user', true);
      const durationRaw = interaction.options.getString('duration', true);
      const reason = interaction.options.getString('reason') ?? 'No reason provided';
      const ms = parseDuration(durationRaw);
      if (!ms || ms < 5000 || ms > 28 * 86_400_000) {
        await replyError(interaction, 'Duration must be between 5 seconds and 28 days.');
        return;
      }
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      const actor = await interaction.guild.members.fetch(interaction.user.id);
      if (!target || !target.moderatable || !higherThan(actor, target)) {
        await replyError(interaction, 'I cannot timeout that member.');
        return;
      }
      await target.timeout(ms, reason);
      await logMod(
        interaction.guild.id,
        `${interaction.user.tag} timed out ${user.tag} for ${formatDuration(ms)}: ${reason}`,
      );
      await interaction.reply({
        embeds: [
          warnEmbed(
            'Member timed out',
            `${userMention(user.id)} muted for **${formatDuration(ms)}**\n${truncate(reason, 300)}`,
          ),
        ],
      });
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('untimeout')
      .setDescription('Remove a timeout')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      if (!interaction.guild) return;
      const user = interaction.options.getUser('user', true);
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!target) {
        await replyError(interaction, 'Member not found.');
        return;
      }
      await target.timeout(null);
      await logMod(interaction.guild.id, `${interaction.user.tag} removed timeout from ${user.tag}`);
      await interaction.reply({ embeds: [successEmbed('Timeout removed', userMention(user.id))] });
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Warn a member (saved to warnings file)')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      if (!interaction.guild) return;
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);
      const warning: Warning = {
        id: shortId(6),
        userId: user.id,
        moderatorId: interaction.user.id,
        reason: truncate(reason, 400),
        at: Date.now(),
      };
      let total = 0;
      await warningsStore.update((all) => {
        const key = warningsKey(interaction.guildId!);
        const list = all[key] ?? [];
        list.push(warning);
        all[key] = list;
        total = list.filter((w) => w.userId === user.id).length;
      });
      await logMod(interaction.guild.id, `${interaction.user.tag} warned ${user.tag}: ${reason}`);
      await interaction.reply({
        embeds: [
          warnEmbed(
            'Warning issued',
            `${userMention(user.id)} now has **${total}** warning(s).\nReason: ${truncate(reason, 300)}`,
          ).setFooter({ text: `id ${warning.id}` }),
        ],
      });
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('warnings')
      .setDescription('List warnings for a member')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)),
    async execute(interaction) {
      if (!interaction.guild) return;
      const user = interaction.options.getUser('user', true);
      const all = await warningsStore.read();
      const list = (all[interaction.guild.id] ?? []).filter((w) => w.userId === user.id);
      if (!list.length) {
        await interaction.reply({ embeds: [infoEmbed('Clean record', `${userMention(user.id)} has no warnings.`)] });
        return;
      }
      const lines = list
        .slice(-10)
        .reverse()
        .map((w) => `\`${w.id}\` <t:${Math.floor(w.at / 1000)}:R> by ${userMention(w.moderatorId)} — ${truncate(w.reason, 80)}`);
      await interaction.reply({
        embeds: [
          infoEmbed(`Warnings for ${user.username}`, lines.join('\n')).setFooter({
            text: `${list.length} total`,
          }),
        ],
      });
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('clearwarns')
      .setDescription('Clear one warning or all warnings for a member')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('id').setDescription('Specific warning id').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      if (!interaction.guild) return;
      const user = interaction.options.getUser('user', true);
      const id = interaction.options.getString('id');
      let removed = 0;
      await warningsStore.update((all) => {
        const current = all[interaction.guildId!] ?? [];
        const next = id
          ? current.filter((w) => !(w.userId === user.id && w.id === id))
          : current.filter((w) => w.userId !== user.id);
        removed = current.length - next.length;
        all[interaction.guildId!] = next;
      });
      await logMod(
        interaction.guild.id,
        `${interaction.user.tag} cleared ${removed} warning(s) for ${user.tag}${id ? ` (${id})` : ''}`,
      );
      await interaction.reply({
        embeds: [successEmbed('Warnings updated', `Removed **${removed}** warning(s) from ${userMention(user.id)}.`)],
      });
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('purge')
      .setDescription('Bulk delete recent messages')
      .addIntegerOption((o) =>
        o.setName('amount').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100),
      )
      .addUserOption((o) => o.setName('user').setDescription('Only delete this user').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      if (!interaction.channel || !interaction.channel.isTextBased() || interaction.channel.isDMBased()) {
        await replyError(interaction, 'Use this in a server text channel.');
        return;
      }
      const amount = interaction.options.getInteger('amount', true);
      const user = interaction.options.getUser('user');
      await interaction.deferReply({ ephemeral: true });
      const fetched = await interaction.channel.messages.fetch({ limit: 100 });
      const deletable = fetched.filter((m) => {
        if (Date.now() - m.createdTimestamp > 13 * 86_400_000) return false;
        if (user && m.author.id !== user.id) return false;
        return true;
      });
      const toDelete = [...deletable.values()].slice(0, amount);
      if (!toDelete.length) {
        await interaction.editReply({ embeds: [errorEmbed('Nothing to delete')] });
        return;
      }
      if ('bulkDelete' in interaction.channel) {
        await interaction.channel.bulkDelete(toDelete, true);
      }
      if (interaction.guild) {
        await logMod(
          interaction.guild.id,
          `${interaction.user.tag} purged ${toDelete.length} messages in #${'name' in interaction.channel ? interaction.channel.name : interaction.channelId}`,
        );
      }
      await interaction.editReply({
        embeds: [successEmbed('Purged', `Deleted **${toDelete.length}** message(s).`)],
      });
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('slowmode')
      .setDescription('Set channel slowmode')
      .addIntegerOption((o) =>
        o.setName('seconds').setDescription('0 to disable, max 21600').setRequired(true).setMinValue(0).setMaxValue(21600),
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
      const seconds = interaction.options.getInteger('seconds', true);
      const channel = interaction.channel;
      if (!channel || !('setRateLimitPerUser' in channel)) {
        await replyError(interaction, 'This channel does not support slowmode.');
        return;
      }
      await channel.setRateLimitPerUser(seconds);
      await interaction.reply({
        embeds: [
          successEmbed(
            'Slowmode updated',
            seconds === 0 ? 'Slowmode disabled.' : `Members must wait **${seconds}s** between messages.`,
          ),
        ],
      });
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('lock')
      .setDescription('Lock this channel for @everyone')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
      const channel = interaction.channel;
      if (!interaction.guild || !channel || !('permissionOverwrites' in channel)) {
        await replyError(interaction, 'Cannot lock this channel.');
        return;
      }
      await channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });
      await interaction.reply({ embeds: [warnEmbed('Channel locked', 'Members can no longer send messages.')] });
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('unlock')
      .setDescription('Unlock this channel for @everyone')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
      const channel = interaction.channel;
      if (!interaction.guild || !channel || !('permissionOverwrites' in channel)) {
        await replyError(interaction, 'Cannot unlock this channel.');
        return;
      }
      await channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null });
      await interaction.reply({ embeds: [successEmbed('Channel unlocked')] });
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('nickname')
      .setDescription('Change a member nickname')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('nick').setDescription('New nickname, or leave empty to reset').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
    async execute(interaction) {
      if (!interaction.guild) return;
      const user = interaction.options.getUser('user', true);
      const nick = interaction.options.getString('nick');
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!target || !target.manageable) {
        await replyError(interaction, 'I cannot change that nickname.');
        return;
      }
      await target.setNickname(nick);
      await interaction.reply({
        embeds: [successEmbed('Nickname updated', `${userMention(user.id)} → **${nick || 'reset'}**`)],
      });
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('role')
      .setDescription('Add or remove a role')
      .addStringOption((o) =>
        o
          .setName('action')
          .setDescription('Add or remove')
          .setRequired(true)
          .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }),
      )
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    async execute(interaction) {
      if (!interaction.guild) return;
      const action = interaction.options.getString('action', true);
      const user = interaction.options.getUser('user', true);
      const role = interaction.options.getRole('role', true);
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      const me = interaction.guild.members.me;
      if (!target || !me) {
        await replyError(interaction, 'Member not found.');
        return;
      }
      if (role.position >= me.roles.highest.position || role.managed) {
        await replyError(interaction, 'That role is above me or managed by an integration.');
        return;
      }
      if (action === 'add') await target.roles.add(role.id);
      else await target.roles.remove(role.id);
      await interaction.reply({
        embeds: [successEmbed(`Role ${action === 'add' ? 'added' : 'removed'}`, `${role} ${action === 'add' ? '→' : '✖'} ${userMention(user.id)}`)],
      });
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('modlog')
      .setDescription('Set or view the moderation log channel')
      .addChannelOption((o) => o.setName('channel').setDescription('Log channel').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guild) return;
      const channel = interaction.options.getChannel('channel');
      if (!channel) {
        const config = await getGuildConfig(interaction.guild.id);
        await interaction.reply({
          embeds: [
            infoEmbed(
              'Mod log',
              config.modLogChannelId
                ? `Currently <#${config.modLogChannelId}>`
                : 'Not set. File logs still write to `data/runtime/logs/`.',
            ),
          ],
        });
        return;
      }
      await updateGuildConfig(interaction.guild.id, { modLogChannelId: channel.id });
      await interaction.reply({
        embeds: [successEmbed('Mod log set', `Logs will also try to post in <#${channel.id}>. File logs always persist.`)],
      });
    },
  }),

  defineCommand({
    category: 'moderation',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('softban')
      .setDescription('Ban then immediately unban to wipe recent messages')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction) {
      if (!interaction.guild) return;
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') ?? 'Softban';
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      const actor = await interaction.guild.members.fetch(interaction.user.id);
      if (target && (!target.bannable || !higherThan(actor, target))) {
        await replyError(interaction, 'I cannot softban that member.');
        return;
      }
      await interaction.guild.members.ban(user.id, { reason: `Softban: ${reason}`, deleteMessageSeconds: 86_400 * 7 });
      await interaction.guild.members.unban(user.id, 'Softban complete');
      await logMod(interaction.guild.id, `${interaction.user.tag} softbanned ${user.tag}: ${reason}`);
      await interaction.reply({
        embeds: [successEmbed('Softbanned', `${userMention(user.id)} was banned and unbanned to clear messages.`)],
      });
    },
  }),
];
