import { getConfig } from '../config.js';

// Handles the "Verify" button click. Custom ID: 'doll_verify'
export async function handleVerifyButton(interaction) {
  if (interaction.customId !== 'doll_verify') return false;

  const config = getConfig(interaction.guild.id);
  if (!config.verification.enabled || !config.verification.role) {
    await interaction.reply({ content: 'Verification is not configured on this server.', ephemeral: true });
    return true;
  }

  try {
    const member = interaction.member;
    if (member.roles.cache.has(config.verification.role)) {
      await interaction.reply({ content: 'You are already verified.', ephemeral: true });
      return true;
    }
    await member.roles.add(config.verification.role);
    await interaction.reply({ content: '✅ You have been verified. Welcome!', ephemeral: true });
  } catch (e) {
    console.error('[Verification] Failed:', e.message);
    await interaction.reply({ content: 'I could not assign the verified role. Check my permissions.', ephemeral: true });
  }
  return true;
}
