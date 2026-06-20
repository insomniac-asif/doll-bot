import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getConfig } from '../config.js';
import { getStore, saveStore } from '../store.js';
import { isEnabled } from './featureToggle.js';

// Join-to-create: when a member joins the configured hub channel, spin up a
// personal voice channel and move them into it. Delete it when it empties.
export async function handleVoiceState(oldState, newState) {
  const guild = newState.guild;
  if (!isEnabled(guild.id, 'tempVoice')) return;
  const config = getConfig(guild.id);
  const hub = config.tempVoice.hub;
  if (!hub) return;

  const store = getStore('tempvoice', guild.id, { channels: {} });

  // Created a channel for someone who joined the hub
  if (newState.channelId === hub) {
    try {
      const member = newState.member;
      const channel = await guild.channels.create({
        name: `${member.displayName}'s channel`,
        type: ChannelType.GuildVoice,
        parent: config.tempVoice.category || newState.channel.parentId || null,
        permissionOverwrites: [
          { id: member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
        ],
      });
      store.channels[channel.id] = member.id;
      saveStore('tempvoice', guild.id, store);
      await member.voice.setChannel(channel).catch(() => {});
    } catch (e) {
      console.error('[TempVoice] Failed to create channel:', e.message);
    }
  }

  // Clean up an emptied temp channel
  if (oldState.channelId && store.channels[oldState.channelId]) {
    const oldChannel = guild.channels.cache.get(oldState.channelId);
    if (oldChannel && oldChannel.members.size === 0) {
      delete store.channels[oldState.channelId];
      saveStore('tempvoice', guild.id, store);
      await oldChannel.delete().catch(() => {});
    }
  }
}
