import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Routes,
  ChannelType,
  PermissionFlagsBits
} from 'discord.js';
import { REST } from '@discordjs/rest';

// ===================== ENV / SECRETS =====================
const {
  DISCORD_TOKEN,
  GUILD_ID,

  // Optional: if you already created #join-requests and know its ID
  JOIN_REQUESTS_CHANNEL_ID,

  // Role IDs (set via /listroles output)
  LEADER_ROLE_ID,
  COLEADER_ROLE_ID,
  ELDER_ROLE_ID,
  MEMBER_ROLE_ID,
  UNVERIFIED_ROLE_ID
} = process.env;

if (!DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN');

// ===================== CLIENT =====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

// ===================== SLASH COMMANDS =====================
const commands = [
  {
    name: 'setupreview',
    description: 'Post a sample join-review card (for testing).',
    default_member_permissions: PermissionFlagsBits.ManageRoles.toString()
  },
  {
    name: 'listroles',
    description: 'Show all role IDs in this server.',
    default_member_permissions: PermissionFlagsBits.Administrator.toString()
  },
  {
    name: 'setupserver',
    description: 'Create categories/channels with correct permissions.',
    default_member_permissions: PermissionFlagsBits.Administrator.toString()
  }
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  const app = await client.application.fetch();
  if (!GUILD_ID) {
    console.warn('[WARN] GUILD_ID not set — slash commands will not be registered to a guild.');
    return;
  }
  await rest.put(Routes.applicationGuildCommands(app.id, GUILD_ID), { body: commands });
  console.log('Slash commands registered for guild:', GUILD_ID);
}

// ===================== HELPERS =====================
function reviewButtons(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`accept_member:${userId}`).setLabel('Accept → Member').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`accept_elder:${userId}`).setLabel('Accept → Elder').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`accept_co:${userId}`).setLabel('Accept → Co-Leader').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`deny:${userId}`).setLabel('Deny (Kick)').setStyle(ButtonStyle.Danger)
  );
}

async function setRoles(member, addRoleId, removeUnverified = true) {
  if (removeUnverified && UNVERIFIED_ROLE_ID && member.roles.cache.has(UNVERIFIED_ROLE_ID)) {
    await member.roles.remove(UNVERIFIED_ROLE_ID).catch(() => {});
  }
  if (addRoleId && !member.roles.cache.has(addRoleId)) {
    await member.roles.add(addRoleId).catch(() => {});
  }
}

function allowMask(...perms) {
  return perms.reduce((acc, p) => acc | PermissionFlagsBits[p], 0n);
}
function denyMask(...perms) {
  return perms.reduce((acc, p) => acc | PermissionFlagsBits[p], 0n);
}

async function findOrCreateCategory(guild, name, overwrites) {
  let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase());
  if (cat) {
    if (overwrites) await cat.permissionOverwrites.set(overwrites).catch(() => {});
    return cat;
  }
  cat = await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites || [] });
  return cat;
}

async function findOrCreateText(guild, name, parentId, overwrites) {
  let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name.toLowerCase() === name.toLowerCase());
  if (ch) {
    if (parentId && ch.parentId !== parentId) await ch.setParent(parentId).catch(() => {});
    if (overwrites) await ch.permissionOverwrites.set(overwrites).catch(() => {});
    return ch;
  }
  return guild.channels.create({
    name, type: ChannelType.GuildText, parent: parentId || null, permissionOverwrites: overwrites || []
  });
}

async function findOrCreateVoice(guild, name, parentId, overwrites) {
  let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === name.toLowerCase());
  if (ch) {
    if (parentId && ch.parentId !== parentId) await ch.setParent(parentId).catch(() => {});
    if (overwrites) await ch.permissionOverwrites.set(overwrites).catch(() => {});
    return ch;
  }
  return guild.channels.create({
    name, type: ChannelType.GuildVoice, parent: parentId || null, permissionOverwrites: overwrites || []
  });
}

async function getJoinRequestsChannel(guild) {
  if (JOIN_REQUESTS_CHANNEL_ID) {
    const ch = await guild.channels.fetch(JOIN_REQUESTS_CHANNEL_ID).catch(() => null);
    if (ch) return ch;
  }
  return guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name.toLowerCase() === 'join-requests') || null;
}

async function postJoinCard(member) {
  const ch = await getJoinRequestsChannel(member.guild);
  if (!ch || ch.type !== ChannelType.GuildText) return;
  const embed = new EmbedBuilder()
    .setTitle('New Join Request')
    .setDescription(`${member} just joined.\n\nReview and choose a role:`)
    .addFields({ name: 'User', value: `${member.user.tag} (${member.id})` })
    .setTimestamp();
  await ch.send({ embeds: [embed], components: [reviewButtons(member.id)] });
}

// ===================== SERVER SETUP (channels & perms) =====================
async function setupServer(guild) {
  const everyone = guild.roles.everyone.id;

  if (!LEADER_ROLE_ID || !COLEADER_ROLE_ID || !MEMBER_ROLE_ID || !UNVERIFIED_ROLE_ID) {
    throw new Error('Missing role IDs. Set LEADER_ROLE_ID, COLEADER_ROLE_ID, MEMBER_ROLE_ID, UNVERIFIED_ROLE_ID in Secrets. Use /listroles to fetch them.');
    }

  // STAFF category (only Leader & Co-Leader can see)
  const staffOver = [
    { id: everyone, deny: denyMask('ViewChannel') },
    { id: LEADER_ROLE_ID, allow: allowMask('ViewChannel') },
    { id: COLEADER_ROLE_ID, allow: allowMask('ViewChannel') }
  ];
  const staff = await findOrCreateCategory(guild, 'STAFF', staffOver);

  // CLAN HQ category
  const clanHq = await findOrCreateCategory(guild, 'CLAN HQ');

  // #war-announcements — visible to all, only Leader & Co-Leader can send
  const warAnnOver = [
    { id: everyone, allow: allowMask('ViewChannel', 'ReadMessageHistory'), deny: denyMask('SendMessages') },
    { id: UNVERIFIED_ROLE_ID, allow: allowMask('ViewChannel'), deny: denyMask('SendMessages') },
    { id: LEADER_ROLE_ID, allow: allowMask('SendMessages', 'ViewChannel', 'ReadMessageHistory') },
    { id: COLEADER_ROLE_ID, allow: allowMask('SendMessages', 'ViewChannel', 'ReadMessageHistory') }
  ];
  await findOrCreateText(guild, 'war-announcements', clanHq.id, warAnnOver);

  // #war-chat — normal chat, Unverified hidden
  const warChatOver = [
    { id: everyone, allow: allowMask('ViewChannel', 'SendMessages', 'ReadMessageHistory') },
    { id: UNVERIFIED_ROLE_ID, deny: denyMask('ViewChannel') }
  ];
  await findOrCreateText(guild, 'war-chat', clanHq.id, warChatOver);

  // #base-links — Unverified hidden
  await findOrCreateText(guild, 'base-links', clanHq.id, warChatOver);

  // #recruiting — Unverified hidden
  await findOrCreateText(guild, 'recruiting', clanHq.id, warChatOver);

  // War VC — Unverified hidden
  const warVcOver = [
    { id: everyone, allow: allowMask('ViewChannel', 'Connect', 'Speak') },
    { id: UNVERIFIED_ROLE_ID, deny: denyMask('ViewChannel') }
  ];
  await findOrCreateVoice(guild, 'War VC', clanHq.id, warVcOver);

  // STAFF: #join-requests and #mod-log
  await findOrCreateText(guild, 'join-requests', staff.id, staffOver);
  await findOrCreateText(guild, 'mod-log', staff.id, staffOver);

  // #verify — Unverified can type; others read-only
  const verifyOver = [
    { id: everyone, allow: allowMask('ViewChannel', 'ReadMessageHistory'), deny: denyMask('SendMessages') },
    { id: UNVERIFIED_ROLE_ID, allow: allowMask('SendMessages', 'ViewChannel', 'ReadMessageHistory') },
    { id: LEADER_ROLE_ID, allow: allowMask('ViewChannel', 'ReadMessageHistory') },
    { id: COLEADER_ROLE_ID, allow: allowMask('ViewChannel', 'ReadMessageHistory') },
    { id: MEMBER_ROLE_ID, allow: allowMask('ViewChannel', 'ReadMessageHistory') },
    ...(ELDER_ROLE_ID ? [{ id: ELDER_ROLE_ID, allow: allowMask('ViewChannel', 'ReadMessageHistory') }] : [])
  ];
  await findOrCreateText(guild, 'verify', null, verifyOver);

  return true;
}

// ===================== EVENTS =====================
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try { await registerCommands(); } catch (e) { console.error('Command registration failed:', e); }
});

client.on('guildMemberAdd', async (member) => {
  if (GUILD_ID && member.guild.id !== GUILD_ID) return;
  if (UNVERIFIED_ROLE_ID && !member.roles.cache.has(UNVERIFIED_ROLE_ID)) {
    await member.roles.add(UNVERIFIED_ROLE_ID).catch(() => {});
  }
  await postJoinCard(member);
});

client.on('interactionCreate', async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'setupreview') {
        const me = await interaction.guild.members.fetch(interaction.user.id);
        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ ephemeral: true, content: 'You need Manage Roles to use this.' });
        }
        await interaction.reply({ ephemeral: true, content: 'Posting a sample review card…' });
        await postJoinCard(me);
        return;
      }

      if (interaction.commandName === 'listroles') {
        const roles = interaction.guild.roles.cache
          .sort((a, b) => b.position - a.position)
          .map(r => `${r.name} → \`${r.id}\``)
          .join('\n');
        return interaction.reply({ ephemeral: true, content: roles || 'No roles found.' });
      }

      if (interaction.commandName === 'setupserver') {
        const actor = await interaction.guild.members.fetch(interaction.user.id);
        if (!actor.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ ephemeral: true, content: 'You need Administrator to run /setupserver.' });
        }
        await interaction.reply({ ephemeral: true, content: 'Setting up categories & channels…' });
        try {
          await setupServer(interaction.guild);
          await interaction.followUp({ ephemeral: true, content: 'Done! Channels & permissions configured.' });
        } catch (e) {
          console.error(e);
          await interaction.followUp({ ephemeral: true, content: `Setup failed: ${e.message}` });
        }
        return;
      }
    }

    // Buttons (accept / deny)
    if (interaction.isButton()) {
      const actor = await interaction.guild.members.fetch(interaction.user.id);
      if (!actor.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({ ephemeral: true, content: 'You need Manage Roles to do that.' });
      }

      const [action, userId] = interaction.customId.split(':');
      const target = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!target) return interaction.reply({ ephemeral: true, content: 'User not found (may have left).' });

      if (action === 'accept_member') {
        await setRoles(target, MEMBER_ROLE_ID);
        await interaction.reply({ ephemeral: true, content: `✔️ Set ${target.user.tag} → Member` });
      } else if (action === 'accept_elder') {
        await setRoles(target, ELDER_ROLE_ID || MEMBER_ROLE_ID);
        await interaction.reply({ ephemeral: true, content: `✔️ Set ${target.user.tag} → Elder` });
      } else if (action === 'accept_co') {
        await setRoles(target, COLEADER_ROLE_ID);
        await interaction.reply({ ephemeral: true, content: `✔️ Set ${target.user.tag} → Co-Leader` });
      } else if (action === 'deny') {
        try {
          await target.kick('Denied on join by moderation');
          await interaction.reply({ ephemeral: true, content: `🛑 Kicked ${target.user.tag}` });
        } catch (err) {
          console.error('Kick failed:', err);
          await interaction.reply({ ephemeral: true, content: `Failed to kick ${target.user.tag}. Keeping Unverified.` });
        }
      }

      // Disable buttons after action
      try {
        const msg = await interaction.message.fetch();
        const disabledRows = msg.components.map(row => {
          const r = new ActionRowBuilder();
          row.components.forEach(c => r.addComponents(ButtonBuilder.from(c).setDisabled(true)));
          return r;
        });
        await msg.edit({ components: disabledRows });
      } catch {}
    }
  } catch (err) {
    console.error('Interaction error:', err);
    if (interaction.isRepliable()) {
      try { await interaction.reply({ ephemeral: true, content: 'Something went wrong.' }); } catch {}
    }
  }
});

// ===================== LOGIN =====================
client.login(DISCORD_TOKEN);
