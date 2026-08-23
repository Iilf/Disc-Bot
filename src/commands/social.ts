import { PermissionFlagsBits, SlashCommandBuilder, userMention } from 'discord.js';
import { defineCommand, replyError } from '../lib/command.js';
import { baseEmbed, infoEmbed, successEmbed, warnEmbed } from '../lib/embeds.js';
import {
  afkStore,
  getGuildConfig,
  notesStore,
  quotesSeed,
  quotesStore,
  suggestionsStore,
  tagsStore,
  todosStore,
  updateGuildConfig,
} from '../lib/stores.js';
import { COLORS, truncate } from '../lib/util.js';
import type { Command, Quote, Suggestion, Tag } from '../types.js';

export const socialCommands: Command[] = [
  defineCommand({
    category: 'social',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('afk')
      .setDescription('Toggle AFK. Mentions will show your reason.')
      .addStringOption((o) => o.setName('reason').setDescription('Why you are away').setRequired(false)),
    async execute(interaction) {
      if (!interaction.guildId) {
        await replyError(interaction, 'AFK is per-server.');
        return;
      }
      const reason = interaction.options.getString('reason') ?? 'AFK';
      const key = `${interaction.guildId}:${interaction.user.id}`;
      let enabled = false;
      await afkStore.update((all) => {
        if (all[key]) {
          delete all[key];
          enabled = false;
        } else {
          all[key] = { reason: truncate(reason, 180), at: Date.now() };
          enabled = true;
        }
      });
      await interaction.reply({
        embeds: [
          enabled
            ? warnEmbed('AFK enabled', `Reason: ${truncate(reason, 180)}`)
            : successEmbed('Welcome back', 'AFK removed.'),
        ],
      });
    },
  }),

  defineCommand({
    category: 'social',
    cooldown: 4,
    data: new SlashCommandBuilder().setName('snipe').setDescription('Show the last deleted message in this channel'),
    async execute(interaction, client) {
      const snipe = client.snipes.get(interaction.channelId);
      if (!snipe) {
        await replyError(interaction, 'Nothing to snipe here.');
        return;
      }
      const embed = baseEmbed(COLORS.dark)
        .setAuthor({ name: snipe.authorTag, iconURL: snipe.authorAvatar ?? undefined })
        .setDescription(snipe.content || '*no text*')
        .setFooter({ text: 'Deleted message' })
        .setTimestamp(snipe.createdAt);
      if (snipe.image) embed.setImage(snipe.image);
      await interaction.reply({ embeds: [embed] });
    },
  }),

  defineCommand({
    category: 'social',
    cooldown: 4,
    data: new SlashCommandBuilder()
      .setName('editsnipe')
      .setDescription('Show the last edited message in this channel'),
    async execute(interaction, client) {
      const snipe = client.editSnipes.get(interaction.channelId);
      if (!snipe) {
        await replyError(interaction, 'Nothing to editsnipe here.');
        return;
      }
      await interaction.reply({
        embeds: [
          baseEmbed(COLORS.dark)
            .setAuthor({ name: snipe.authorTag, iconURL: snipe.authorAvatar ?? undefined })
            .setDescription(snipe.content || '*no text*')
            .setFooter({ text: 'Before the edit' })
            .setTimestamp(snipe.createdAt),
        ],
      });
    },
  }),

  defineCommand({
    category: 'social',
    cooldown: 8,
    data: new SlashCommandBuilder()
      .setName('suggest')
      .setDescription('Submit a suggestion')
      .addStringOption((o) => o.setName('idea').setDescription('Your suggestion').setRequired(true)),
    async execute(interaction) {
      if (!interaction.guild || !interaction.guildId) return;
      const idea = interaction.options.getString('idea', true);
      const config = await getGuildConfig(interaction.guildId);
      let id = 1;
      const suggestion: Suggestion = {
        id: 1,
        userId: interaction.user.id,
        content: truncate(idea, 1000),
        status: 'pending',
        messageId: null,
        channelId: config.suggestChannelId,
        at: Date.now(),
      };
      await suggestionsStore.update((all) => {
        const list = all[interaction.guildId!] ?? [];
        id = (list.at(-1)?.id ?? 0) + 1;
        suggestion.id = id;
        list.push(suggestion);
        all[interaction.guildId!] = list;
      });

      const embed = baseEmbed(COLORS.blurple)
        .setTitle(`Suggestion #${id}`)
        .setDescription(truncate(idea, 1900))
        .setFooter({ text: `by ${interaction.user.tag}` });

      const targetId = config.suggestChannelId ?? interaction.channelId;
      const channel = await interaction.guild.channels.fetch(targetId).catch(() => null);
      if (channel?.isTextBased()) {
        const posted = await channel.send({ embeds: [embed] });
        await posted.react('👍');
        await posted.react('👎');
        suggestion.messageId = posted.id;
        suggestion.channelId = channel.id;
        await suggestionsStore.update((all) => {
          const list = all[interaction.guildId!] ?? [];
          const found = list.find((s) => s.id === id);
          if (found) {
            found.messageId = posted.id;
            found.channelId = channel.id;
          }
        });
      }

      await interaction.reply({
        embeds: [successEmbed('Suggestion submitted', `Logged as **#${id}**.`)],
        ephemeral: true,
      });
    },
  }),

  defineCommand({
    category: 'social',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('suggestion')
      .setDescription('Review a suggestion')
      .addStringOption((o) =>
        o
          .setName('action')
          .setDescription('Approve or deny')
          .setRequired(true)
          .addChoices({ name: 'approve', value: 'approved' }, { name: 'deny', value: 'denied' }),
      )
      .addIntegerOption((o) => o.setName('id').setDescription('Suggestion number').setRequired(true))
      .addStringOption((o) => o.setName('note').setDescription('Staff note').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId || !interaction.guild) return;
      const action = interaction.options.getString('action', true) as 'approved' | 'denied';
      const id = interaction.options.getInteger('id', true);
      const note = interaction.options.getString('note') ?? '';
      let found: Suggestion | undefined;
      await suggestionsStore.update((all) => {
        const list = all[interaction.guildId!] ?? [];
        found = list.find((s) => s.id === id);
        if (found) {
          found.status = action;
          found.reviewNote = note || undefined;
        }
      });
      if (!found) {
        await replyError(interaction, 'No suggestion with that id.');
        return;
      }
      if (found.channelId && found.messageId) {
        const channel = await interaction.guild.channels.fetch(found.channelId).catch(() => null);
        if (channel?.isTextBased()) {
          const message = await channel.messages.fetch(found.messageId).catch(() => null);
          if (message) {
            await message.edit({
              embeds: [
                baseEmbed(action === 'approved' ? COLORS.green : COLORS.red)
                  .setTitle(`Suggestion #${id} ${action}`)
                  .setDescription(found.content)
                  .setFooter({ text: note || action }),
              ],
            });
          }
        }
      }
      await interaction.reply({
        embeds: [successEmbed(`Suggestion ${action}`, `Suggestion **#${id}** is now ${action}.`)],
      });
    },
  }),

  defineCommand({
    category: 'social',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('tag')
      .setDescription('Custom text snippets stored per server')
      .addSubcommand((s) =>
        s
          .setName('create')
          .setDescription('Create a tag')
          .addStringOption((o) => o.setName('name').setDescription('Tag name').setRequired(true))
          .addStringOption((o) => o.setName('content').setDescription('What it says').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('get')
          .setDescription('Show a tag')
          .addStringOption((o) =>
            o.setName('name').setDescription('Tag name').setRequired(true).setAutocomplete(true),
          ),
      )
      .addSubcommand((s) => s.setName('list').setDescription('List tags'))
      .addSubcommand((s) =>
        s
          .setName('delete')
          .setDescription('Delete a tag you own (or any if you manage the server)')
          .addStringOption((o) =>
            o.setName('name').setDescription('Tag name').setRequired(true).setAutocomplete(true),
          ),
      ),
    async autocomplete(interaction) {
      if (!interaction.guildId) {
        await interaction.respond([]);
        return;
      }
      const all = await tagsStore.read();
      const focused = interaction.options.getFocused().toLowerCase();
      await interaction.respond(
        (all[interaction.guildId] ?? [])
          .filter((t) => t.name.includes(focused))
          .slice(0, 25)
          .map((t) => ({ name: t.name, value: t.name })),
      );
    },
    async execute(interaction) {
      if (!interaction.guildId) return;
      const sub = interaction.options.getSubcommand();
      if (sub === 'create') {
        const name = interaction.options.getString('name', true).toLowerCase().replace(/\s+/g, '-').slice(0, 32);
        const content = interaction.options.getString('content', true);
        let exists = false;
        await tagsStore.update((all) => {
          const list = all[interaction.guildId!] ?? [];
          if (list.some((t) => t.name === name)) {
            exists = true;
            return;
          }
          const tag: Tag = {
            name,
            content: truncate(content, 1800),
            ownerId: interaction.user.id,
            uses: 0,
            createdAt: Date.now(),
          };
          list.push(tag);
          all[interaction.guildId!] = list;
        });
        if (exists) {
          await replyError(interaction, 'That tag already exists.');
          return;
        }
        await interaction.reply({ embeds: [successEmbed('Tag created', `Use \`/tag get name:${name}\``)] });
        return;
      }
      if (sub === 'list') {
        const all = await tagsStore.read();
        const list = all[interaction.guildId] ?? [];
        await interaction.reply({
          embeds: [
            infoEmbed(
              'Tags',
              list.length
                ? list.map((t) => `\`${t.name}\` (${t.uses})`).join(', ')
                : 'No tags yet. `/tag create` to add one.',
            ),
          ],
        });
        return;
      }
      const name = interaction.options.getString('name', true).toLowerCase();
      if (sub === 'get') {
        let tag: Tag | undefined;
        await tagsStore.update((all) => {
          tag = (all[interaction.guildId!] ?? []).find((t) => t.name === name);
          if (tag) tag.uses += 1;
        });
        if (!tag) {
          await replyError(interaction, 'Unknown tag.');
          return;
        }
        await interaction.reply({ content: tag.content });
        return;
      }
      const member = interaction.guild ? await interaction.guild.members.fetch(interaction.user.id) : null;
      let removed = false;
      await tagsStore.update((all) => {
        const list = all[interaction.guildId!] ?? [];
        const tag = list.find((t) => t.name === name);
        if (!tag) return;
        const can =
          tag.ownerId === interaction.user.id || Boolean(member?.permissions.has(PermissionFlagsBits.ManageGuild));
        if (!can) return;
        all[interaction.guildId!] = list.filter((t) => t.name !== name);
        removed = true;
      });
      if (!removed) {
        await replyError(interaction, 'Could not delete that tag.');
        return;
      }
      await interaction.reply({ embeds: [successEmbed('Tag deleted', `\`${name}\` is gone.`)] });
    },
  }),

  defineCommand({
    category: 'social',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('quote')
      .setDescription('Server quote book')
      .addSubcommand((s) =>
        s
          .setName('add')
          .setDescription('Add a quote')
          .addStringOption((o) => o.setName('text').setDescription('Quote text').setRequired(true))
          .addUserOption((o) => o.setName('author').setDescription('Who said it').setRequired(false)),
      )
      .addSubcommand((s) => s.setName('random').setDescription('Random server quote'))
      .addSubcommand((s) =>
        s
          .setName('get')
          .setDescription('Get a quote by id')
          .addIntegerOption((o) => o.setName('id').setDescription('Quote id').setRequired(true)),
      )
      .addSubcommand((s) => s.setName('list').setDescription('List recent quotes')),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const sub = interaction.options.getSubcommand();
      if (sub === 'add') {
        const text = interaction.options.getString('text', true);
        const author = interaction.options.getUser('author') ?? interaction.user;
        let id = 1;
        await quotesStore.update((all) => {
          const list = all[interaction.guildId!] ?? [];
          id = (list.at(-1)?.id ?? 0) + 1;
          const quote: Quote = {
            id,
            text: truncate(text, 1000),
            authorId: author.id,
            addedBy: interaction.user.id,
            at: Date.now(),
          };
          list.push(quote);
          all[interaction.guildId!] = list;
        });
        await interaction.reply({ embeds: [successEmbed('Quote saved', `Quote **#${id}** added.`)] });
        return;
      }
      const all = await quotesStore.read();
      const list = all[interaction.guildId] ?? [];
      const seeded = list.length ? list : [];
      if (sub === 'random') {
        if (seeded.length) {
          const quote = seeded[Math.floor(Math.random() * seeded.length)]!;
          await interaction.reply({
            embeds: [
              infoEmbed(`Quote #${quote.id}`, `“${quote.text}”\n— ${userMention(quote.authorId)}`),
            ],
          });
          return;
        }
        const fallback = await quotesSeed.random();
        await interaction.reply({
          embeds: [infoEmbed('Quote', fallback ?? 'No quotes yet. `/quote add` to start the book.')],
        });
        return;
      }
      if (sub === 'get') {
        const id = interaction.options.getInteger('id', true);
        const quote = list.find((q) => q.id === id);
        if (!quote) {
          await replyError(interaction, 'No quote with that id.');
          return;
        }
        await interaction.reply({
          embeds: [infoEmbed(`Quote #${quote.id}`, `“${quote.text}”\n— ${userMention(quote.authorId)}`)],
        });
        return;
      }
      const recent = list.slice(-10).reverse();
      await interaction.reply({
        embeds: [
          infoEmbed(
            'Recent quotes',
            recent.length
              ? recent.map((q) => `**#${q.id}** ${truncate(q.text, 80)}`).join('\n')
              : 'Empty book.',
          ),
        ],
      });
    },
  }),

  defineCommand({
    category: 'social',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('note')
      .setDescription('Personal notes saved to a text store')
      .addSubcommand((s) =>
        s
          .setName('add')
          .setDescription('Add a note')
          .addStringOption((o) => o.setName('text').setDescription('Note').setRequired(true)),
      )
      .addSubcommand((s) => s.setName('list').setDescription('List your notes'))
      .addSubcommand((s) =>
        s
          .setName('delete')
          .setDescription('Delete a note')
          .addIntegerOption((o) => o.setName('id').setDescription('Note id').setRequired(true)),
      ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const key = interaction.user.id;
      if (sub === 'add') {
        const text = interaction.options.getString('text', true);
        let id = 1;
        await notesStore.update((all) => {
          const list = all[key] ?? [];
          id = (list.at(-1)?.id ?? 0) + 1;
          list.push({ id, text: truncate(text, 500), at: Date.now() });
          all[key] = list;
        });
        await interaction.reply({
          embeds: [successEmbed('Note saved', `Note **#${id}** stored.`)],
          ephemeral: true,
        });
        return;
      }
      if (sub === 'list') {
        const all = await notesStore.read();
        const list = all[key] ?? [];
        await interaction.reply({
          embeds: [
            infoEmbed(
              'Your notes',
              list.length ? list.map((n) => `**#${n.id}** ${n.text}`).join('\n') : 'No notes.',
            ),
          ],
          ephemeral: true,
        });
        return;
      }
      const id = interaction.options.getInteger('id', true);
      let removed = false;
      await notesStore.update((all) => {
        const list = all[key] ?? [];
        const next = list.filter((n) => n.id !== id);
        removed = next.length !== list.length;
        all[key] = next;
      });
      await interaction.reply({
        embeds: [removed ? successEmbed('Note deleted') : warnEmbed('No note with that id')],
        ephemeral: true,
      });
    },
  }),

  defineCommand({
    category: 'social',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('todo')
      .setDescription('Personal todo list')
      .addSubcommand((s) =>
        s
          .setName('add')
          .setDescription('Add a task')
          .addStringOption((o) => o.setName('text').setDescription('Task').setRequired(true)),
      )
      .addSubcommand((s) => s.setName('list').setDescription('List tasks'))
      .addSubcommand((s) =>
        s
          .setName('done')
          .setDescription('Mark a task done')
          .addIntegerOption((o) => o.setName('id').setDescription('Task id').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('delete')
          .setDescription('Delete a task')
          .addIntegerOption((o) => o.setName('id').setDescription('Task id').setRequired(true)),
      ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const key = interaction.user.id;
      if (sub === 'add') {
        const text = interaction.options.getString('text', true);
        let id = 1;
        await todosStore.update((all) => {
          const list = all[key] ?? [];
          id = (list.at(-1)?.id ?? 0) + 1;
          list.push({ id, text: truncate(text, 300), done: false, at: Date.now() });
          all[key] = list;
        });
        await interaction.reply({
          embeds: [successEmbed('Task added', `Todo **#${id}**`)],
          ephemeral: true,
        });
        return;
      }
      if (sub === 'list') {
        const all = await todosStore.read();
        const list = all[key] ?? [];
        await interaction.reply({
          embeds: [
            infoEmbed(
              'Todos',
              list.length
                ? list.map((t) => `${t.done ? '✅' : '⬜'} **#${t.id}** ${t.text}`).join('\n')
                : 'Inbox zero.',
            ),
          ],
          ephemeral: true,
        });
        return;
      }
      const id = interaction.options.getInteger('id', true);
      if (sub === 'done') {
        let ok = false;
        await todosStore.update((all) => {
          const item = (all[key] ?? []).find((t) => t.id === id);
          if (item) {
            item.done = true;
            ok = true;
          }
        });
        await interaction.reply({
          embeds: [ok ? successEmbed('Marked done') : warnEmbed('No task with that id')],
          ephemeral: true,
        });
        return;
      }
      let removed = false;
      await todosStore.update((all) => {
        const list = all[key] ?? [];
        const next = list.filter((t) => t.id !== id);
        removed = next.length !== list.length;
        all[key] = next;
      });
      await interaction.reply({
        embeds: [removed ? successEmbed('Task deleted') : warnEmbed('No task with that id')],
        ephemeral: true,
      });
    },
  }),

  defineCommand({
    category: 'social',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('suggestchannel')
      .setDescription('Set the channel where suggestions are posted')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const channel = interaction.options.getChannel('channel', true);
      await updateGuildConfig(interaction.guildId, { suggestChannelId: channel.id });
      await interaction.reply({
        embeds: [successEmbed('Suggestions channel set', `New ideas go to <#${channel.id}>.`)],
      });
    },
  }),
];
