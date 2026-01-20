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
    const url = new URL(request.url);

    // DEBUG PATH: Visit your-worker.url/test-config in your browser
    // This helps you check if the key is actually loaded without showing the whole secret
    if (url.pathname === '/test-config') {
      const keyStatus = env.DISCORD_PUBLIC_KEY ? `Loaded (Starts with: ${env.DISCORD_PUBLIC_KEY.substring(0, 5)}...)` : 'NOT FOUND';
      return new Response(`Worker Name: dc-bot\nPublic Key Status: ${keyStatus}`, { status: 200 });
    }

    // 1. MUST be a POST request for Discord
    if (request.method !== 'POST') {
      return new Response('Bot is online! Use POST for interactions.', { status: 200 });
    }

    // 2. Security Headers
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.text();

    // 3. Verification Check
    if (!env.DISCORD_PUBLIC_KEY) {
      return new Response('Missing Public Key Configuration', { status: 500 });
    }

    if (!signature || !timestamp) {
      return new Response('Missing signature or timestamp', { status: 401 });
    }

    const isValidRequest = verifyKey(
      body,
      signature,
      timestamp,
      env.DISCORD_PUBLIC_KEY
    );

    if (!isValidRequest) {
      return new Response('Invalid request signature', { status: 401 });
    }

    // 4. Interaction Logic
    const interaction = JSON.parse(body);

    // Discord Health Check (PING)
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

      if (command && command.execute) {
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
