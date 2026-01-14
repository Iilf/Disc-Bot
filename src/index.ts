import { verifyKey } from 'discord-interactions';
import { InteractionType, InteractionResponseType } from 'discord-api-types/v10';
import ping from './commands/ping'; 

export interface Env {
  DISCORD_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  SUPPORT_SERVER: string;
}

const commands: Record<string, any> = {
  ping: ping,
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. REGISTRATION ENDPOINT
    // Visit your-worker.url/register in a browser to update your commands
    if (url.pathname === '/register') {
      try {
        const response = await fetch(
          `https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/commands`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bot ${env.DISCORD_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify([
              { name: 'ping', description: 'Replies with Pong!' }
            ]),
          }
        );
        const data = await response.text();
        return new Response(`Registration response: ${data}`, { status: response.status });
      } catch (e: any) {
        return new Response(`Error: ${e.message}`, { status: 500 });
      }
    }

    // 2. DISCORD INTERACTION HANDLING
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.text();

    const isValidRequest =
      signature &&
      timestamp &&
      verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);

    if (!isValidRequest) {
      return new Response('Invalid request signature', { status: 401 });
    }

    const interaction = JSON.parse(body);

    if (interaction.type === InteractionType.Ping) {
      return new Response(JSON.stringify({ type: InteractionResponseType.Pong }), {
        headers: { 'content-type': 'application/json' },
      });
    }

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
          return new Response(
            JSON.stringify({
              type: InteractionResponseType.ChannelMessageWithSource,
              data: { content: 'There was an error executing this command.' },
            }),
            { headers: { 'content-type': 'application/json' } }
          );
        }
      }
    }

    return new Response('Unknown Interaction', { status: 400 });
  },
};