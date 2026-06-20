// Application / form system. Admins define an application (a list of questions
// + a review channel). Members apply; Doll DMs the questions one at a time,
// collects answers, and posts the submission to the review channel with
// Accept/Deny buttons.

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getStore, saveStore } from '../store.js';
import { getAccent } from '../config.js';

function store(guildId) { return getStore('applications', guildId, { defs: {}, submissions: [], nextSubId: 1 }); }

export function createApplication(guildId, name, questions, reviewChannelId, acceptRoleId = null) {
  const s = store(guildId);
  s.defs[name.toLowerCase()] = { name, questions, reviewChannelId, acceptRoleId };
  saveStore('applications', guildId, s);
  return s.defs[name.toLowerCase()];
}

export function getApplication(guildId, name) { return store(guildId).defs[name.toLowerCase()] || null; }
export function listApplications(guildId) { return Object.values(store(guildId).defs); }
export function deleteApplication(guildId, name) {
  const s = store(guildId);
  if (!s.defs[name.toLowerCase()]) return false;
  delete s.defs[name.toLowerCase()];
  saveStore('applications', guildId, s);
  return true;
}

const activeFlows = new Set(); // `${guildId}:${userId}` to prevent double-apply

// Run the DM question flow. Not awaited by callers — fire and forget.
export async function runApplication(member, appName, client) {
  const guild = member.guild;
  const def = getApplication(guild.id, appName);
  if (!def) return { error: `there's no application called "${appName}"` };

  const flowKey = `${guild.id}:${member.id}`;
  if (activeFlows.has(flowKey)) return { error: 'you\'re already in the middle of an application — check your DMs' };

  let dm;
  try {
    dm = await member.createDM();
    await dm.send(`📝 starting your **${def.name}** application for ${guild.name}. answer each question — you have 5 minutes each. type \`cancel\` to stop.`);
  } catch {
    return { error: 'i couldn\'t DM you — open your DMs and try again' };
  }

  activeFlows.add(flowKey);
  (async () => {
    const answers = [];
    try {
      for (let i = 0; i < def.questions.length; i++) {
        await dm.send(`**Q${i + 1}/${def.questions.length}:** ${def.questions[i]}`);
        const collected = await dm.awaitMessages({
          filter: m => m.author.id === member.id,
          max: 1, time: 5 * 60 * 1000, errors: ['time'],
        });
        const ans = collected.first().content;
        if (ans.trim().toLowerCase() === 'cancel') { await dm.send('cancelled — no worries.'); return; }
        answers.push({ q: def.questions[i], a: ans });
      }
      await submitApplication(guild, member, def, answers);
      await dm.send('✅ submitted! staff will review it and get back to you. thanks!');
    } catch {
      await dm.send('⏳ you ran out of time on that question — start over when you\'re ready.').catch(() => {});
    } finally {
      activeFlows.delete(flowKey);
    }
  })();

  return { started: true };
}

async function submitApplication(guild, member, def, answers) {
  const s = store(guild.id);
  const id = s.nextSubId++;
  s.submissions.push({ id, appName: def.name, applicantId: member.id, answers, status: 'pending' });
  saveStore('applications', guild.id, s);

  const ch = await guild.channels.fetch(def.reviewChannelId).catch(() => null);
  if (!ch?.isTextBased?.()) return;

  const embed = new EmbedBuilder()
    .setColor(getAccent(guild.id))
    .setAuthor({ name: `${member.user.username} (${member.id})`, iconURL: member.user.displayAvatarURL() })
    .setTitle(`${def.name} application #${id}`)
    .setTimestamp();
  for (const { q, a } of answers) embed.addFields({ name: q.substring(0, 256), value: (a || '—').substring(0, 1024) });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`doll_app_accept:${id}`).setLabel('Accept').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`doll_app_deny:${id}`).setLabel('Deny').setStyle(ButtonStyle.Danger).setEmoji('✖️'),
  );
  await ch.send({ embeds: [embed], components: [row] });
}

// Handle Accept/Deny buttons on a submission.
export async function handleApplicationButton(interaction) {
  const [action, id] = interaction.customId.split(':');
  if (action !== 'doll_app_accept' && action !== 'doll_app_deny') return false;

  // Staff only
  if (!interaction.member?.permissions?.has?.('ManageRoles')) {
    await interaction.reply({ content: 'only staff can review applications.', ephemeral: true });
    return true;
  }

  const s = store(interaction.guild.id);
  const sub = s.submissions.find(x => x.id === Number(id));
  if (!sub) {
    await interaction.reply({ content: 'that application is no longer on file.', ephemeral: true });
    return true;
  }

  const accepted = action === 'doll_app_accept';
  sub.status = accepted ? 'accepted' : 'denied';
  saveStore('applications', interaction.guild.id, s);

  // Update the embed
  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(accepted ? 0x57f287 : 0xed4245)
    .setFooter({ text: `${accepted ? 'Accepted' : 'Denied'} by ${interaction.user.username}` });
  await interaction.update({ embeds: [embed], components: [] });

  // Apply accept role + notify applicant
  const applicant = await interaction.guild.members.fetch(sub.applicantId).catch(() => null);
  if (applicant) {
    const def = getApplication(interaction.guild.id, sub.appName);
    if (accepted && def?.acceptRoleId) await applicant.roles.add(def.acceptRoleId).catch(() => {});
    await applicant.send(`your **${sub.appName}** application for ${interaction.guild.name} was **${accepted ? 'accepted ✅' : 'denied'}**.`).catch(() => {});
  }
  return true;
}
