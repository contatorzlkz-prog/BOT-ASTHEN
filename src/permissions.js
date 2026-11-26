import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from './store.js';
import { refreshRegistrationPanel } from './registration.js';

const FLAGS = PermissionFlagsBits;
const ADMIN_CATEGORY_NAMES = new Set(['administracao', 'admin', 'moderacao', 'staff']);
const MANAGER_NAMES = new Set(['proprietario', 'gerhost', 'gerdiscord', 'gerserver']);
const LOG_MANAGER_NAMES = new Set(['proprietario', 'gerdiscord', 'gerserver']);
const PLATFORM_NAMES = new Set(['pc', 'mobile', 'console']);
const SERVICE_NAMES = new Set(['bot', 'asthinho', 'loritta', 'disboardorg']);
const DANGEROUS_ROLE_FLAGS = [
  'Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels',
  'ManageWebhooks', 'ManageMessages', 'ModerateMembers', 'BanMembers',
  'KickMembers', 'ManageNicknames', 'ViewAuditLog', 'ManageEvents',
  'ManageThreads'
];

const REASON = 'ASTHEN: configuração central de permissões por /permissoes configurar';

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
  registrationChannelId = '',
  hasPersonalOverwrite = false,
  hasCustomRoleViewOverwrite = false
}) {
  const channel = normalizePermissionName(name);
  const parent = normalizePermissionName(parentName);

  if (channelId && registrationChannelId && channelId === registrationChannelId) return 'registration';
  if (channel === 'registro') return 'registration';
  if (String(topic || '').startsWith('ASTHEN|type:')) return 'ticket';
  if (channel === 'logs') return 'logs';
  if (channel === 'comandosadm') return 'admin-command';
  if (channel === 'chatstaff' || channel === 'punicoes') return 'staff';
  if (ADMIN_CATEGORY_NAMES.has(parent)) return 'admin';
  if (hasPersonalOverwrite) return 'private';
  if (hasCustomRoleViewOverwrite) return 'custom';
  return 'member';
}

function roleGroups(guild, memberRole, config) {
  const roles = [...guild.roles.cache.values()].filter(role => role.id !== guild.roles.everyone.id);
  const groups = {
    roles,
    platform: roles.filter(role => PLATFORM_NAMES.has(normalizePermissionName(role.name))),
    staff: roles.filter(role => MANAGER_NAMES.has(normalizePermissionName(role.name)) || normalizePermissionName(role.name) === 'staff'),
    managers: roles.filter(role => MANAGER_NAMES.has(normalizePermissionName(role.name))),
    logsManagers: roles.filter(role => LOG_MANAGER_NAMES.has(normalizePermissionName(role.name))),
    services: roles.filter(role => SERVICE_NAMES.has(normalizePermissionName(role.name))),
    pings: roles.filter(role => normalizePermissionName(role.name).startsWith('ping')),
    boosters: roles.filter(role => normalizePermissionName(role.name) === 'booster')
  };

  if (config.staffRoleId) {
    const configuredStaff = guild.roles.cache.get(config.staffRoleId);
    if (configuredStaff && !groups.staff.some(role => role.id === configuredStaff.id)) groups.staff.push(configuredStaff);
  }
  groups.staff = [...new Map(groups.staff.map(role => [role.id, role])).values()];
  groups.managers = [...new Map(groups.managers.map(role => [role.id, role])).values()];
  groups.logsManagers = [...new Map(groups.logsManagers.map(role => [role.id, role])).values()];

  groups.member = memberRole;
  groups.knownRoleIds = new Set([
    memberRole.id,
    ...groups.platform.map(role => role.id),
    ...groups.staff.map(role => role.id),
    ...groups.services.map(role => role.id)
  ]);
  return groups;
}

function hasDangerousPermissions(role) {
  return DANGEROUS_ROLE_FLAGS.filter(flag => role.permissions?.has?.(FLAGS[flag]));
}

function hasPersonalOverwrite(channel, botUserId) {
  return [...(channel.permissionOverwrites?.cache?.values?.() || [])]
    .some(overwrite => overwrite.type === 1 && overwrite.id !== botUserId);
}

function hasCustomRoleViewOverwrite(channel, guild, groups) {
  return [...(channel.permissionOverwrites?.cache?.values?.() || [])].some(overwrite => {
    if (overwrite.type !== 0 || overwrite.id === guild.roles.everyone.id) return false;
    if (groups.knownRoleIds.has(overwrite.id)) return false;
    return overwrite.allow.has(FLAGS.ViewChannel) || overwrite.deny.has(FLAGS.ViewChannel);
  });
}

function channelScope(channel, guild, config, groups, botUserId) {
  const parent = channel.parentId ? guild.channels.cache.get(channel.parentId) : null;
  return classifyPermissionChannel({
    name: channel.name,
    topic: channel.topic,
    parentName: parent?.name || '',
    channelId: channel.id,
    registrationChannelId: config.registrationChannelId,
    hasPersonalOverwrite: hasPersonalOverwrite(channel, botUserId),
    hasCustomRoleViewOverwrite: hasCustomRoleViewOverwrite(channel, guild, groups)
  });
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

async function clearPlatformOverwrites(channel, groups, counters) {
  for (const role of groups.platform) {
    const existing = channel.permissionOverwrites.cache.get(role.id);
    if (!existing) continue;
    await editOverwrite(channel, role.id, { ViewChannel: null }, counters);
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
  } else if (isVoiceChannel(channel)) {
    permissions.Connect = true;
    permissions.Speak = true;
  }
  await editOverwrite(channel, botMember.id, permissions, counters);
}

function makePlan(guild, config, memberRole, channels) {
  const groups = roleGroups(guild, memberRole, config);
  const categories = channels.filter(isCategory);
  const channelEntries = channels
    .filter(channel => !isCategory(channel) && channel.permissionOverwrites?.edit)
    .map(channel => ({
      channel,
      scope: channelScope(channel, guild, config, groups, guild.client.user?.id)
    }));

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
      protectedPersonalChannels: count('private'),
      protectedCustomChannels: count('custom'),
      dangerousPlatformRoles: groups.platform
        .map(role => ({ name: role.name, flags: hasDangerousPermissions(role) }))
        .filter(item => item.flags.length),
      dangerousOtherRoles: groups.roles
        .filter(role => !groups.staff.some(staffRole => staffRole.id === role.id)
          && !groups.services.some(serviceRole => serviceRole.id === role.id)
          && hasDangerousPermissions(role).length)
        .map(role => ({ name: role.name, flags: hasDangerousPermissions(role) })),
      dangerousMemberFlags: hasDangerousPermissions(memberRole)
    }
  };
}

export async function analyzeGuildPermissionSetup(guild, memberRoleId = null) {
  await guild.roles.fetch();
  await guild.channels.fetch();
  const config = getGuildConfig(guild.id);
  const roleCandidates = [
    memberRoleId && guild.roles.cache.get(memberRoleId),
    config.memberRoleId && guild.roles.cache.get(config.memberRoleId),
    ...guild.roles.cache.values()
  ];
  const memberRole = roleCandidates.find(role =>
    role && role.id !== guild.roles.everyone.id && normalizePermissionName(role.name) === 'membro'
  );
  if (!memberRole) {
    throw new Error('Não encontrei o cargo Membro. Selecione o cargo correto ao executar /permissoes configurar.');
  }
  const configuredRegistration = config.registrationChannelId
    ? guild.channels.cache.get(config.registrationChannelId)
    : null;
  const registrationChannel = (configuredRegistration && !isCategory(configuredRegistration)
      && normalizePermissionName(configuredRegistration.name) === 'registro' && configuredRegistration)
    || [...guild.channels.cache.values()].find(channel =>
      !isCategory(channel) && normalizePermissionName(channel.name) === 'registro');
  const plan = makePlan(guild, { ...config, registrationChannelId: registrationChannel?.id || null }, memberRole,
    [...guild.channels.cache.values()]);
  plan.summary.registrationChannelName = registrationChannel?.name || '📝・registro (será criado em 👋 Entrada)';
  plan.summary.willCreateRegistrationChannel = !registrationChannel;
  plan.summary.unknownRoles = plan.groups.roles
    .filter(role => classifyPermissionRole(role) === 'other')
    .map(role => role.name);
  plan.summary.everyonePolicy = 'Somente o canal de registro';
  return plan.summary;
}

export async function configureGuildPermissions(guild, memberRole) {
  if (!memberRole || normalizePermissionName(memberRole.name) !== 'membro') {
    throw new Error('Selecione o cargo chamado Membro no campo do comando.');
  }
  if (memberRole.managed || memberRole.id === guild.roles.everyone.id) {
    throw new Error('O cargo Membro não pode ser um cargo gerenciado ou o @everyone.');
  }

  await guild.roles.fetch();
  await guild.channels.fetch();
  const config = getGuildConfig(guild.id);
  const configuredRegistration = config.registrationChannelId
    ? guild.channels.cache.get(config.registrationChannelId)
    : null;
  let registrationChannel = (configuredRegistration && !isCategory(configuredRegistration)
      && normalizePermissionName(configuredRegistration.name) === 'registro' && configuredRegistration)
    || [...guild.channels.cache.values()].find(channel =>
      !isCategory(channel) && normalizePermissionName(channel.name) === 'registro');
  let registrationChannelCreated = false;

  const botMember = guild.members.me || await guild.members.fetchMe();
  if (!botMember.permissions.has(FLAGS.ManageChannels)) {
    throw new Error('O bot precisa da permissão Gerenciar canais.');
  }
  if (!botMember.permissions.has(FLAGS.ManageRoles)) {
    throw new Error('O bot precisa da permissão Gerenciar cargos para manter o fluxo de registro.');
  }
  if (!botMember.roles.highest || botMember.roles.highest.comparePositionTo(memberRole) <= 0) {
    throw new Error('O cargo do bot precisa ficar acima de Membro na hierarquia.');
  }

  const memberProblems = hasDangerousPermissions(memberRole);
  if (memberProblems.length) {
    throw new Error('O cargo Membro tem permissões administrativas (' + memberProblems.join(', ') +
      '). Remova essas permissões do cargo antes de aplicar a configuração.');
  }

  const initialGroups = roleGroups(guild, memberRole, config);
  const dangerousOtherRoles = initialGroups.roles.filter(role =>
    !initialGroups.staff.some(staffRole => staffRole.id === role.id)
    && !initialGroups.services.some(serviceRole => serviceRole.id === role.id)
    && hasDangerousPermissions(role).length
  );
  if (dangerousOtherRoles.length) {
    const details = dangerousOtherRoles.slice(0, 5).map(role =>
      role.name + ': ' + hasDangerousPermissions(role).join(', ')
    );
    throw new Error('Antes de aplicar, remova permissões administrativas destes cargos não administrativos: ' +
      details.join(' | ') + '. O configurador não altera permissões globais de cargos.');
  }

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
  const staffRoleId = configStaff?.id || namedStaff?.id || null;
  updateGuildConfig(guild.id, {
    memberRoleId: memberRole.id,
    registrationChannelId: registrationChannel.id,
    ...(staffRoleId ? { staffRoleId } : {})
  });

  const nextConfig = getGuildConfig(guild.id);
  const channels = [...guild.channels.cache.values()];
  const plan = makePlan(guild, nextConfig, memberRole, channels);
  const counters = { updated: 0, failed: [], skipped: 0 };
  const groups = plan.groups;
  const roleHasAdministrator = role => role.permissions?.has?.(FLAGS.Administrator);
  const edit = async (channel, targetId, permissions) => {
    try {
      await editOverwrite(channel, targetId, permissions, counters);
    } catch (error) {
      counters.failed.push('#' + (channel.name || 'canal') + ' → ' + targetId + ': ' + error.message);
    }
  };

  // Categories are closed to every role. Access is re-granted on each
  // individual channel so inherited role allows cannot expose private tickets.
  for (const category of plan.categories) {
    await edit(category, guild.roles.everyone.id, { ViewChannel: false });
    await edit(category, memberRole.id, { ViewChannel: false });
    for (const overwrite of category.permissionOverwrites.cache.values()) {
      if (overwrite.type !== 0 || overwrite.id === guild.roles.everyone.id) continue;
      if (overwrite.allow.has(FLAGS.ViewChannel)) {
        await edit(category, overwrite.id, { ViewChannel: false });
      }
    }
    await clearPlatformOverwrites(category, groups, counters).catch(error =>
      counters.failed.push('Categoria ' + category.name + ': ' + error.message));
    await allowBotMember(category, botMember, counters).catch(error =>
      counters.failed.push('Bot na categoria ' + category.name + ': ' + error.message));
  }

  for (const entry of plan.channelEntries) {
    const { channel, scope } = entry;
    const isRegistration = scope === 'registration';
    await edit(channel, guild.roles.everyone.id, {
      ViewChannel: isRegistration,
      ...(isRegistration ? { ReadMessageHistory: true, SendMessages: false, SendMessagesInThreads: false } : {})
    });

    await clearPlatformOverwrites(channel, groups, counters).catch(error =>
      counters.failed.push('Cargos de plataforma em #' + channel.name + ': ' + error.message));

    if (scope === 'ticket' || scope === 'private' || scope === 'custom') {
      await edit(channel, memberRole.id, { ViewChannel: false, SendMessages: false });
      if (scope === 'ticket') counters.skipped += 1;
      if (scope === 'private' || scope === 'custom') counters.skipped += 1;
      if (scope !== 'ticket') {
        await allowBotMember(channel, botMember, counters).catch(error =>
          counters.failed.push('Bot em #' + channel.name + ': ' + error.message));
      }
      continue;
    }

    if (scope === 'registration') {
      await edit(channel, memberRole.id, { ViewChannel: false, ReadMessageHistory: false, SendMessages: false });
      for (const role of groups.staff) {
        if (roleHasAdministrator(role)) continue;
        await edit(channel, role.id, { ViewChannel: true, ReadMessageHistory: true });
      }
      for (const role of groups.services) {
        await edit(channel, role.id, {
          ViewChannel: true, ReadMessageHistory: true, SendMessages: true,
          SendMessagesInThreads: true, AttachFiles: true, EmbedLinks: true
        });
      }
      for (const roleId of nextConfig.registrationBypassRoleIds || []) {
        if (roleId === memberRole.id || groups.staff.some(role => role.id === roleId)) continue;
        if (guild.roles.cache.has(roleId)) await edit(channel, roleId, { ViewChannel: true, ReadMessageHistory: true });
      }
      await allowBotMember(channel, botMember, counters);
      continue;
    }

    if (scope === 'logs' || scope === 'admin-command' || scope === 'staff' || scope === 'admin') {
      await edit(channel, memberRole.id, { ViewChannel: false, SendMessages: false });
      const allowedRoles = scope === 'logs'
        ? groups.logsManagers
        : scope === 'admin-command' || scope === 'admin'
          ? groups.managers
          : groups.staff;
      const allowedRoleIds = new Set(allowedRoles.map(role => role.id));
      for (const overwrite of channel.permissionOverwrites.cache.values()) {
        if (overwrite.type !== 0 || overwrite.id === guild.roles.everyone.id || overwrite.id === memberRole.id) continue;
        if (overwrite.allow.has(FLAGS.ViewChannel) && !allowedRoleIds.has(overwrite.id)) {
          await edit(channel, overwrite.id, { ViewChannel: false });
        }
      }
      for (const role of allowedRoles) {
        if (roleHasAdministrator(role)) continue;
        await edit(channel, role.id, { ViewChannel: true, ReadMessageHistory: true });
      }
      await allowBotMember(channel, botMember, counters);
      continue;
    }

    // All ordinary channels are Membro-only and writable. The platform
    // selection roles stay cosmetic and never satisfy this access gate.
    const memberPermissions = isVoiceChannel(channel)
      ? { ViewChannel: true, Connect: true, Speak: true, UseVAD: true }
      : { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, SendMessagesInThreads: true };
    await edit(channel, memberRole.id, memberPermissions);
    for (const role of groups.staff) {
      if (roleHasAdministrator(role)) continue;
      await edit(channel, role.id, { ViewChannel: true, ReadMessageHistory: true });
    }
    for (const role of groups.services) {
      await edit(channel, role.id, {
        ViewChannel: true, ReadMessageHistory: true, SendMessages: true,
        SendMessagesInThreads: true, AttachFiles: true, EmbedLinks: true
      });
    }
    await allowBotMember(channel, botMember, counters);
  }

  let panelWarning = '';
  try {
    await refreshRegistrationPanel(guild);
  } catch (error) {
    panelWarning = error.message;
  }

  return {
    ...plan.summary,
    updatedOverwrites: counters.updated,
    failed: counters.failed,
    skipped: counters.skipped,
    panelWarning,
    memberRoleName: memberRole.name,
    registrationChannelName: registrationChannel.name,
    registrationChannelCreated
  };
}
