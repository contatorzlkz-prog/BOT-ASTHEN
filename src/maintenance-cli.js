import { createBackup, listBackups, restoreBackup, verifyBackup } from './maintenance.js';

const [action = 'list', backupId] = process.argv.slice(2);

function printBackups() {
  const backups = listBackups();
  if (!backups.length) {
    console.log('Nenhum backup encontrado na pasta backups/.');
    return;
  }
  for (const item of backups) {
    console.log((item.valid ? '[OK] ' : '[ERRO] ') + item.id +
      ' · ' + (item.createdAt || 'data desconhecida') +
      ' · ' + (item.bytes / 1024).toFixed(1) + ' KB');
  }
}

try {
  if (action === 'backup') {
    const result = createBackup({ reason: 'manual pelo terminal' });
    console.log('Backup criado: ' + result.id);
  } else if (action === 'list') {
    printBackups();
  } else if (action === 'verify') {
    if (!backupId) throw new Error('Informe o identificador do backup.');
    const result = verifyBackup(backupId);
    if (!result.valid) throw new Error(result.error);
    console.log('Integridade confirmada: ' + backupId);
  } else if (action === 'restore') {
    if (!backupId) throw new Error('Informe o identificador do backup.');
    const result = restoreBackup(backupId);
    console.log('Backup restaurado: ' + result.restored);
    console.log('Cópia de segurança anterior: ' + result.safetyBackup);
    console.log('Inicie novamente o ASTHEN BOT.');
  } else {
    throw new Error('Uso: node src/maintenance-cli.js backup|list|verify <id>|restore <id>');
  }
} catch (error) {
  console.error('[Asthen Backup] ' + error.message);
  process.exitCode = 1;
}
