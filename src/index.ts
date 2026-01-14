import { verifyKey } from 'discord-interactions';
import { InteractionType, InteractionResponseType } from 'discord-api-types/v10';
import ping from './commands/ping'; 

export interface Env {
  DISCORD_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
}

const commands: Record<string, any> = {
  ping: ping,
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. DISCORD INTERACTION HANDLING
    // Only handle POST requests for interactions
    if (request.method !== 'POST') {
      return new Response('Bot is online! Use POST for interactions.', { status: 200 });
    }

    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.text();

    // Verification step: This MUST pass for Discord to accept your URL
    const isValidRequest =
      signature &&
      timestamp &&
      verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);

    if (!isValidRequest) {
      return new Response('Invalid request signature', { status: 401 });
    }

    const interaction = JSON.parse(body);

    // 2. ACKNOWLEDGE PING (Health Check)
    // Discord sends this exact request type (1) to verify your URL is alive.
    if (interaction.type === InteractionType.Ping) {
      return new Response(
        JSON.stringify({ type: InteractionResponseType.Pong }),
        { headers: { 'content-type': 'application/json' } }
      );
    }

    // 3. COMMAND ROUTER
    if (interaction.type === InteractionType.ApplicationCommand) {
      const commandName = interaction.data.name;
      const command = commands[commandName];

      if (command) {
        try {
          const result = await command.execute(interaction, env);
          return new Response(JSON.stringify(result), {
            headers: { 'content-type': 'application/json' },
          });
        } catch (error) {
          console.error('Command Error:', error);
          return new Response(
            JSON.stringify({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: { content: 'Error executing command.' },
            }),
            { headers: { 'content-type': 'application/json' } }
          );
        }
      }
    }

    return new Response('Unknown Interaction', { status: 400 });
  },
};