import { Events, type Message } from 'discord.js';
import { guildBadwords } from '../commands/config.js';
import { infoEmbed, warnEmbed } from '../lib/embeds.js';
import {
  afkStore,
  defaultBadwords,
  getGuildConfig,
  logMod,
  updateLevel,
  warningsStore,
} from '../lib/stores.js';
import { formatDuration, levelFromTotalXp, randomInt, shortId, truncate } from '../lib/util.js';
import type { DiscClient, Warning } from '../types.js';

const PREFIX_ALIASES: Record<string, string> = {
  ping: 'ping',
  help: 'help',
  bal: 'balance',
  balance: 'balance',
  daily: 'daily',
  work: 'work',
  rank: 'rank',
  joke: 'joke',
  fact: 'fact',
  snipe: 'snipe',
};

export const name = Events.MessageCreate;

export async function execute(message: Message, client: DiscClient): Promise<void> {
  if (message.author.bot || !message.guild) return;

  await handleAfk(message);
  await handleAutomod(message);
  await handleXp(message);
  await handlePrefix(message, client);
}

async function handleAfk(message: Message): Promise<void> {
  if (!message.guild) return;
  const key = `${message.guild.id}:${message.author.id}`;
  const all = await afkStore.read();
  if (all[key]) {
    await afkStore.update((data) => {
      delete data[key];
    });
    await message.reply({
      embeds: [infoEmbed('Welcome back', 'I cleared your AFK status.')],
    }).then((sent) => setTimeout(() => sent.delete().catch(() => undefined), 6000));
  }

  const mentioned = message.mentions.users.first();
  if (!mentioned) return;
  const target = all[`${message.guild.id}:${mentioned.id}`];
  if (!target) return;
  await message.reply({
    embeds: [
      warnEmbed(
        `${mentioned.username} is AFK`,
        `${target.reason}\nAway for ${formatDuration(Date.now() - target.at)}`,
      ),
    ],
  });
}

async function handleAutomod(message: Message): Promise<void> {
  if (!message.guild || !message.member) return;
  if (message.member.permissions.has('ManageMessages')) return;
  const config = await getGuildConfig(message.guild.id);
  if (!config.automodEnabled) return;
  const defaults = await defaultBadwords.all();
  const custom = await guildBadwords(message.guild.id).all();
  const words = [...defaults, ...custom].map((w) => w.toLowerCase()).filter(Boolean);
  if (!words.length) return;
  const content = message.content.toLowerCase();
  const hit = words.find((word) => content.includes(word));
  if (!hit) return;
  await message.delete().catch(() => undefined);
  await logMod(message.guild.id, `automod deleted message from ${message.author.tag}: matched "${hit}"`);
  if (config.automodWarn) {
    const warning: Warning = {
      id: shortId(6),
      userId: message.author.id,
      moderatorId: message.client.user?.id ?? 'automod',
      reason: `Automod: banned word`,
      at: Date.now(),
    };
    await warningsStore.update((all) => {
      const list = all[message.guild!.id] ?? [];
      list.push(warning);
      all[message.guild!.id] = list;
    });
  }
  if (!('send' in message.channel)) return;
  const notice = await message.channel.send({
    embeds: [warnEmbed('Message removed', `${message.author}, that word is not allowed here.`)],
  });
  setTimeout(() => notice.delete().catch(() => undefined), 7000);
}

async function handleXp(message: Message): Promise<void> {
  if (!message.guild) return;
  const gained = randomInt(15, 25);
  let leveled = false;
  let newLevel = 0;
  const profile = await updateLevel(message.guild.id, message.author.id, (p) => {
    p.totalMessages += 1;
    if (Date.now() - p.lastXp < 60_000) return;
    p.xp += gained;
    p.lastXp = Date.now();
    const parsed = levelFromTotalXp(p.xp);
    if (parsed.level > p.level) {
      p.level = parsed.level;
      leveled = true;
      newLevel = parsed.level;
    } else {
      p.level = parsed.level;
    }
  });
  if (!leveled) return;
  const config = await getGuildConfig(message.guild.id);
  if (!config.levelUpEnabled) return;
  const target = config.levelUpChannelId
    ? await message.guild.channels.fetch(config.levelUpChannelId).catch(() => null)
    : message.channel;
  if (target && 'send' in target) {
    await target.send({
      embeds: [
        infoEmbed(
          'Level up!',
          `${message.author} reached **level ${newLevel || profile.level}** (${profile.xp.toLocaleString()} XP).`,
        ),
      ],
    });
  }
}

async function handlePrefix(message: Message, client: DiscClient): Promise<void> {
  if (!message.guild) return;
  const config = await getGuildConfig(message.guild.id);
  const prefix = config.prefix || process.env.COMMAND_PREFIX || '!';
  if (!message.content.startsWith(prefix)) return;
  const name = message.content.slice(prefix.length).trim().split(/\s+/)[0]?.toLowerCase();
  if (!name) return;
  const mapped = PREFIX_ALIASES[name];
  if (!mapped) return;
  const command = client.commands.get(mapped);
  if (!command) return;
  await message.reply({
    content: `That command is slash-first. Try \`/${mapped}\` — ${truncate(command.data.description, 80)}`,
  });
}
