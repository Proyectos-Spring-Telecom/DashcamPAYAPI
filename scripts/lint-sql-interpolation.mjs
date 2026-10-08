/**
 * Falla si un SQL ejecutado interpola algo que no está en la lista blanca.
 * Los valores van en `?`. Lo permitido son listas de placeholders o fragmentos
 * constantes (fechas, nombre de tabla fijo, filtros `AND col = ?`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');

const ALLOW = new Set([
  'placeholders',
  'placeholdersCajero',
  'placeholdersPasajero',
  'whereSql',
  'whereClause',
  'fechaCondition',
  'fechaConditionActivo',
  'fechaConditionHistorico',
  'entidadDebito',
  'entidadRecarga',
  'condicionesWhereHistorico',
  'clienteFilter',
  'clienteFilter2',
  'baseFrom',
  'cols',
  'ultimaPosicionSubquery',
  "condiciones.join(' AND ')",
  'condiciones.join(" AND ")',
  "Number(rol) !== 1 ? 'AND cli.Id IN (?)' : ''",
  "cliente != null ? 'AND cli.Id IN (?)' : ''",
  "filtros.idInstalacion ? 'AND ins.Id = ?' : ''",
  "filtros.idOperador ? 'AND (o.Id = ? OR o.Id IS NULL)' : ''",
  "filtros.idRuta ? 'AND r.Id = ?' : ''",
  "filtros.idValidador ? 'AND disp.Id = ?' : ''",
  "filtros.idVehiculo ? 'AND veh.Id = ?' : ''",
]);

const MIGRATION_ALLOW = new Set([
  'table',
  'check.table',
  'check.column',
  'check.name',
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

function templatesOf(text) {
  const found = [];
  const re = /`(?:\\`|[^`])*`/g;
  let match;
  while ((match = re.exec(text))) {
    found.push({ expr: match[0], index: match.index });
  }
  return found;
}

function assignedSqlNames(text) {
  const names = new Set();
  const re = /\b(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*`/g;
  let match;
  while ((match = re.exec(text))) {
    const start = match.index + match[0].length - 1;
    const lit = text.slice(start);
    const end = lit.slice(1).indexOf('`');
    if (end < 0) continue;
    const body = lit.slice(0, end + 2);
    if (/\b(SELECT|UPDATE|DELETE|INSERT|CALL|WHERE|ALTER)\b/i.test(body)) {
      names.add(match[1]);
    }
  }
  return names;
}

const failures = [];

for (const file of walk(src)) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  const migration = rel.startsWith(`src${path.sep}migrations${path.sep}`);
  const sqlVars = assignedSqlNames(text);
  const queryArg = /\.query\(\s*([A-Za-z_][A-Za-z0-9_]*)/g;
  const used = new Set();
  let call;
  while ((call = queryArg.exec(text))) used.add(call[1]);

  for (const lit of templatesOf(text)) {
    // mysql2 cuenta cualquier ? como placeholder, también dentro de comentarios SQL.
    if (/\b(SELECT|UPDATE|DELETE|INSERT|WHERE)\b/i.test(lit.expr)) {
      const comments = lit.expr.match(/--[^\n]*|\/\*[\s\S]*?\*\//g) || [];
      if (comments.some((c) => c.includes('?'))) {
        const line = text.slice(0, lit.index).split('\n').length;
        failures.push(`${rel}:${line} ? dentro de un comentario SQL`);
      }
    }
    if (!lit.expr.includes('${')) continue;
    const direct = text.slice(Math.max(0, lit.index - 20), lit.index).includes('.query(');
    const before = text.slice(Math.max(0, lit.index - 80), lit.index);
    const assigned = /(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*$/.exec(before);
    const name = assigned?.[1];
    const executed = direct || (name && sqlVars.has(name) && used.has(name));
    if (!executed) continue;

    for (const raw of lit.expr.matchAll(/\$\{([^}]+)\}/g)) {
      const expr = raw[1].trim();
      const ok =
        ALLOW.has(expr) ||
        expr.startsWith('placeholders') ||
        (migration && MIGRATION_ALLOW.has(expr));
      if (!ok) {
        const line = text.slice(0, lit.index).split('\n').length;
        failures.push(`${rel}:${line} \${${expr}}`);
      }
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('SQL: interpolaciones revisadas, solo fragmentos de la lista blanca');
