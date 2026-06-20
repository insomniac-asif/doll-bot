// Import every command/feature/event module to catch missing exports and
// bad imports without actually logging in to Discord.
import { readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import { join } from 'path';

const dirs = ['src/commands', 'src/features', 'src/events', 'src/skills'];
let failed = 0;
let loaded = 0;

for (const dir of dirs) {
  for (const file of readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const full = join(process.cwd(), dir, file);
    try {
      const mod = await import(pathToFileURL(full).href);
      loaded++;
      if (dir === 'src/commands') {
        const exported = mod.default;
        const list = Array.isArray(exported) ? exported : [exported];
        for (const cmd of list) {
          if (!cmd?.data?.name || typeof cmd.execute !== 'function') {
            console.error(`  BAD COMMAND SHAPE: ${dir}/${file}`);
            failed++;
          }
        }
      }
    } catch (e) {
      console.error(`  IMPORT FAIL: ${dir}/${file}\n    ${e.message}`);
      failed++;
    }
  }
}

console.log(`\nLoaded ${loaded} modules, ${failed} failure(s).`);
process.exit(failed ? 1 : 0);
