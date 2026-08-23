import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { allCommands } from './commands/index.js';
import { execute as onInteraction } from './events/interactionCreate.js';
import { memberAdd, memberRemove } from './events/members.js';
import { execute as onMessage } from './events/messageCreate.js';
import { messageDelete, messageUpdate, reactionAdd } from './events/messages.js';
import { execute as onReady } from './events/ready.js';
import { ensureRuntime } from './lib/storage.js';
import type { Command, DiscClient, SnipedMessage } from './types.js';

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token || token.includes('your_bot_token')) {
    console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and paste your bot token.');
    process.exit(1);
  }

  await ensureRuntime();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
  }) as DiscClient;

  client.commands = new Collection<string, Command>();
  client.cooldowns = new Collection();
  client.snipes = new Collection<string, SnipedMessage>();
  client.editSnipes = new Collection<string, SnipedMessage>();
  client.prefixCache = new Collection();
  client.startedAt = Date.now();

  for (const command of allCommands) {
    client.commands.set(command.data.name, command);
  }

  client.once('ready', () => {
    onReady(client).catch((error) => console.error('Ready handler failed', error));
  });
  client.on('interactionCreate', (interaction) => {
    onInteraction(interaction, client).catch((error) => console.error(error));
  });
  client.on('messageCreate', (message) => {
    onMessage(message, client).catch((error) => console.error(error));
  });
  client.on('messageDelete', (message) => {
    messageDelete.execute(message, client).catch((error) => console.error(error));
  });
  client.on('messageUpdate', (oldMessage, newMessage) => {
    messageUpdate.execute(oldMessage, newMessage, client).catch((error) => console.error(error));
  });
  client.on('messageReactionAdd', (reaction) => {
    reactionAdd.execute(reaction).catch((error) => console.error(error));
  });
  client.on('guildMemberAdd', (member) => {
    memberAdd.execute(member).catch((error) => console.error(error));
  });
  client.on('guildMemberRemove', (member) => {
    memberRemove.execute(member).catch((error) => console.error(error));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
  });

  await client.login(token);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
