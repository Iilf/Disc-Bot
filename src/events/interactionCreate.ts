import { Events, type Interaction } from 'discord.js';
import { handleGiveawayButton } from '../commands/giveaways.js';
import { handleTicketButton } from '../commands/tickets.js';
import { errorEmbed } from '../lib/embeds.js';
import type { DiscClient } from '../types.js';

export const name = Events.InteractionCreate;

export async function execute(interaction: Interaction, client: DiscClient): Promise<void> {
  try {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) {
        await interaction.respond([]);
        return;
      }
      await command.autocomplete(interaction, client);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('ticket:')) {
        await handleTicketButton(interaction);
        return;
      }
      if (interaction.customId.startsWith('giveaway:')) {
        await handleGiveawayButton(interaction);
        return;
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({
        embeds: [errorEmbed('Unknown command', `\`${interaction.commandName}\` is not loaded.`)],
        ephemeral: true,
      });
      return;
    }

    const cooldown = (command.cooldown ?? 3) * 1000;
    const now = Date.now();
    let bucket = client.cooldowns.get(command.data.name);
    if (!bucket) {
      bucket = new (await import('discord.js')).Collection();
      client.cooldowns.set(command.data.name, bucket);
    }
    const expires = bucket.get(interaction.user.id);
    if (expires && expires > now) {
      const left = Math.ceil((expires - now) / 1000);
      await interaction.reply({
        embeds: [errorEmbed('Slow down', `Wait **${left}s** before using \`/${command.data.name}\` again.`)],
        ephemeral: true,
      });
      return;
    }
    bucket.set(interaction.user.id, now + cooldown);
    setTimeout(() => bucket?.delete(interaction.user.id), cooldown);

    await command.execute(interaction, client);
  } catch (error) {
    console.error('Interaction error:', error);
    const payload = {
      embeds: [errorEmbed('Something broke', 'The command hit an unexpected error. Check the console.')],
      ephemeral: true,
    };
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => undefined);
      else await interaction.reply(payload).catch(() => undefined);
    }
  }
}
