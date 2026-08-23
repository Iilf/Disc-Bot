import { Events, REST, Routes } from 'discord.js';
import { tickGiveaways } from '../commands/giveaways.js';
import { remindersStore } from '../lib/stores.js';
import type { DiscClient } from '../types.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: DiscClient): Promise<void> {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Loaded ${client.commands.size} commands across ${client.guilds.cache.size} guild(s)`);
  client.user.setActivity(`${client.commands.size} commands | /help`);

  await registerCommands(client);
  setInterval(() => {
    tickGiveaways(client).catch((error) => console.error('Giveaway tick failed', error));
    deliverReminders(client).catch((error) => console.error('Reminder tick failed', error));
  }, 10_000);
}

async function registerCommands(client: DiscClient): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID ?? client.user.id;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token) return;

  const body = [...client.commands.values()].map((command) => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
      console.log(`Registered ${body.length} guild commands to ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body });
      console.log(`Registered ${body.length} global commands`);
    }
  } catch (error) {
    console.error('Failed to register slash commands', error);
  }
}

async function deliverReminders(client: DiscClient): Promise<void> {
  const now = Date.now();
  const due = (await remindersStore.read()).filter((r) => r.at <= now);
  if (!due.length) return;
  await remindersStore.update((all) => all.filter((r) => r.at > now));
  for (const reminder of due) {
    const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
    if (!channel || !('send' in channel)) continue;
    await channel.send({
      content: `<@${reminder.userId}> reminder: ${reminder.message}`,
    }).catch(() => undefined);
  }
}
