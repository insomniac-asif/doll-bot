// Central tool registry for Doll's AI function-calling system.
// Tools self-register at import time. Multi-server safe — every execute()
// receives { guild, channel, member, client } context.

const tools = new Map();

export const PermLevel = {
  READ: 'read',       // Anyone can use
  MOD: 'mod',         // Mod role, Admin, or Guild Owner
  ADMIN: 'admin',     // Administrator permission, Guild Owner, or Bot Owner
  OWNER: 'owner',     // Guild owner only (or OWNER_ID env var)
};

/**
 * Register a tool.
 * @param {string} name - Unique tool name (snake_case)
 * @param {object} opts
 * @param {string} opts.category - channel | role | member | mod | server | invite | music | info | voice | utility
 * @param {string} opts.description - Shown to AI so it knows when/how to use the tool
 * @param {object} opts.parameters - JSON Schema (OpenAI function-calling format)
 * @param {function} opts.execute - async (params, ctx) => string
 * @param {string} [opts.permLevel='read'] - Required permission level
 */
export function registerTool(name, { category, description, parameters, execute, permLevel = PermLevel.READ, confirm = false, preview = null }) {
  if (tools.has(name)) {
    console.warn(`[ToolRegistry] Duplicate tool name "${name}" — overwriting`);
  }
  // confirm: require a Confirm/Cancel button before running (destructive/high-impact)
  // preview: optional (params, ctx) => string spelling out exactly what will happen
  tools.set(name, { name, category, description, parameters, execute, permLevel, confirm, preview });
}

export function getTool(name) {
  return tools.get(name) || null;
}

export function getAllTools() {
  return [...tools.values()];
}

/**
 * Returns tool definitions in OpenAI function-calling format.
 * @param {string|string[]|null} category - Filter by category name, an array of
 *        category names, or null for all.
 */
export function getToolDefinitions(category = null) {
  let list = [...tools.values()];
  if (Array.isArray(category)) {
    const set = new Set(category);
    list = list.filter(t => set.has(t.category));
  } else if (category) {
    list = list.filter(t => t.category === category);
  }
  return list.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters || { type: 'object', properties: {} },
    },
  }));
}

export function getToolCount() {
  return tools.size;
}
