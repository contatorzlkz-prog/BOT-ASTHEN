import { PermissionsBitField } from 'discord.js';
import {
  findPlayerRegistrationByNick,
  getGuildConfig,
  getPlayerRegistration,
  savePlayerRegistration,
  updateGuildConfig
} from './store.js';
import { makeRegistrationPanel, PANEL_LAYOUT_VERSION } from './ui.js';

const FLAGS = PermissionsBitField.Flags;

export function validateMinecraftNick(value) {
  const nick = String(value || '').trim();
  return /^[A-Za-z0-9_. ]{1,32}$/.test(nick) && !nick.startsWith(' ') && !nick.endsWith(' ');
}

export function memberCanBypassRegistration(member, config = getGuildConfig(member.guild.id)) {
  if (member.permissions?.has?.(FLAGS.Administrator)
      || member.permissions?.has?.(FLAGS.ManageGuild)
      || member.permissions?.has?.(FLAGS.ManageNicknames)) return true;
  if (config.staffRoleId && member.roles?.cache?.has?.(config.staffRoleId)) return true;
  return (config.registrationBypassRoleIds || []).some(roleId => member.roles?.cache?.has?.(roleId));
}

async function sendRegistrationLog(guild, description) {
  const config = getGuildConfig(guild.id);
  const channel = config.logsChannelId
    ? (guild.channels.cache.get(config.logsChannelId) || await guild.channels.fetch(config.logsChannelId).catch(() => null))
    : null;
  const content = '🧾 **Registro Minecraft**\n' + description;
  if (channel?.isTextBased?.() && channel.send) {
    try {
      await channel.send({ content, allowedMentions: { parse: [] } });
      return;
    } catch (error) {
      console.warn('[Asthen Registro] Não foi possível publicar no canal de logs:', error.message);
    }
  }
  console.info('[Asthen Registro] ' + description.replace(/\n/g, ' | '));
}

async function updateRegisteredNickname(member, nick) {
  if (member.nickname === nick) return null;
  const botMember = member.guild.members.me;
  if (!botMember?.permissions?.has?.(FLAGS.ManageNicknames)) {
    throw new Error('O bot precisa da permissão Gerenciar apelidos.');
  }
  if (member.id === member.guild.ownerId) {
    throw new Error('O Discord não permite que o bot altere o apelido do proprietário do servidor.');
  }
  if (!botMember.roles.highest || botMember.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
    throw new Error('O cargo do bot precisa ficar acima do cargo do jogador para atualizar o apelido.');
  }
  await member.setNickname(nick, 'ASTHEN: sincronização do nick Minecraft cadastrado');
  return nick;
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
  if (!config.registrationChannelId) return;
  const channel = member.guild.channels.cache.get(config.registrationChannelId)
    || await member.guild.channels.fetch(config.registrationChannelId).catch(() => null);
  if (!channel?.permissionOverwrites?.edit) return;

  // Individual overwrite keeps registered players out even if another non-staff
  // role happens to allow channel visibility. Explicitly authorized staff remain visible.
  const access = memberCanBypassRegistration(member, config) ? true : registered ? false : null;
  try {
    await channel.permissionOverwrites.edit(member.id, { ViewChannel: access },
      'ASTHEN: visibilidade individual do canal de registro');
  } catch (error) {
    console.warn('[Asthen Registro] Não foi possível sincronizar a visibilidade de #' + channel.name + ' para ' + member.user.tag + ':', error.message);
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

  const bypassRoles = new Set([config.staffRoleId, ...(config.registrationBypassRoleIds || [])].filter(Boolean));
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

  const payload = makeRegistrationPanel();
  if (message) {
    if (config.registrationPanelVersion !== PANEL_LAYOUT_VERSION) await message.edit(payload);
    updateGuildConfig(guild.id, {
      registrationPanelMessageId: message.id,
      registrationPanelVersion: PANEL_LAYOUT_VERSION
    });
    return true;
  }

  const created = await channel.send(payload);
  updateGuildConfig(guild.id, {
    registrationPanelMessageId: created.id,
    registrationPanelVersion: PANEL_LAYOUT_VERSION
  });
  return true;
}

export async function applyRegisteredIdentity(member, record = getPlayerRegistration(member.id)) {
  const config = getGuildConfig(member.guild.id);
  if (!record?.minecraft_nick) {
    if (!memberCanBypassRegistration(member, config)) {
      try {
        await updateMemberRole(member, false, config);
      } catch (error) {
        await sendRegistrationLog(member.guild,
          'Não foi possível remover o cargo de membro de <@' + member.id + '>: ' + error.message);
      }
    }
    await updateRegistrationChannelVisibility(member, false, config);
    return { registered: false, errors: [] };
  }

  const errors = [];
  try {
    const changedRole = await updateMemberRole(member, true, config);
    if (changedRole) await sendRegistrationLog(member.guild,
      'Cargo **' + changedRole.name + '** atribuído a <@' + member.id + '> após o registro Minecraft.');
  } catch (error) {
    errors.push('cargo: ' + error.message);
    await sendRegistrationLog(member.guild,
      'Falha ao atribuir o cargo de membro a <@' + member.id + '> (' + record.minecraft_nick + '): ' + error.message);
  }
  try {
    await updateRegisteredNickname(member, record.minecraft_nick);
  } catch (error) {
    errors.push('apelido: ' + error.message);
    await sendRegistrationLog(member.guild,
      'Falha ao atualizar o apelido de <@' + member.id + '> para ' + record.minecraft_nick + ': ' + error.message);
  }

  await updateRegistrationChannelVisibility(member, true, config);
  return { registered: true, errors };
}

export async function registerPlayerForMember(member, minecraftNick, source = 'self-service') {
  const nick = String(minecraftNick || '').trim();
  if (!validateMinecraftNick(nick)) {
    throw new Error('Informe um nick Minecraft válido, sem espaços no começo/fim e com até 32 caracteres.');
  }
  const existing = findPlayerRegistrationByNick(nick);
  if (existing && existing.discord_id !== member.id) {
    throw new Error('Este nick Minecraft já está vinculado a outra conta Discord.');
  }

  const previous = getPlayerRegistration(member.id);
  const record = savePlayerRegistration(member.id, nick, member.guild.id);
  const sync = await applyRegisteredIdentity(member, record);
  const action = previous ? 'Nick atualizado' : 'Novo registro';
  await sendRegistrationLog(member.guild,
    action + ' por ' + source + ': <@' + member.id + '> → **' + nick + '**.' +
    (sync.errors.length ? '\nSincronização pendente: ' + sync.errors.join('; ') : ''));
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

export async function handleRegisteredNicknameUpdate(oldMember, newMember) {
  if (!oldMember || !newMember || oldMember.nickname === newMember.nickname) return;
  const record = getPlayerRegistration(newMember.id);
  if (!record?.minecraft_nick || newMember.nickname === record.minecraft_nick) return;

  try {
    await updateRegisteredNickname(newMember, record.minecraft_nick);
    await sendRegistrationLog(newMember.guild,
      'Alteração manual de apelido revertida para <@' + newMember.id + '>. O nick oficial continua **' + record.minecraft_nick + '**. Para alteração administrativa, use /registro atualizar.');
  } catch (error) {
    await sendRegistrationLog(newMember.guild,
      'Não foi possível restaurar o apelido oficial de <@' + newMember.id + '>: ' + error.message);
  }
}
