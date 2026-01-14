import { InteractionResponseType } from 'discord-api-types/v10';

// We must export this as 'default' so the main index.ts can import it correctly
const ping = {
  async execute(interaction: any, env: any) {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: 'Pong! 🏓',
      },
    };
  },
};

export default ping;