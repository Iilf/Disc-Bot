import { APIInteractionResponse, InteractionResponseType } from 'discord-api-types/v10';

export const ping = {
  name: 'ping',
  description: 'Replies with Pong!',
  execute: async (interaction: any, env: Env): Promise<APIInteractionResponse> => {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: 'Pong!' },
    };
  },
};