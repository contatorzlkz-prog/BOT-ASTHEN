import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import {
  findPlayerRegistrationByNick,
  getGuildConfig,
  getPlayerRegistration,
  clearPlayerRegistrationsForGuild,
  savePlayerRegistration,
  updateGuildConfig
} from './store.js';
import { makeRegistrationPanel } from './ui.js';

const REGISTRATION_PANEL_VERSION = 'registration-flow-v2';

const FLAGS = PermissionsBitField.Flags;

export function validateMinecraftNick(value) {
  const nick = String(value ?? '');
  return nick === nick.trim() && /^[A-Za-z0-9_. ]{1,32}$/.test(nick);
}

const REGISTRATION_STAFF_NAMES = new Set([
  'proprietario', 'gerhost', 'gerdiscord', 'gerserver', 'staff'
]);

function normalizeRegistrationRoleName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function memberCanBypassRegistration(member, config = getGuildConfig(member.guild.id)) {
  if (member.permissions?.has?.(FLAGS.Administrator)
      || member.permissions?.has?.(FLAGS.ManageGuild)) return true;
  if (config.staffRoleId && member.roles?.cache?.has?.(config.staffRoleId)) return true;
  if ((config.registrationBypassRoleIds || []).some(roleId => member.roles?.cache?.has?.(roleId))) return true;
  return [...(member.roles?.cache?.values?.() || [])]
    .some(role => REGISTRATION_STAFF_NAMES.has(normalizeRegistrationRoleName(role.name)));
}

async function sendRegistrationLog(guild, { title, description, color = 0x7652c7 }) {
  const config = getGuildConfig(guild.id);
  const channel = config.logsChannelId
    ? (guild.channels.cache.get(config.logsChannelId) || await guild.channels.fetch(config.logsChannelId).catch(() => null))
    : null;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title || 'Registro Minecraft')
    .setDescription(String(description || ''))
    .setTimestamp(new Date());
  if (channel?.isTextBased?.() && channel.send) {
    try {
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      return true;
    } catch (error) {
      console.warn('[Asthen Registro] Não foi possível publicar o registro consolidado no canal de logs:', error.message);
    }
  }
  console.info('[Asthen Registro] ' + String(description || '').replace(/\n/g, ' | '));
  return false;
}

function ticketOwnerId(channel) {
  const match = String(channel?.topic || '').match(/(?:^|\|)owner:(\d{17,20})(?:\||$)/);
  return match ? match[1] : null;
}

async function updateMemberTicketVisibility(member, registered, config = getGuildConfig(member.guild.id)) {
  const canView = Boolean(registered || memberCanBypassRegistration(member, config));
  let updated = 0;
  const failed = [];
  for (const channel of member.guild.channels.cache.values()) {
    if (!String(channel.topic || '').startsWith('ASTHEN|type:')) continue;
    if (ticketOwnerId(channel) !== member.id || !channel.permissionOverwrites?.edit) continue;
    try {
      await channel.permissionOverwrites.edit(member.id, {
        ViewChannel: canView,
        ReadMessageHistory: canView,
        SendMessages: canView,
        AttachFiles: canView,
        EmbedLinks: canView
      }, 'ASTHEN: acesso ao ticket condicionado ao registro Minecraft');
      updated += 1;
    } catch (error) {
      failed.push('#' + channel.name + ': ' + error.message);
    }
  }
  return { updated, failed };
}

async function updateMemberRole(member, shouldHaveRole, config) {
  if (!config.memberRoleId) return null;
  const role = member.guild.roles.cache.get(config.memberRoleId)
    || await member.guild.roles.fetch(config.memberRoleId).catch(() => null);
  if (!role) throw new Error('O cargo de membro configurado não existe mais.');
  const hasRole = member.roles.cache.has(role.id);
  if (hasRole === shouldHaveRole) return null;

  const botMember = member.guild.members.me;
  if (!botMember?.permissions?.has?.(FLAGS.ManageRoles)) {
    throw new Error('O bot precisa da permissão Gerenciar cargos.');
  }
  if (role.managed || !botMember.roles.highest || botMember.roles.highest.comparePositionTo(role) <= 0) {
    throw new Error('O cargo de membro precisa estar abaixo do cargo mais alto do bot.');
  }
  if (shouldHaveRole) await member.roles.add(role, 'ASTHEN: jogador Minecraft registrado');
  else await member.roles.remove(role, 'ASTHEN: jogador ainda não registrado');
  return role;
}

async function updateRegistrationChannelVisibility(member, registered, config) {
  if (!config.registrationChannelId) return true;
  const channel = member.guild.channels.cache.get(config.registrationChannelId)
    || await member.guild.channels.fetch(config.registrationChannelId).catch(() => null);
  if (!channel?.permissionOverwrites?.edit) return false;

  // O cargo Membro é quem esconde o canal. Remova apenas a permissão individual
  // de visualização para que a negação do cargo tenha efeito automaticamente.
  // Assim, não criamos um deny individual que possa sobrepor a regra do servidor.
  const access = memberCanBypassRegistration(member, config) ? true : null;
  try {
    await channel.permissionOverwrites.edit(member.id, { ViewChannel: access },
      'ASTHEN: visibilidade do registro controlada pelos cargos do servidor');
    return true;
  } catch (error) {
    console.warn('[Asthen Registro] Não foi possível sincronizar a visibilidade de #' + channel.name + ' para ' + member.user.tag + ':', error.message);
    return false;
  }
}

export async function configureRegistrationChannel(channel, guild) {
  if (!channel?.permissionOverwrites?.edit) return false;
  const config = getGuildConfig(guild.id);

  // Edit only the permissions controlled by registration; preserve unrelated overwrites.
  await channel.permissionOverwrites.edit(guild.roles.everyone.id, {
    ViewChannel: true,
    ReadMessageHistory: true,
    SendMessages: false
  }, 'ASTHEN: canal de registro acessível a quem ainda precisa se registrar');

  if (config.memberRoleId) {
    const memberRole = guild.roles.cache.get(config.memberRoleId);
    if (memberRole) {
      await channel.permissionOverwrites.edit(memberRole.id, {
        ViewChannel: false,
        ReadMessageHistory: false,
        SendMessages: false
      }, 'ASTHEN: ocultar canal de registro dos membros registrados');
    }
  }

  const namedStaffRoles = [...guild.roles.cache.values()]
    .filter(role => REGISTRATION_STAFF_NAMES.has(normalizeRegistrationRoleName(role.name)))
    .map(role => role.id);
  const bypassRoles = new Set([
    config.staffRoleId,
    ...(config.registrationBypassRoleIds || []),
    ...namedStaffRoles
  ].filter(Boolean));
  for (const roleId of bypassRoles) {
    if (!guild.roles.cache.has(roleId)) continue;
    await channel.permissionOverwrites.edit(roleId, {
      ViewChannel: true,
      ReadMessageHistory: true,
      SendMessages: false
    }, 'ASTHEN: acesso da equipe ao canal de registro');
  }

  const botMember = guild.members.me;
  if (botMember) {
    await channel.permissionOverwrites.edit(botMember.id, {
      ViewChannel: true,
      ReadMessageHistory: true,
      SendMessages: true,
      ManageMessages: true
    }, 'ASTHEN: permissões do bot no canal de registro');
  }
  return true;
}

export async function refreshRegistrationPanel(guild) {
  const config = getGuildConfig(guild.id);
  if (!config.registrationChannelId) return false;
  const channel = guild.channels.cache.get(config.registrationChannelId)
    || await guild.channels.fetch(config.registrationChannelId).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.messages?.fetch) {
    console.warn('[Asthen Registro] O canal configurado para registro não está disponível em ' + guild.name + '.');
    return false;
  }

  await configureRegistrationChannel(channel, guild);
  let message = null;
  if (config.registrationPanelMessageId) {
    message = await channel.messages.fetch(config.registrationPanelMessageId).catch(() => null);
  }
  if (!message) {
    try {
      const recent = await channel.messages.fetch({ limit: 50 });
      message = recent.find(item => item.author?.id === guild.client.user?.id
        && item.components?.some(row => row.components?.some(component =>
          (component.customId || component.data?.custom_id) === 'registration:open'
        ))) || null;
    } catch (error) {
      console.warn('[Asthen Registro] Sem histórico para localizar o painel existente; evitando publicar uma cópia:', error.message);
      return false;
    }
  }

  // Mensagens publicadas nunca são editadas. Quando o painel muda de versão,
  // publique um novo painel uma única vez e preserve o anterior como histórico.
  if (message && config.registrationPanelVersion === REGISTRATION_PANEL_VERSION) {
    updateGuildConfig(guild.id, {
      registrationPanelMessageId: message.id,
      registrationPanelVersion: REGISTRATION_PANEL_VERSION
    });
    console.log('[Asthen Registro] Painel existente preservado em #' + channel.name + '.');
    return true;
  }

  const created = await channel.send(makeRegistrationPanel());
  updateGuildConfig(guild.id, {
    registrationPanelMessageId: created.id,
    registrationPanelVersion: REGISTRATION_PANEL_VERSION
  });
  console.log('[Asthen Registro] Novo painel publicado em #' + channel.name + '; mensagens anteriores preservadas.');
  return true;
}

export async function applyRegisteredIdentity(member, record = getPlayerRegistration(member.id)) {
  const config = getGuildConfig(member.guild.id);
  const errors = [];

  if (!record?.minecraft_nick) {
    if (!memberCanBypassRegistration(member, config)) {
      try {
        await updateMemberRole(member, false, config);
      } catch (error) {
        errors.push('cargo Membro: ' + error.message);
      }
    }
    if (!await updateRegistrationChannelVisibility(member, false, config)) {
      errors.push('visibilidade do canal de registro');
    }
    const tickets = await updateMemberTicketVisibility(member, false, config);
    errors.push(...tickets.failed.map(item => 'ticket ' + item));
    return { registered: false, errors, ticketsUpdated: tickets.updated };
  }

  if (!memberCanBypassRegistration(member, config)) {
    try {
      await updateMemberRole(member, true, config);
    } catch (error) {
      errors.push('cargo Membro: ' + error.message);
    }
  }

  const tickets = await updateMemberTicketVisibility(member, true, config);
  errors.push(...tickets.failed.map(item => 'ticket ' + item));

  if (!await updateRegistrationChannelVisibility(member, true, config)) {
    errors.push('visibilidade do canal de registro');
  }

  return { registered: true, errors, ticketsUpdated: tickets.updated };
}

export function validateRegistrationForMember(member, minecraftNick) {
  const nick = String(minecraftNick ?? '');
  if (!validateMinecraftNick(nick)) {
    throw new Error('Informe um nick Minecraft válido, sem espaços no começo/fim e com até 32 caracteres.');
  }
  const existing = findPlayerRegistrationByNick(nick);
  if (existing && existing.discord_id !== member.id) {
    throw new Error('Este nick Minecraft já está vinculado a outra conta Discord.');
  }
  return { nick, previous: getPlayerRegistration(member.id) };
}

export async function registerPlayerForMember(member, minecraftNick, source = 'autoatendimento') {
  const { nick, previous } = validateRegistrationForMember(member, minecraftNick);
  const record = savePlayerRegistration(member.id, nick, member.guild.id);
  const sync = await applyRegisteredIdentity(member, record);
  const status = sync.errors.length
    ? '\n**Pendências:** ' + sync.errors.join('; ')
    : '\nCargo e acessos de membro sincronizados.';
  await sendRegistrationLog(member.guild, {
    title: previous ? 'Nick Minecraft atualizado' : 'Novo registro Minecraft',
    description:
      '**Jogador:** <@' + member.id + '>\n' +
      '**Minecraft:** ' + nick + '\n' +
      '**Origem:** ' + String(source).slice(0, 80) + status,
    color: sync.errors.length ? 0xd99a32 : 0x2eaa72
  });
  return { record, previous, sync };
}

export async function reconcileGuildMember(member) {
  const record = getPlayerRegistration(member.id);
  return applyRegisteredIdentity(member, record);
}

export async function reconcileGuildMembers(guild) {
  const members = await guild.members.fetch();
  let registered = 0;
  let pending = 0;
  for (const member of members.values()) {
    try {
      const result = await reconcileGuildMember(member);
      if (result.registered) registered += 1;
      if (result.errors?.length) pending += 1;
    } catch (error) {
      pending += 1;
      console.error('[Asthen Registro] Falha ao reconciliar membro ' + member.id + ':', error.message);
    }
  }
  console.log('[Asthen Registro] Reconciliação concluída em ' + guild.name + ': ' + registered + ' registrado(s), ' + pending + ' pendência(s).');
  return { registered, pending, total: members.size };
}

export async function prepareGuildRegistrationReset(guild, memberRole = null) {
  const config = getGuildConfig(guild.id);
  const role = memberRole
    || (config.memberRoleId && (guild.roles.cache.get(config.memberRoleId)
      || await guild.roles.fetch(config.memberRoleId).catch(() => null)));
  if (!role || role.id === guild.roles.everyone.id || role.managed) {
    throw new Error('O cargo Membro configurado não existe ou não pode ser gerenciado.');
  }

  const botMember = guild.members.me || await guild.members.fetchMe();
  if (!botMember?.permissions?.has?.(FLAGS.ManageRoles)) {
    throw new Error('O bot precisa da permissão Gerenciar cargos.');
  }
  if (!botMember.roles.highest || botMember.roles.highest.comparePositionTo(role) <= 0) {
    throw new Error('Coloque o cargo do bot acima de Membro na hierarquia.');
  }

  const members = await guild.members.fetch();
  const blocked = [...members.values()].filter(member =>
    member.roles.cache.has(role.id)
    && member.id !== guild.client.user?.id
    && member.id !== guild.ownerId
    && member.roles.highest.comparePositionTo(botMember.roles.highest) >= 0
  );
  if (blocked.length) {
    throw new Error(
      'Não iniciei a alteração: o bot não consegue remover Membro de ' +
      blocked.length + ' conta(s) por causa da hierarquia (' +
      blocked.slice(0, 4).map(member => member.user.tag || member.id).join(', ') +
      '). Coloque o cargo do bot acima dos cargos dessas pessoas e tente novamente.'
    );
  }

  return { role, members, botMember };
}

export async function resetGuildRegistrations(guild, { prepared = null, log = true } = {}) {
  const config = getGuildConfig(guild.id);
  if (!config.registrationChannelId) {
    throw new Error('Configure primeiro o canal #registro com /configurar.');
  }
  const plan = prepared || await prepareGuildRegistrationReset(guild);
  const { role, members, botMember } = plan;
  const channel = guild.channels.cache.get(config.registrationChannelId)
    || await guild.channels.fetch(config.registrationChannelId).catch(() => null);
  if (!channel?.permissionOverwrites?.edit) {
    throw new Error('O canal de registro configurado não existe ou não permite editar permissões.');
  }

  await configureRegistrationChannel(channel, guild);
  let rolesRemoved = 0;
  let skippedProtected = 0;
  const failed = [];
  for (const member of members.values()) {
    if (!member.roles.cache.has(role.id)) continue;
    if (member.id === guild.client.user?.id || member.id === guild.ownerId) {
      skippedProtected += 1;
      continue;
    }
    try {
      await member.roles.remove(role, 'ASTHEN: novo ciclo de registro obrigatório');
      rolesRemoved += 1;
    } catch (error) {
      failed.push((member.user.tag || member.id) + ': ' + error.message);
    }
  }

  // Clear saved registrations even after an unexpected Discord API failure.
  // The next reconciliation sees no record and retries removing Membro.
  const recordsCleared = clearPlayerRegistrationsForGuild(guild.id, members.keys());
  let visibilityPending = 0;
  let ticketPending = 0;
  for (const member of members.values()) {
    if (member.id === guild.client.user?.id) continue;
    if (!await updateRegistrationChannelVisibility(member, false, config)) visibilityPending += 1;
    const tickets = await updateMemberTicketVisibility(member, false, config);
    ticketPending += tickets.failed.length;
  }

  if (log) {
    await sendRegistrationLog(guild, {
      title: 'Reinício dos registros Minecraft',
      description:
        '**Cargo removido de:** ' + rolesRemoved + ' membro(s)\n' +
        '**Cadastros antigos limpos:** ' + recordsCleared + '\n' +
        (skippedProtected ? '**Contas protegidas pelo Discord:** ' + skippedProtected + '\n' : '') +
        (failed.length ? '**Remoções pendentes:** ' + failed.slice(0, 4).join('; ') + '\n' : '') +
        (visibilityPending || ticketPending ? '**Permissões pendentes:** ' + (visibilityPending + ticketPending) : 'Todos deverão se registrar novamente.'),
      color: failed.length || visibilityPending || ticketPending ? 0xd99a32 : 0x2eaa72
    });
  }

  return {
    total: members.size,
    rolesRemoved,
    recordsCleared,
    skippedProtected,
    failed,
    visibilityPending,
    ticketPending,
    complete: failed.length === 0 && visibilityPending === 0 && ticketPending === 0
  };
}

export async function handleRegisteredNicknameUpdate(oldMember, newMember) {
  if (!oldMember || !newMember) return;
  const oldRoleIds = [...(oldMember.roles?.cache?.keys?.() || [])].sort();
  const newRoleIds = [...(newMember.roles?.cache?.keys?.() || [])].sort();
  const rolesChanged = oldRoleIds.length !== newRoleIds.length
    || oldRoleIds.some((roleId, index) => roleId !== newRoleIds[index]);
  if (!rolesChanged) return;

  const record = getPlayerRegistration(newMember.id);
  const config = getGuildConfig(newMember.guild.id);
  await updateRegistrationChannelVisibility(newMember, Boolean(record?.minecraft_nick), config);
  await updateMemberTicketVisibility(newMember, Boolean(record?.minecraft_nick), config);
}
