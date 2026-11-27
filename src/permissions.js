import { ChannelType, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from './store.js';
import {
  configureRegistrationChannel,
  prepareGuildRegistrationReset,
  refreshRegistrationPanel,
  resetGuildRegistrations
} from './registration.js';

const FLAGS = PermissionFlagsBits;
const ADMIN_CATEGORY_NAMES = new Set(['administracao', 'admin', 'moderacao', 'staff']);
const MANAGER_NAMES = new Set(['proprietario', 'gerhost', 'gerdiscord', 'gerserver']);
const LOG_MANAGER_NAMES = new Set(['proprietario', 'gerdiscord', 'gerserver']);
const PLATFORM_NAMES = new Set(['pc', 'mobile', 'console']);
const SERVICE_NAMES = new Set(['bot', 'asthinho', 'loritta', 'disboardorg']);
const ROLE_LOCKS = {
  UseApplicationCommands: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  SendMessagesInThreads: false,
  MentionEveryone: false,
  SendTTSMessages: false,
  SendPolls: false,
  UseExternalApps: false
};
const REASON = 'ASTHEN: política central de acesso por cargo 2.25.0';

export function normalizePermissionName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function classifyPermissionRole(value) {
  const name = normalizePermissionName(typeof value === 'string' ? value : value?.name);
  if (name === 'membro') return 'member';
  if (PLATFORM_NAMES.has(name)) return 'platform';
  if (MANAGER_NAMES.has(name)) return 'manager';
  if (name === 'staff') return 'staff';
  if (SERVICE_NAMES.has(name)) return 'service';
  if (name === 'booster') return 'booster';
  if (name.startsWith('ping')) return 'ping';
  return 'other';
}

export function classifyPermissionChannel({
  name,
  topic = '',
  parentName = '',
  channelId = '',
  registrationChannelId = ''
}) {
  const channel = normalizePermissionName(name);
  const parent = normalizePermissionName(parentName);
  if (channelId && registrationChannelId && channelId === registrationChannelId) return 'registration';
  if (channel === 'registro') return 'registration';
  if (channel === 'videosnovos') return 'video-feed';
  if (String(topic || '').startsWith('ASTHEN|type:')) return 'ticket';
  if (channel === 'logs') return 'logs';
  if (channel === 'comandosadm') return 'admin-command';
  if (channel === 'chatstaff' || channel === 'punicoes') return 'staff';
  if (ADMIN_CATEGORY_NAMES.has(parent)) return 'admin';
  return 'member';
}

export function ticketOwnerId(channel) {
  const match = String(channel?.topic || '').match(/(?:^|\|)owner:(\d{17,20})(?:\||$)/);
  return match ? match[1] : null;
}

function roleGroups(guild, memberRole, config) {
  const roles = [...guild.roles.cache.values()].filter(role => role.id !== guild.roles.everyone.id);
  const platform = roles.filter(role => PLATFORM_NAMES.has(normalizePermissionName(role.name)));
  const managers = roles.filter(role => MANAGER_NAMES.has(normalizePermissionName(role.name)));
  const staff = roles.filter(role =>
    MANAGER_NAMES.has(normalizePermissionName(role.name)) || normalizePermissionName(role.name) === 'staff'
  );
  const services = roles.filter(role => SERVICE_NAMES.has(normalizePermissionName(role.name)));
  const pings = roles.filter(role => normalizePermissionName(role.name).startsWith('ping'));
  const boosters = roles.filter(role => normalizePermissionName(role.name) === 'booster');

  if (config.staffRoleId) {
    const configuredStaff = guild.roles.cache.get(config.staffRoleId);
    if (configuredStaff && !staff.some(role => role.id === configuredStaff.id)) staff.push(configuredStaff);
  }

  const unique = items => [...new Map(items.map(role => [role.id, role])).values()];
  return {
    roles,
    platform,
    managers: unique(managers),
    staff: unique(staff),
    services,
    pings,
    boosters,
    logsManagers: roles.filter(role => LOG_MANAGER_NAMES.has(normalizePermissionName(role.name))),
    member: memberRole
  };
}

function isCategory(channel) {
  return channel.type === ChannelType.GuildCategory;
}

function isVoiceChannel(channel) {
  return channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;
}

function overwriteMatches(overwrite, permissions) {
  for (const [name, value] of Object.entries(permissions)) {
    const flag = FLAGS[name];
    if (!flag) continue;
    const allowed = Boolean(overwrite?.allow?.has?.(flag));
    const denied = Boolean(overwrite?.deny?.has?.(flag));
    if (value === true && !allowed) return false;
    if (value === false && !denied) return false;
    if (value === null && (allowed || denied)) return false;
  }
  return true;
}

async function editOverwrite(channel, targetId, permissions, counters) {
  const existing = channel.permissionOverwrites.cache.get(targetId);
  if (overwriteMatches(existing, permissions)) return;
  await channel.permissionOverwrites.edit(targetId, permissions, REASON);
  counters.updated += 1;
}

function channelScope(channel, guild, config) {
  const parent = channel.parentId ? guild.channels.cache.get(channel.parentId) : null;
  return classifyPermissionChannel({
    name: channel.name,
    topic: channel.topic,
    parentName: parent?.name || '',
    channelId: channel.id,
    registrationChannelId: config.registrationChannelId
  });
}

function channelPlan(guild, config, memberRole, channels) {
  const groups = roleGroups(guild, memberRole, config);
  const categories = channels.filter(isCategory);
  const channelEntries = channels
    .filter(channel => !isCategory(channel) && channel.permissionOverwrites?.edit)
    .map(channel => ({ channel, scope: channelScope(channel, guild, config) }));
  const count = scope => channelEntries.filter(entry => entry.scope === scope).length;
  return {
    groups,
    categories,
    channelEntries,
    summary: {
      roleCount: groups.roles.length,
      platformRoles: groups.platform.map(role => role.name),
      staffRoles: groups.staff.map(role => role.name),
      managerRoles: groups.managers.map(role => role.name),
      serviceRoles: groups.services.map(role => role.name),
      boosterRoles: groups.boosters.map(role => role.name),
      pingRoles: groups.pings.map(role => role.name),
      categoryCount: categories.length,
      registrationChannels: count('registration'),
      memberChannels: count('member'),
      staffChannels: count('staff'),
      adminChannels: count('admin') + count('admin-command') + count('logs'),
      protectedTickets: count('ticket'),
      videoFeedChannels: count('video-feed'),
      registrationChannelName: channels.find(channel =>
        channel.id === config.registrationChannelId)?.name || '📝・registro'
    }
  };
}

function findMemberRole(guild, config, memberRoleId = null) {
  const candidates = [
    memberRoleId ? guild.roles.cache.get(memberRoleId) : null,
    config.memberRoleId ? guild.roles.cache.get(config.memberRoleId) : null,
    ...guild.roles.cache.values()
  ];
  return candidates.find(role =>
    role && role.id !== guild.roles.everyone.id && normalizePermissionName(role.name) === 'membro'
  ) || null;
}

function elevatedBypassRoles(groups) {
  const trustedManagers = new Set(groups.managers.map(role => role.id));
  const protectedFlags = [
    FLAGS.Administrator,
    FLAGS.ManageGuild,
    FLAGS.ManageRoles,
    FLAGS.ManageChannels
  ].filter(Boolean);
  return groups.roles.filter(role =>
    !trustedManagers.has(role.id)
    && protectedFlags.some(flag => role.permissions?.has?.(flag))
  );
}

export async function analyzeGuildPermissionSetup(guild, memberRoleId = null) {
  await guild.roles.fetch();
  await guild.channels.fetch();
  const config = getGuildConfig(guild.id);
  const memberRole = findMemberRole(guild, config, memberRoleId);
  if (!memberRole) {
    throw new Error('Não encontrei o cargo Membro. Selecione o cargo correto no campo do comando.');
  }
  const registrationChannel = (config.registrationChannelId
      ? guild.channels.cache.get(config.registrationChannelId)
      : null)
    || [...guild.channels.cache.values()].find(channel =>
      !isCategory(channel) && normalizePermissionName(channel.name) === 'registro');
  const registrationChannelId = registrationChannel?.id || null;
  const plan = channelPlan(guild, { ...config, registrationChannelId }, memberRole,
    [...guild.channels.cache.values()]);
  const groups = plan.groups;
  const dangerousRoles = elevatedBypassRoles(groups);
  return {
    ...plan.summary,
    registrationChannelName: registrationChannel?.name || 'será criado em 👋 Entrada',
    willCreateRegistrationChannel: !registrationChannel,
    unknownRoles: groups.roles
      .filter(role => classifyPermissionRole(role) === 'other')
      .map(role => role.name),
    dangerousRoles: dangerousRoles.map(role => role.name),
    everyonePolicy: 'Somente o canal de registro',
    platformPolicy: 'PC, Mobile e Console são apenas identificação e não liberam canais'
  };
}

function getAllowedRoles(scope, groups, config) {
  if (scope === 'logs') return groups.logsManagers;
  if (scope === 'admin-command') return [...groups.managers, ...groups.staff];
  if (scope === 'admin') return groups.managers;
  if (scope === 'staff') return groups.staff;
  if (scope === 'registration') {
    const bypass = (config.registrationBypassRoleIds || [])
      .map(id => groups.roles.find(role => role.id === id))
      .filter(Boolean);
    return [...groups.staff, ...bypass];
  }
  if (scope === 'member') return [...groups.staff, ...groups.services, groups.member];
  return [];
}

async function clearUserOverwrites(channel, guild, scope, botMember, memberRole, groups) {
  for (const overwrite of [...channel.permissionOverwrites.cache.values()]) {
    if (overwrite.type !== 1 || overwrite.id === botMember.id) continue;

    if (scope === 'ticket') {
      const ownerId = ticketOwnerId(channel);
      if (overwrite.id === ownerId) {
        const owner = guild.members.cache.get(ownerId)
          || await guild.members.fetch(ownerId).catch(() => null);
        const registered = Boolean(owner && (
          owner.roles.cache.has(memberRole.id)
          || owner.permissions.has(FLAGS.Administrator)
          || owner.permissions.has(FLAGS.ManageGuild)
          || groups.staff.some(role => owner.roles.cache.has(role.id))
        ));
        await editOverwrite(channel, overwrite.id, {
          ViewChannel: registered,
          ReadMessageHistory: true,
          SendMessages: registered,
          AttachFiles: registered,
          EmbedLinks: registered,
          UseApplicationCommands: false
        }, { updated: 0 });
        continue;
      }

      const target = guild.members.cache.get(overwrite.id)
        || await guild.members.fetch(overwrite.id).catch(() => null);
      const trusted = target && (
        target.permissions.has(FLAGS.Administrator)
        || target.permissions.has(FLAGS.ManageGuild)
        || groups.staff.some(role => target.roles.cache.has(role.id))
      );
      await editOverwrite(channel, overwrite.id, {
        ViewChannel: trusted ? null : false,
        UseApplicationCommands: false
      }, { updated: 0 });
      continue;
    }

    // A direct member allow can override @everyone and role denies. Remove it
    // everywhere except the ticket-owner exception handled above.
    await editOverwrite(channel, overwrite.id, {
      ViewChannel: null,
      UseApplicationCommands: false
    }, { updated: 0 });
  }
}

async function restrictAllRoleOverwrites(channel, guild, groups, counters) {
  for (const role of groups.roles) {
    await editOverwrite(channel, role.id, {
      ViewChannel: false,
      UseApplicationCommands: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
      SendMessagesInThreads: false
    }, counters);
  }
}

async function allowBotMember(channel, botMember, counters) {
  if (botMember.permissions.has(FLAGS.Administrator)) return;
  const permissions = { ViewChannel: true, ReadMessageHistory: true };
  if (!isCategory(channel) && !isVoiceChannel(channel)) {
    permissions.SendMessages = true;
    permissions.SendMessagesInThreads = true;
    permissions.AttachFiles = true;
    permissions.EmbedLinks = true;
    permissions.ManageMessages = true;
  } else if (isVoiceChannel(channel)) {
    permissions.Connect = true;
    permissions.Speak = true;
  }
  await editOverwrite(channel, botMember.id, permissions, counters);
}

async function setRolesForChannel(channel, scope, groups, config, counters) {
  const roles = groups.roles;
  const allowed = getAllowedRoles(scope, groups, config);
  const allowedIds = new Set(allowed.map(role => role.id));

  // Every role starts denied. Only the explicitly allowed group receives an
  // allow below, so platform, ping, booster and unknown roles cannot leak access.
  for (const role of roles) {
    if (role.id === groups.member.id && (scope === 'member' || scope === 'video-feed')) continue;
    if (allowedIds.has(role.id)) continue;
    await editOverwrite(channel, role.id, {
      ViewChannel: false,
      UseApplicationCommands: false,
      SendMessages: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
      SendMessagesInThreads: false
    }, counters);
  }

  if (scope === 'registration') {
    for (const role of allowed) {
      if (role.permissions.has(FLAGS.Administrator)) continue;
      await editOverwrite(channel, role.id, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: false,
        UseApplicationCommands: false
      }, counters);
    }
    for (const roleId of config.registrationBypassRoleIds || []) {
      const role = groups.roles.find(item => item.id === roleId);
      if (!role || role.id === groups.member.id) continue;
      await editOverwrite(channel, role.id, { ViewChannel: true, ReadMessageHistory: true }, counters);
    }
    return;
  }

  if (scope === 'logs') {
    for (const role of allowed) {
      if (role.permissions.has(FLAGS.Administrator)) continue;
      await editOverwrite(channel, role.id, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: false,
        UseApplicationCommands: false
      }, counters);
    }
    return;
  }

  if (scope === 'admin-command') {
    for (const role of allowed) {
      if (role.permissions.has(FLAGS.Administrator)) continue;
      await editOverwrite(channel, role.id, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        AddReactions: true,
        UseApplicationCommands: true
      }, counters);
    }
    return;
  }

  if (scope === 'staff' || scope === 'admin') {
    for (const role of allowed) {
      if (role.permissions.has(FLAGS.Administrator)) continue;
      await editOverwrite(channel, role.id, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        AddReactions: true,
        UseApplicationCommands: false,
        ...ROLE_LOCKS
      }, counters);
    }
    return;
  }

  if (scope === 'video-feed') {
    const viewers = [...groups.managers, ...groups.staff, groups.member];
    for (const role of viewers) {
      if (role.permissions.has(FLAGS.Administrator)) continue;
      await editOverwrite(channel, role.id, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: false,
        AddReactions: true,
        UseExternalEmojis: true,
        UseExternalStickers: true,
        UseApplicationCommands: false,
        ...ROLE_LOCKS
      }, counters);
    }
    return;
  }

  if (scope === 'ticket') {
    for (const role of groups.staff) {
      if (role.permissions.has(FLAGS.Administrator)) continue;
      await editOverwrite(channel, role.id, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        AddReactions: true,
        AttachFiles: true,
        EmbedLinks: true,
        UseApplicationCommands: false,
        ...ROLE_LOCKS
      }, counters);
    }
    return;
  }

  const memberPermissions = isVoiceChannel(channel)
    ? { ViewChannel: true, Connect: true, Speak: true, UseVAD: true, UseApplicationCommands: false }
    : {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        AddReactions: true,
        UseExternalEmojis: true,
        UseExternalStickers: true,
        EmbedLinks: true,
        AttachFiles: false,
        UseApplicationCommands: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        SendMessagesInThreads: false,
        MentionEveryone: false,
        SendTTSMessages: false,
        SendPolls: false,
        UseExternalApps: false,
        ManageThreads: false
      };
  await editOverwrite(channel, groups.member.id, memberPermissions, counters);

  for (const role of [...groups.staff, ...groups.services]) {
    if (role.permissions.has(FLAGS.Administrator)) continue;
    await editOverwrite(channel, role.id, {
      ViewChannel: true,
      ReadMessageHistory: true,
      SendMessages: true,
      AddReactions: true,
      EmbedLinks: true,
      AttachFiles: role.type === 0,
      UseApplicationCommands: false,
      ...ROLE_LOCKS
    }, counters);
  }
}

export async function configureGuildPermissions(guild, memberRole, {
  resetRegistrations = true
} = {}) {
  if (!memberRole || normalizePermissionName(memberRole.name) !== 'membro') {
    throw new Error('Selecione o cargo chamado Membro.');
  }
  if (memberRole.managed || memberRole.id === guild.roles.everyone.id) {
    throw new Error('O cargo Membro precisa ser um cargo normal, não gerenciado.');
  }

  await guild.roles.fetch();
  await guild.channels.fetch();
  const config = getGuildConfig(guild.id);
  const botMember = guild.members.me || await guild.members.fetchMe();
  if (!botMember.permissions.has(FLAGS.ManageChannels) || !botMember.permissions.has(FLAGS.ManageRoles)) {
    throw new Error('O bot precisa de Gerenciar canais e Gerenciar cargos.');
  }
  if (!botMember.roles.highest || botMember.roles.highest.comparePositionTo(memberRole) <= 0) {
    throw new Error('Coloque o cargo do bot acima de Membro na hierarquia do servidor.');
  }

  const groups = roleGroups(guild, memberRole, config);
  const bypassRoles = elevatedBypassRoles(groups);
  if (bypassRoles.length) {
    throw new Error(
      'Não apliquei nada: estes cargos têm Administrador e ignorariam o bloqueio de canais/comandos: ' +
      bypassRoles.map(role => role.name).join(', ') +
      '. Remova Administrador deles ou mantenha somente nos cargos de gerência confiáveis.'
    );
  }

  let resetPlan = null;
  if (resetRegistrations) {
    resetPlan = await prepareGuildRegistrationReset(guild, memberRole);
  }

  let registrationChannel = (config.registrationChannelId
      ? guild.channels.cache.get(config.registrationChannelId)
      : null)
    || [...guild.channels.cache.values()].find(channel =>
      !isCategory(channel) && normalizePermissionName(channel.name) === 'registro');
  let registrationChannelCreated = false;

  if (!registrationChannel) {
    let entryCategory = [...guild.channels.cache.values()].find(channel =>
      isCategory(channel) && normalizePermissionName(channel.name) === 'entrada');
    if (!entryCategory) {
      entryCategory = await guild.channels.create({
        name: '👋 Entrada',
        type: ChannelType.GuildCategory,
        reason: 'ASTHEN: categoria de entrada para registro obrigatório'
      });
    }
    registrationChannel = await guild.channels.create({
      name: '📝・registro',
      type: ChannelType.GuildText,
      parent: entryCategory.id,
      topic: 'Registro obrigatório do Minecraft para liberar os canais do servidor.',
      reason: 'ASTHEN: canal de registro obrigatório'
    });
    registrationChannelCreated = true;
  }
  if (!registrationChannel?.permissionOverwrites?.edit) {
    throw new Error('O canal de registro encontrado não é um canal de texto configurável.');
  }

  const configStaff = config.staffRoleId && guild.roles.cache.get(config.staffRoleId);
  const namedStaff = [...guild.roles.cache.values()].find(role =>
    normalizePermissionName(role.name) === 'staff');
  const changes = {
    memberRoleId: memberRole.id,
    registrationChannelId: registrationChannel.id,
    ...(configStaff || namedStaff ? { staffRoleId: configStaff?.id || namedStaff.id } : {})
  };
  updateGuildConfig(guild.id, changes);
  const nextConfig = getGuildConfig(guild.id);
  const channels = [...guild.channels.cache.values()];
  const plan = channelPlan(guild, nextConfig, memberRole, channels);
  const counters = { updated: 0, failed: [], skipped: 0 };

  // Close every category for @everyone, member access, cosmetic roles and
  // per-user exceptions. Access is granted only on explicitly classified channels.
  for (const category of plan.categories) {
    try {
      await editOverwrite(category, guild.roles.everyone.id, { ViewChannel: false, UseApplicationCommands: false }, counters);
      await editOverwrite(category, memberRole.id, { ViewChannel: false, UseApplicationCommands: false }, counters);
      for (const role of groups.roles) {
        await editOverwrite(category, role.id, { ViewChannel: false, UseApplicationCommands: false }, counters);
      }
      for (const overwrite of [...category.permissionOverwrites.cache.values()]) {
        if (overwrite.type === 1 && overwrite.id !== botMember.id) {
          await editOverwrite(category, overwrite.id, { ViewChannel: null, UseApplicationCommands: false }, counters);
        }
      }
      await allowBotMember(category, botMember, counters);
    } catch (error) {
      counters.failed.push('Categoria ' + category.name + ': ' + error.message);
    }
  }

  for (const entry of plan.channelEntries) {
    const { channel, scope } = entry;
    try {
      const isRegistration = scope === 'registration';
      await editOverwrite(channel, guild.roles.everyone.id, {
        ViewChannel: isRegistration,
        UseApplicationCommands: false,
        ...(isRegistration ? {
          ReadMessageHistory: true,
          SendMessages: false,
          SendMessagesInThreads: false
        } : { SendMessages: false })
      }, counters);

      await restrictAllRoleOverwrites(channel, guild, groups, counters);
      await clearUserOverwrites(channel, guild, scope, botMember, memberRole, groups);
      await setRolesForChannel(channel, scope, groups, nextConfig, counters);

      if (scope === 'member' && channel.type === ChannelType.GuildText && (channel.rateLimitPerUser || 0) < 5) {
        await channel.setRateLimitPerUser(5, 'ASTHEN: slowmode anti-spam de 5 segundos');
      }
      await allowBotMember(channel, botMember, counters);
    } catch (error) {
      counters.failed.push('#' + (channel.name || 'canal') + ': ' + error.message);
    }
  }

  let panelWarning = '';
  try {
    await configureRegistrationChannel(registrationChannel, guild);
    await refreshRegistrationPanel(guild);
  } catch (error) {
    panelWarning = error.message;
  }

  if (resetRegistrations && resetPlan) {
    if (counters.failed.length || panelWarning) {
      counters.resetSkipped = true;
    } else {
      const reset = await resetGuildRegistrations(guild, { prepared: resetPlan });
      counters.reset = reset;
    }
  }

  const failed = counters.failed;
  if (failed.length) {
    console.error('[Asthen Permissões] Falhas ao aplicar política de acesso:', failed);
  }

  return {
    ...plan.summary,
    updatedOverwrites: counters.updated,
    failed,
    panelWarning,
    reset: counters.reset || null,
    resetSkipped: Boolean(counters.resetSkipped),
    memberRoleName: memberRole.name,
    registrationChannelName: registrationChannel.name,
    registrationChannelCreated
  };
}
