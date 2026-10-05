export const S3_ALLOWED_FOLDERS = [
  'clientes',
  'operadores',
  'usuarios',
  'vehiculos',
  'pasajeros',
  'Usuarios',
  'Pasajeros',
  'Incidentes',
  'Licencias',
  'Verificaciones',
  'NotasServicioMantenimiento',
] as const;

export type S3AllowedFolder = (typeof S3_ALLOWED_FOLDERS)[number];

const ALLOWED = new Set<string>(S3_ALLOWED_FOLDERS);

export class S3FolderNotAllowedError extends Error {
  constructor(folder: string) {
    super(`Folder S3 no permitido: ${folder}`);
    this.name = 'S3FolderNotAllowedError';
  }
}

/** Key: folder/{idCliente}/{idUser}/{uuid}.{ext} */
export function buildS3ObjectKey(
  folder: string,
  idCliente: number,
  idUser: number,
  fileId: string,
  extension: string,
): string {
  if (!ALLOWED.has(folder)) {
    throw new S3FolderNotAllowedError(folder);
  }
  const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  if (!safeFolder) {
    throw new S3FolderNotAllowedError(folder);
  }
  const cliente = Number.isFinite(Number(idCliente)) ? Number(idCliente) : 0;
  const user = Number.isFinite(Number(idUser)) ? Number(idUser) : 0;
  const safeId = String(fileId).replace(/[^a-f0-9-]/gi, '');
  const safeExt = String(extension).replace(/[^a-z0-9]/gi, '').slice(0, 8);
  if (!safeId || !safeExt) {
    throw new S3FolderNotAllowedError(folder);
  }
  return `${safeFolder}/${cliente}/${user}/${safeId}.${safeExt}`;
}

const TENANT_KEY =
  /^([A-Za-z0-9_-]{1,40})\/(\d+)\/(\d+)\/([a-f0-9-]{8,80})\.([a-z0-9]{1,8})$/i;

/** Solo la forma folder/{idCliente}/{idUser}/{uuid}.ext de una carga nueva. */
export function parseTenantObjectKey(
  key: string,
): { folder: string; idCliente: number; idUser: number } | null {
  const decoded = decodeURIComponent(String(key || ''))
    .replace(/^\/+/, '')
    .trim();
  if (!decoded || decoded.includes('..') || decoded.includes('\\')) return null;
  const match = TENANT_KEY.exec(decoded);
  if (!match || !ALLOWED.has(match[1])) return null;
  const idCliente = Number(match[2]);
  const idUser = Number(match[3]);
  if (!Number.isFinite(idCliente) || idCliente <= 0) return null;
  if (!Number.isFinite(idUser) || idUser <= 0) return null;
  return { folder: match[1], idCliente, idUser };
}

/** Key del objeto solo si la URL es https de este bucket. */
export function keyFromStoredUrl(
  rawUrl: string,
  bucket: string,
  region: string,
): string | null {
  const safeBucket = String(bucket || '').trim();
  const safeRegion = String(region || '').trim();
  if (!safeBucket || !safeRegion) return null;
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase();
  const expected = `${safeBucket}.s3.${safeRegion}.amazonaws.com`.toLowerCase();
  if (host !== expected) return null;
  const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!key || key.includes('..') || key.includes('\\')) return null;
  return key;
}
