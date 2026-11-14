import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// Chave Pix fixa da loja; o QR incluído no projeto corresponde a ela.
export const PIX_KEY_DEFAULT = 'keybytes.a@gmail.com';
export const PIX_QR_FILENAME = 'pix-keybytes.png';
export const PIX_QR_IMAGE_PATH = path.resolve(currentDir, '../assets', PIX_QR_FILENAME);
