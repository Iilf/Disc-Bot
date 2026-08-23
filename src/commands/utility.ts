import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  userMention,
} from 'discord.js';
import { defineCommand, replyError } from '../lib/command.js';
import { baseEmbed, errorEmbed, infoEmbed, successEmbed, userFooter } from '../lib/embeds.js';
import { categoryMeta } from '../lib/command.js';
import { remindersStore } from '../lib/stores.js';
import {
  COLORS,
  canSend,
  evalMath,
  formatDuration,
  parseDuration,
  pick,
  relative,
  shortId,
  truncate,
} from '../lib/util.js';
import type { Command, Reminder } from '../types.js';

export const utilityCommands: Command[] = [
  defineCommand({
    category: 'utility',
    cooldown: 3,
    data: new SlashCommandBuilder().setName('ping').setDescription('Check if the bot is alive'),
    async execute(interaction, client) {
      const sent = await interaction.reply({
        embeds: [infoEmbed('Pinging…', 'Measuring heartbeat and round-trip.')],
        fetchReply: true,
      });
      const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
      await interaction.editReply({
        embeds: [
          successEmbed(
            'Pong! 🏓',
            [
              `**Round-trip:** ${roundtrip}ms`,
              `**WebSocket:** ${Math.max(0, client.ws.ping)}ms`,
              `**Uptime:** ${formatDuration(Date.now() - client.startedAt)}`,
            ].join('\n'),
          ),
        ],
      });
    },
  }),

  defineCommand({
    category: 'utility',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('help')
      .setDescription('Browse every command by category')
      .addStringOption((o) =>
        o
          .setName('command')
          .setDescription('Jump to a specific command')
          .setRequired(false)
          .setAutocomplete(true),
      ),
    async autocomplete(interaction, client) {
      const focused = interaction.options.getFocused().toLowerCase();
      const choices = [...client.commands.values()]
        .filter((c) => c.data.name.includes(focused) || c.data.description.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((c) => ({ name: `/${c.data.name} — ${c.data.description}`.slice(0, 100), value: c.data.name }));
      await interaction.respond(choices);
    },
    async execute(interaction, client) {
      const query = interaction.options.getString('command');
      if (query) {
        const command = client.commands.get(query);
        if (!command) {
          await replyError(interaction, `I do not have a \`/${query}\` command.`);
          return;
        }
        const meta = categoryMeta()[command.category];
        await interaction.reply({
          embeds: [
            infoEmbed(`/${command.data.name}`, command.data.description)
              .addFields(
                { name: 'Category', value: `${meta.emoji} ${meta.label}`, inline: true },
                { name: 'Cooldown', value: `${command.cooldown ?? 3}s`, inline: true },
              )
              .setFooter({ text: 'Tip: start typing / in chat to see options.' }),
          ],
        });
        return;
      }

      const meta = categoryMeta();
      const grouped = new Map<string, string[]>();
      for (const command of client.commands.values()) {
        const list = grouped.get(command.category) ?? [];
        list.push(`\`/${command.data.name}\``);
        grouped.set(command.category, list);
      }

      const embed = baseEmbed(COLORS.blurple)
        .setTitle('Disc Bot — command deck')
        .setDescription(
          'A full MVP in one bot. Data lives in local **txt/json** files under `data/`.\nUse `/help command:<name>` for a single command.',
        );

      for (const [key, info] of Object.entries(meta)) {
        const names = grouped.get(key);
        if (!names?.length) continue;
        embed.addFields({
          name: `${info.emoji} ${info.label}`,
          value: `${info.blurb}\n${names.join(' · ')}`,
        });
      }

      embed.setFooter({ text: `${client.commands.size} slash commands loaded` });
      await interaction.reply({ embeds: [embed] });
    },
  }),

  defineCommand({
    category: 'utility',
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('Show profile details for a member')
      .addUserOption((o) => o.setName('user').setDescription('Who to inspect').setRequired(false)),
    async execute(interaction) {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const member = interaction.guild
        ? await interaction.guild.members.fetch(user.id).catch(() => null)
        : null;
      const roles = member
        ? member.roles.cache
            .filter((r) => r.id !== interaction.guildId)
            .sort((a, b) => b.position - a.position)
            .map((r) => r.toString())
            .slice(0, 20)
        : [];

      const embed = baseEmbed(member?.displayColor || COLORS.blurple)
        .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'ID', value: user.id, inline: true },
          { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
          { name: 'Created', value: time(user.createdAt, 'R'), inline: true },
        );
      if (member) {
        embed.addFields(
          {
            name: 'Joined',
            value: member.joinedAt ? time(member.joinedAt, 'R') : 'Unknown',
            inline: true,
          },
          { name: 'Nickname', value: member.nickname ?? 'None', inline: true },
          {
            name: `Roles (${roles.length})`,
            value: roles.join(' ') || 'None',
          },
        );
      }
      await interaction.reply({ embeds: [embed] });
    },
  }),

  defineCommand({
    category: 'utility',
    cooldown: 5,
    data: new SlashCommandBuilder().setName('serverinfo').setDescription('Show this server at a glance'),
    async execute(interaction) {
      const guild = interaction.guild;
      if (!guild) {
        await replyError(interaction, 'This command only works in a server.');
        return;
      }
      const owner = await guild.fetchOwner().catch(() => null);
      const embed = baseEmbed(COLORS.teal)
        .setTitle(guild.name)
        .setThumbnail(guild.iconURL({ size: 256 }))
        .addFields(
          { name: 'ID', value: guild.id, inline: true },
          { name: 'Owner', value: owner ? userMention(owner.id) : 'Unknown', inline: true },
          { name: 'Created', value: time(guild.createdAt, 'R'), inline: true },
          { name: 'Members', value: String(guild.memberCount), inline: true },
          { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
          { name: 'Channels', value: String(guild.channels.cache.size), inline: true },
          { name: 'Boosts', value: `${guild.premiumSubscriptionCount ?? 0} (lvl ${guild.premiumTier})`, inline: true },
          { name: 'Verification', value: String(guild.verificationLevel), inline: true },
          {
            name: 'Emojis',
            value: String(guild.emojis.cache.size),
            inline: true,
          },
        );
      if (guild.description) embed.setDescription(guild.description);
      await interaction.reply({ embeds: [embed] });
    },
  }),

  defineCommand({
    category: 'utility',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('avatar')
      .setDescription('Get a high-res avatar')
      .addUserOption((o) => o.setName('user').setDescription('Whose avatar').setRequired(false)),
    async execute(interaction) {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const url = user.displayAvatarURL({ size: 4096 });
      await interaction.reply({
        embeds: [
          baseEmbed(COLORS.pink)
            .setTitle(`${user.username}'s avatar`)
            .setImage(url)
            .setURL(url)
            .setDescription(`[Open original](${url})`),
        ],
      });
    },
  }),

  defineCommand({
    category: 'utility',
    cooldown: 5,
    data: new SlashCommandBuilder().setName('botinfo').setDescription('Stats about this bot process'),
    async execute(interaction, client) {
      const mem = process.memoryUsage();
      await interaction.reply({
        embeds: [
          infoEmbed('Disc Bot', 'Feature-rich MVP. All persistent data is plain text under `data/`.')
            .addFields(
              { name: 'Servers', value: String(client.guilds.cache.size), inline: true },
              { name: 'Users cached', value: String(client.users.cache.size), inline: true },
              { name: 'Commands', value: String(client.commands.size), inline: true },
              { name: 'Uptime', value: formatDuration(Date.now() - client.startedAt), inline: true },
              { name: 'Ping', value: `${Math.max(0, client.ws.ping)}ms`, inline: true },
              {
                name: 'Memory',
                value: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
                inline: true,
              },
              { name: 'Node', value: process.version, inline: true },
              { name: 'Storage', value: 'txt + json files', inline: true },
            )
            .setThumbnail(client.user.displayAvatarURL()),
        ],
      });
    },
  }),

  defineCommand({
    category: 'utility',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('invite')
      .setDescription('Get an invite link for this bot'),
    async execute(interaction, client) {
      const url = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
      await interaction.reply({
        embeds: [
          infoEmbed('Invite Disc Bot', `[Click here to add the bot to a server](${url})`).addFields({
            name: 'Suggested permissions',
            value: 'Administrator, or at least Manage Channels, Moderate Members, Ban, Kick, Manage Messages, Embed Links, Read Message History.',
          }),
        ],
      });
    },
  }),

  defineCommand({
    category: 'utility',
    cooldown: 3,
    data: new SlashCommandBuilder().setName('uptime').setDescription('How long the bot has been running'),
    async execute(interaction, client) {
      await interaction.reply({
        embeds: [
          infoEmbed(
            'Uptime',
            `Online for **${formatDuration(Date.now() - client.startedAt)}**\nStarted ${relative(client.startedAt)}`,
          ),
        ],
      });
    },
  }),

  defineCommand({
    category: 'utility',
    cooldown: 8,
    data: new SlashCommandBuilder()
      .setName('poll')
      .setDescription('Create a quick reaction poll')
      .addStringOption((o) => o.setName('question').setDescription('What are we voting on?').setRequired(true))
      .addStringOption((o) => o.setName('option1').setDescription('First option').setRequired(true))
      .addStringOption((o) => o.setName('option2').setDescription('Second option').setRequired(true))
      .addStringOption((o) => o.setName('option3').setDescription('Third option').setRequired(false))
      .addStringOption((o) => o.setName('option4').setDescription('Fourth option').setRequired(false))
      .addStringOption((o) => o.setName('option5').setDescription('Fifth option').setRequired(false)),
    async execute(interaction) {
      const question = interaction.options.getString('question', true);
      const options = [1, 2, 3, 4, 5]
        .map((n) => interaction.options.getString(`option${n}`))
        .filter((v): v is string => Boolean(v));
      const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
      const body = options.map((opt, i) => `${emojis[i]} ${opt}`).join('\n');
      const message = await interaction.reply({
        embeds: [
          userFooter(
            baseEmbed(COLORS.gold).setTitle('📊 Poll').setDescription(`**${truncate(question, 250)}**\n\n${body}`),
            interaction.user,
          ),
        ],
        fetchReply: true,
      });
      for (let i = 0; i < options.length; i += 1) {
        await message.react(emojis[i] as string);
      }
    },
  }),

  defineCommand({
    category: 'utility',
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('remind')
      .setDescription('Set a reminder stored in reminders.txt/json')
      .addStringOption((o) =>
        o.setName('when').setDescription('Duration like 10m, 2h, 1d').setRequired(true),
      )
      .addStringOption((o) => o.setName('message').setDescription('What should I remind you?').setRequired(true)),
    async execute(interaction) {
      const when = interaction.options.getString('when', true);
      const message = interaction.options.getString('message', true);
      const ms = parseDuration(when);
      if (!ms || ms < 10_000 || ms > 30 * 86_400_000) {
        await replyError(interaction, 'Use a duration between 10 seconds and 30 days. Examples: `10m`, `2h30m`, `1d`.');
        return;
      }
      const reminder: Reminder = {
        id: shortId(8),
        userId: interaction.user.id,
        channelId: interaction.channelId,
        guildId: interaction.guildId ?? 'dm',
        message: truncate(message, 500),
        at: Date.now() + ms,
      };
      await remindersStore.update((all) => {
        all.push(reminder);
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            'Reminder set',
            `I will ping you ${relative(reminder.at)}:\n${truncate(message, 300)}`,
          ).setFooter({ text: `id ${reminder.id}` }),
        ],
      });
    },
  }),

  defineCommand({
    category: 'utility',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('math')
      .setDescription('Evaluate a basic math expression')
      .addStringOption((o) => o.setName('expression').setDescription('e.g. 12 * (4 + 3) ^ 2').setRequired(true)),
    async execute(interaction) {
      const expression = interaction.options.getString('expression', true);
      const result = evalMath(expression);
      if (result === null) {
        await interaction.reply({
          embeds: [errorEmbed('Could not calculate that', 'Only numbers and `+ - * / % ^ ( )` are allowed.')],
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        embeds: [infoEmbed('Result', `\`${expression}\` = **${result}**`)],
      });
    },
  }),

  defineCommand({
    category: 'utility',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('choose')
      .setDescription('Pick randomly from a list')
      .addStringOption((o) =>
        o.setName('options').setDescription('Separate choices with | or commas').setRequired(true),
      ),
    async execute(interaction) {
      const raw = interaction.options.getString('options', true);
      const options = raw
        .split(/\s*\|\s*|\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (options.length < 2) {
        await replyError(interaction, 'Give me at least two options, separated by `|` or commas.');
        return;
      }
      await interaction.reply({
        embeds: [infoEmbed('I choose…', `**${pick(options)}**`).setFooter({ text: `out of ${options.length} options` })],
      });
    },
  }),

  defineCommand({
    category: 'utility',
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('say')
      .setDescription('Make the bot say something (manage messages)')
      .addStringOption((o) => o.setName('message').setDescription('What to send').setRequired(true))
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Where to send it')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false),
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      const content = interaction.options.getString('message', true);
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      if (!canSend(channel)) {
        await replyError(interaction, 'I cannot send there.');
        return;
      }
      await channel.send({ content: truncate(content, 2000) });
      await interaction.reply({ embeds: [successEmbed('Sent', `Posted in ${channel.toString()}.`)], ephemeral: true });
    },
  }),

  defineCommand({
    category: 'utility',
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('announce')
      .setDescription('Post a styled announcement embed')
      .addStringOption((o) => o.setName('title').setDescription('Headline').setRequired(true))
      .addStringOption((o) => o.setName('body').setDescription('Announcement text').setRequired(true))
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Target channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false),
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      const title = interaction.options.getString('title', true);
      const body = interaction.options.getString('body', true);
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      if (!canSend(channel)) {
        await replyError(interaction, 'I cannot announce there.');
        return;
      }
      await channel.send({
        embeds: [
          userFooter(
            baseEmbed(COLORS.gold).setTitle(`📢 ${truncate(title, 200)}`).setDescription(truncate(body, 3900)),
            interaction.user,
          ),
        ],
      });
      await interaction.reply({ embeds: [successEmbed('Announcement posted')], ephemeral: true });
    },
  }),

  defineCommand({
    category: 'utility',
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('membercount')
      .setDescription('Show how many people are in this server'),
    async execute(interaction) {
      const guild = interaction.guild;
      if (!guild) {
        await replyError(interaction, 'Server only.');
        return;
      }
      await interaction.reply({
        embeds: [
          infoEmbed(guild.name, `**${guild.memberCount.toLocaleString()}** members`).setThumbnail(
            guild.iconURL({ size: 256 }),
          ),
        ],
      });
    },
  }),
];
