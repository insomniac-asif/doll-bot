// Dropdown (select-menu) role pickers. Stores which roles belong to each menu
// so the handler can toggle them — add picked roles, remove unpicked ones.

import { getStore, saveStore } from '../store.js';
import { isEnabled } from './featureToggle.js';

function store(guildId) { return getStore('rolemenus', guildId, { menus: {}, nextId: 1 }); }

export function saveRoleMenu(guildId, roleIds) {
  const s = store(guildId);
  const id = String(s.nextId++);
  s.menus[id] = { roleIds };
  saveStore('rolemenus', guildId, s);
  return id;
}

export function getRoleMenu(guildId, menuId) {
  return store(guildId).menus[menuId] || null;
}

// Handle a dropdown selection. Returns true if it was a role-menu interaction.
export async function handleRoleMenuSelect(interaction) {
  if (!interaction.isStringSelectMenu?.()) return false;
  const [tag, menuId] = interaction.customId.split(':');
  if (tag !== 'doll_rolemenu') return false;

  if (!isEnabled(interaction.guild.id, 'roleMenus')) {
    await interaction.reply({ content: 'role menus are turned off here.', ephemeral: true });
    return true;
  }
  const menu = getRoleMenu(interaction.guild.id, menuId);
  if (!menu) {
    await interaction.reply({ content: 'this role menu is no longer active.', ephemeral: true });
    return true;
  }

  const picked = new Set(interaction.values); // role IDs the user selected
  const member = interaction.member;
  const added = [];
  const removed = [];

  for (const roleId of menu.roleIds) {
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) continue;
    const has = member.roles.cache.has(roleId);
    if (picked.has(roleId) && !has) {
      await member.roles.add(roleId).catch(() => {});
      added.push(role.name);
    } else if (!picked.has(roleId) && has) {
      await member.roles.remove(roleId).catch(() => {});
      removed.push(role.name);
    }
  }

  const parts = [];
  if (added.length) parts.push(`added: ${added.map(n => `@${n}`).join(', ')}`);
  if (removed.length) parts.push(`removed: ${removed.map(n => `@${n}`).join(', ')}`);
  await interaction.reply({
    content: parts.length ? parts.join(' • ') : 'no changes',
    ephemeral: true,
  });
  return true;
}
