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
    // 1. MUST be a POST request
    if (request.method !== 'POST') {
      return new Response('Bot is online! Use POST for interactions.', { status: 200 });
    }

    // 2. Security Headers
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.text();

    // 3. Verification - If this fails, Discord says "Invalid"
    if (!signature || !timestamp || !env.DISCORD_PUBLIC_KEY) {
      return new Response('Missing signature or key', { status: 401 });
    }

    const isValidRequest = verifyKey(
      body,
      signature,
      timestamp,
      env.DISCORD_PUBLIC_KEY
    );

    if (!isValidRequest) {
      console.error('Invalid Request Signature');
      return new Response('Invalid request signature', { status: 401 });
    }

    // 4. Interaction Logic
    const interaction = JSON.parse(body);

    // This is the PING Discord sends to verify your URL
    if (interaction.type === InteractionType.PING) {
      return new Response(
        JSON.stringify({ type: InteractionResponseType.PONG }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Handle Application Commands
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

    return new Response(JSON.stringify({ error: 'Unknown interaction' }), { status: 400 });
  },
};
