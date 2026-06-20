import { getConfig, updateConfig } from '../config.js';

export function isModRole(guildId, roleId) {
  const config = getConfig(guildId);
  return config.modRoles.includes(roleId);
}

export function isMod(member) {
  if (member.permissions.has('Administrator')) return true;
  const config = getConfig(member.guild.id);
  return config.modRoles.some(r => member.roles.cache.has(r));
}

export function addModRole(guildId, roleId) {
  const config = getConfig(guildId);
  if (!config.modRoles.includes(roleId)) {
    config.modRoles.push(roleId);
    updateConfig(guildId, { modRoles: config.modRoles });
  }
}

export function removeModRole(guildId, roleId) {
  const config = getConfig(guildId);
  config.modRoles = config.modRoles.filter(r => r !== roleId);
  updateConfig(guildId, { modRoles: config.modRoles });
}

export function setAutoRole(guildId, roleId) {
  updateConfig(guildId, { autoRole: roleId });
}
