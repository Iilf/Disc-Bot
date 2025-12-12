import { verifyKey } from "discord-interactions";

// Dynamically import all command modules
const commandModules = import.meta.glob("./commands/*.js", { eager: true });

const commands = {};
for (const path in commandModules) {
  const mod = commandModules[path];
  if (mod.default && mod.default.data && mod.default.execute) {
    commands[mod.default.data.name] = mod.default;
  }
}

export default {
  async fetch(request, env) {
    const bodyArray = await request.clone().arrayBuffer();
    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const rawBody = new TextDecoder().decode(bodyArray);

    // Verify Discord request
    const isValid = verifyKey(rawBody, signature, timestamp, env.DISCORD_PUBLIC_KEY);
    if (!isValid) return new Response("Invalid request signature", { status: 401 });

    const json = JSON.parse(rawBody);

    // Respond to Discord ping (type 1)
    if (json.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle slash commands (type 2)
    if (json.type === 2) {
      const cmdName = json.data.name;
      let response;

      if (commands[cmdName]) {
        // Pass interaction and env for variables or KV
        response = await commands[cmdName].execute(json, env);
      } else {
        response = {
          type: 4,
          data: { content: "Unknown command" },
        };
      }

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not handled", { status: 400 });
  },
};
