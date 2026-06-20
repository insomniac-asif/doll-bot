import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
  console.error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required in .env');
  process.exit(1);
}

const commands = [];
const commandsPath = join(__dirname, 'commands');
const files = readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of files) {
  const { default: exported } = await import(`./commands/${file}`);
  const list = Array.isArray(exported) ? exported : [exported];
  for (const command of list) {
    commands.push(command.data.toJSON());
    console.log(`[Deploy] Loaded /${command.data.name}`);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

try {
  console.log(`[Deploy] Registering ${commands.length} command(s)...`);
  await rest.put(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
    { body: commands },
  );
  console.log('[Deploy] Commands registered globally. May take up to 1 hour to propagate.');
} catch (e) {
  console.error('[Deploy] Failed:', e);
  process.exit(1);
}
