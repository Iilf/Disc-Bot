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

type CommandHandler = {
  execute: (interaction: any, env: Env) => Promise<any> | any;
};

const commands: Record<string, CommandHandler> = {
  ping: ping,
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // DEBUG PATH: Visit your-worker.url/test-config in your browser
    if (url.pathname === '/test-config') {
      const keyStatus = env.DISCORD_PUBLIC_KEY
        ? `Loaded (Starts with: ${env.DISCORD_PUBLIC_KEY.substring(0, 5)}...)`
        : 'NOT FOUND';
      return new Response(`Worker Name: dc-bot\nPublic Key Status: ${keyStatus}`, {
        status: 200,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Bot is online! Use POST for interactions.', {
        status: 200,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      });
    }

    // Security headers
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.text();

    if (!env.DISCORD_PUBLIC_KEY) {
      return new Response('Missing Public Key Configuration', { status: 500 });
    }

    if (!signature || !timestamp) {
      return new Response('Missing signature or timestamp', { status: 401 });
    }

    // Replay protection: ensure the timestamp is recent (5 minutes)
    // Discord sends timestamp as seconds string
    const ts = parseInt(timestamp, 10);
    if (Number.isFinite(ts)) {
      const now = Date.now();
      const ageMs = Math.abs(now - ts * 1000);
      const maxAgeMs = 5 * 60 * 1000; // 5 minutes
      if (ageMs > maxAgeMs) {
        return new Response('Stale request timestamp', { status: 401 });
      }
    }

    const isValidRequest = verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
    if (!isValidRequest) {
      return new Response('Invalid request signature', { status: 401 });
    }

    let interaction: any;
    try {
      interaction = JSON.parse(body);
    } catch (err) {
      console.error('Failed to parse interaction body:', err);
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    // Discord Health Check (PING)
    if (interaction.type === InteractionType.PING) {
      return new Response(JSON.stringify({ type: InteractionResponseType.PONG }), {
        headers: JSON_HEADERS,
      });
    }

    // Handle Application Commands
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const commandName = interaction.data?.name;
      const command = commandName ? commands[commandName] : undefined;

      if (command && typeof command.execute === 'function') {
        try {
          let result = await command.execute(interaction, env);

          // If the command returned a plain string, wrap it in the standard response
          if (typeof result === 'string') {
            result = {
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { content: result },
            };
          }

          // If the command returned only a data object, wrap it
          if (result && !result.type && result.data) {
            result = {
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: result.data,
            };
          }

          // Ensure we return a valid JSON response
          return new Response(JSON.stringify(result), {
            headers: JSON_HEADERS,
          });
        } catch (error) {
          console.error('Command execution error:', error);
          return new Response(
            JSON.stringify({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { content: 'Error executing command.' },
            }),
            { headers: JSON_HEADERS }
          );
        }
      } else {
        return new Response(
          JSON.stringify({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: `Unknown command: ${commandName}` },
          }),
          { headers: JSON_HEADERS }
        );
      }
    }

    return new Response(JSON.stringify({ error: 'Unknown interaction' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  },
};
