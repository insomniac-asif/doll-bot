import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import { linkRole, unlinkRole } from '../features/reactionRoles.js';
import { resolveGifUrl } from '../features/media.js';

// Parse an emoji string into something usable for .react()
// Custom: <:name:id> or <a:name:id>  |  Unicode: 🎮
function parseEmoji(input) {
  const custom = input.match(/<a?:\w+:(\d+)>/);
  if (custom) return { reactable: input, isCustom: true, id: custom[1] };
  return { reactable: input, isCustom: false, id: null };
}

export default {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Create and manage reaction-role panels')
    .addSubcommand(sub =>
      sub.setName('create').setDescription('Post a reaction-role panel embed')
        .addChannelOption(o => o.setName('channel').setDescription('Where to post the panel').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Embed description (use \\n for new lines)').setRequired(true))
        .addStringOption(o => o.setName('gif').setDescription('GIF/image URL to show in the embed'))
        .addStringOption(o => o.setName('color').setDescription('Hex color, e.g. 7c3aed')))
    .addSubcommand(sub =>
      sub.setName('link').setDescription('Add an emoji → role mapping to a panel')
        .addStringOption(o => o.setName('message_id').setDescription('Message ID of the panel').setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji (unicode or custom)').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Role to grant').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('unlink').setDescription('Remove an emoji → role mapping')
        .addStringOption(o => o.setName('message_id').setDescription('Message ID of the panel').setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji to remove').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const channel = interaction.options.getChannel('channel');
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description').replace(/\\n/g, '\n');
      const gif = interaction.options.getString('gif');
      const color = interaction.options.getString('color');

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color ? parseInt(color.replace('#', ''), 16) : 0x7c3aed);
      const directGif = gif ? await resolveGifUrl(gif).catch(() => null) : null;
      if (directGif) embed.setImage(directGif);

      const msg = await channel.send({ embeds: [embed] });
      if (gif && !directGif) await channel.send(gif).catch(() => {});

      await interaction.reply({
        content: `Panel posted in <#${channel.id}>.\n**Message ID: \`${msg.id}\`**\nNow use \`/reactionrole link\` with this ID to attach emoji → role pairs.`,
        ephemeral: true,
      });
    }

    if (sub === 'link') {
      const messageId = interaction.options.getString('message_id');
      const emojiInput = interaction.options.getString('emoji');
      const role = interaction.options.getRole('role');

      // Find the panel message across the guild's text channels
      const message = await findMessage(interaction.guild, messageId);
      if (!message) return interaction.reply({ content: 'Could not find that message. Make sure the ID is correct and the panel was created with `/reactionrole create`.', ephemeral: true });

      const emoji = parseEmoji(emojiInput);
      try {
        await message.react(emoji.isCustom ? emoji.id : emoji.reactable);
      } catch (e) {
        return interaction.reply({ content: `Couldn't react with that emoji. If it's a custom emoji, it must be from a server I'm in. (${e.message})`, ephemeral: true });
      }

      const emojiObj = emoji.isCustom ? { id: emoji.id } : { name: emojiInput };
      linkRole(interaction.guild.id, messageId, message.channel.id, emojiObj, role.id);

      await interaction.reply({ content: `Linked ${emojiInput} → <@&${role.id}> on that panel.`, ephemeral: true });
    }

    if (sub === 'unlink') {
      const messageId = interaction.options.getString('message_id');
      const emojiInput = interaction.options.getString('emoji');
      const emoji = parseEmoji(emojiInput);
      const emojiObj = emoji.isCustom ? { id: emoji.id } : { name: emojiInput };
      unlinkRole(interaction.guild.id, messageId, emojiObj);
      await interaction.reply({ content: `Unlinked ${emojiInput} from that panel.`, ephemeral: true });
    }
  },
};

async function findMessage(guild, messageId) {
  const channels = guild.channels.cache.filter(c => c.isTextBased?.());
  for (const channel of channels.values()) {
    try {
      const msg = await channel.messages.fetch(messageId);
      if (msg) return msg;
    } catch {
      // not in this channel
    }
  }
  return null;
}
