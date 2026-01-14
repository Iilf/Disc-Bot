import { ping } from './commands/ping';

// This interface tracks your variables/secrets
export interface Env {
  DISCORD_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const interaction = await request.json() as any;

    // Handle the Discord "Ping" (System check)
    if (interaction.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Command Router
    if (interaction.data.name === 'ping') {
      const response = await ping.execute(interaction, env);
      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Unknown command', { status: 400 });
  },
};