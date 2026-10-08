/**
 * Lista las rutas con un parámetro de objeto (:id, :numeroSerie…) que pasan por
 * TenantOwnershipGuard sin @TenantResource (ni en el método ni en la clase).
 * El guard las deja pasar y la pertenencia depende de que el servicio la valide.
 * Falla si aparece una ruta nueva que no esté en scripts/tenant-routes-baseline.txt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'scripts', 'tenant-routes-baseline.txt');
const NO_OBJETO = new Set(['page', 'limit', 'fecha', 'fechaInicio', 'fechaFin', 'hora', 'year', 'month', 'estatus']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (e.name.endsWith('.controller.ts')) out.push(f);
  }
  return out;
}

const encontradas = [];
for (const file of walk(path.join(root, 'src'))) {
  const s = fs.readFileSync(file, 'utf8');
  if (!s.includes('TenantOwnershipGuard')) continue;
  const cabecera = s.slice(0, s.indexOf('export class'));
  const claseGuard = /@UseGuards\([^)]*TenantOwnershipGuard/.test(cabecera);
  const claseRecurso = /@TenantResource\(/.test(cabecera);
  const re = /((?:\s*@[A-Za-z]+\((?:[^()]|\([^()]*\))*\))+)\s*(?:async\s+)?(\w+)\(/g;
  let m;
  while ((m = re.exec(s))) {
    const dec = m[1];
    const ruta = dec.match(/@(Get|Post|Put|Patch|Delete)\(\s*'([^']*)'/);
    if (!ruta) continue;
    const params = [...ruta[2].matchAll(/:(\w+)/g)].map((p) => p[1]).filter((p) => !NO_OBJETO.has(p));
    if (!params.length) continue;
    if (!(claseGuard || /TenantOwnershipGuard/.test(dec))) continue;
    if (claseRecurso || /@TenantResource\(/.test(dec)) continue;
    encontradas.push(`${path.basename(file)} ${ruta[1].toUpperCase()} ${ruta[2]}`);
  }
}

const baseline = fs.existsSync(baselinePath)
  ? new Set(fs.readFileSync(baselinePath, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')))
  : new Set();
if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(baselinePath, '# Rutas con :param sin @TenantResource; la pertenencia la valida el servicio.\n# Solo debe encoger. Regenerar: node scripts/lint-tenant-routes.mjs --write-baseline\n' + encontradas.sort().join('\n') + '\n');
  console.log(`baseline escrito: ${encontradas.length} rutas`);
  process.exit(0);
}
const nuevas = encontradas.filter((r) => !baseline.has(r));
if (nuevas.length) {
  console.error('Rutas nuevas con parámetro de objeto sin @TenantResource:\n' + nuevas.join('\n'));
  process.exit(1);
}
console.log(`Tenant: ${encontradas.length} rutas sin @TenantResource, todas en el baseline`);
