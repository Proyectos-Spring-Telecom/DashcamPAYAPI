/**
 * Recorre TODOS los controllers y falla si una ruta con parámetro de objeto
 * (:id, :numeroSerie…) no declara una de estas dos cosas (en el método o en la clase):
 *   - @TenantResource(...) con TenantOwnershipGuard aplicado, o
 *   - @TenantExempt('motivo') (catálogo global o pertenencia validada en el servicio).
 * TenantOwnershipGuard niega en runtime las rutas con parámetro de objeto sin
 * ninguna de las dos (fail-closed); este lint lo detecta antes del despliegue.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Mismo criterio que PARAMS_NO_OBJETO en tenant-ownership.guard.ts.
const NO_OBJETO = new Set(['page', 'limit', 'fecha', 'fechaInicio', 'fechaFin', 'hora', 'year', 'month', 'estatus', 'cp']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (e.name.endsWith('.controller.ts')) out.push(f);
  }
  return out;
}

const sinDeclarar = [];
const sinGuard = [];
for (const file of walk(path.join(root, 'src'))) {
  const s = fs.readFileSync(file, 'utf8');
  const cabecera = s.slice(0, s.indexOf('export class'));
  const claseGuard = /@UseGuards\([^)]*TenantOwnershipGuard/.test(cabecera);
  const claseRecurso = /@TenantResource\(/.test(cabecera);
  const claseExenta = /@TenantExempt\(/.test(cabecera);
  const re = /((?:\s*@[A-Za-z]+\((?:[^()]|\([^()]*\))*\))+)\s*(?:async\s+)?(\w+)\(/g;
  let m;
  while ((m = re.exec(s))) {
    const dec = m[1];
    const ruta = dec.match(/@(Get|Post|Put|Patch|Delete)\(\s*'([^']*)'/);
    if (!ruta) continue;
    const params = [...ruta[2].matchAll(/:(\w+)/g)].map((p) => p[1]).filter((p) => !NO_OBJETO.has(p));
    if (!params.length) continue;
    const etiqueta = `${path.relative(root, file).replace(/\\/g, '/')} ${ruta[1].toUpperCase()} ${ruta[2]}`;
    if (claseExenta || /@TenantExempt\(/.test(dec)) continue;
    if (!(claseRecurso || /@TenantResource\(/.test(dec))) {
      sinDeclarar.push(etiqueta);
      continue;
    }
    if (!(claseGuard || /TenantOwnershipGuard/.test(dec))) sinGuard.push(etiqueta);
  }
}

if (sinDeclarar.length || sinGuard.length) {
  if (sinDeclarar.length) {
    console.error('Rutas con parámetro de objeto sin @TenantResource ni @TenantExempt:\n' + sinDeclarar.join('\n'));
  }
  if (sinGuard.length) {
    console.error('Rutas con @TenantResource sin TenantOwnershipGuard (el decorador queda inerte):\n' + sinGuard.join('\n'));
  }
  process.exit(1);
}
console.log('Tenant: todas las rutas con parámetro de objeto declaran @TenantResource (con guard) o @TenantExempt');
