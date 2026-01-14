import { InteractionResponseType } from 'discord-api-types/v10';

// Define the command object
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

// This line is the most important! It MUST be a default export.
export default ping;