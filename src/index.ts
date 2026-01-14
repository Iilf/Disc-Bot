import {
  InteractionType,
  InteractionResponseType,
  verifyKey,
} from 'discord-interactions';
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
    // 1. Verify the request is a POST request
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // 2. Extract signature headers for verification
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.text();

    // 3. Perform cryptographic verification
    const isValidRequest =
      signature &&
      timestamp &&
      verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);

    if (!isValidRequest) {
      return new Response('Invalid request signature', { status: 401 });
    }

    // 4. Handle Discord Interactions
    const interaction = JSON.parse(body);

    // Discord sends a PING (Type 1) to verify the endpoint URL
    if (interaction.type === InteractionType.PING) {
      return new Response(JSON.stringify({ type: InteractionResponseType.PONG }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle Application Commands (Type 2)
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const commandName = interaction.data.name;
      const command = commands[commandName];

      if (command) {
        try {
          const result = await command.execute(interaction, env);
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Command Error:', error);
          return new Response(
            JSON.stringify({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { content: 'Error executing command.' },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    return new Response(JSON.stringify({ error: 'Unknown interaction' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};