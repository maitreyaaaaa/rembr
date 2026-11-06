import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(scriptDirectory, '..');
const sourceRoot = resolve(apiRoot, 'src');
const outputPath = resolve(apiRoot, '../../docs/architecture/api-route-inventory.md');
const checkOnly = process.argv.includes('--check');

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function parse(path) {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function callName(node) {
  if (!ts.isCallExpression(node)) return null;
  if (ts.isIdentifier(node.expression)) return { object: null, method: node.expression.text, callee: node.expression.text };
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  const object = ts.isIdentifier(node.expression.expression) ? node.expression.expression.text : null;
  return { object, method: node.expression.name.text, callee: node.expression.getText() };
}

function stringArg(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}

function visit(node, visitor) {
  visitor(node);
  ts.forEachChild(node, (child) => visit(child, visitor));
}

function discoverMounts(appFile) {
  const source = parse(appFile);
  const imports = new Map();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    const modulePath = resolve(dirname(appFile), `${statement.moduleSpecifier.text.replace(/\.js$/, '')}.ts`);
    for (const specifier of clause.namedBindings.elements) imports.set(specifier.name.text, modulePath);
  }
  const mounts = new Map();
  visit(source, (node) => {
    const call = callName(node);
    if (call?.object !== 'app' || call.method !== 'use') return;
    const prefix = stringArg(node.arguments[0]);
    if (prefix === null) return;
    for (const argument of node.arguments.slice(1)) {
      visit(argument, (nested) => {
        const candidate = callName(nested);
        const file = candidate?.callee ? imports.get(candidate.callee) : undefined;
        if (!file) return;
        const known = mounts.get(file) ?? new Set();
        known.add(prefix);
        mounts.set(file, known);
      });
    }
  });
  return mounts;
}

function middlewareMarkers(nodes, inherited = []) {
  const text = nodes.map((node) => node.getText()).join(' ');
  const markers = [...inherited];
  if (/\b(signedIn|requireUser|requireSignedIn|authenticate|requireAuth)\b/.test(text)) markers.push('signed-in');
  if (/\brequireApiKey\b/.test(text)) markers.push('api-key');
  if (/\b(requireCurrentTerms|termsCurrent)\b/.test(text)) markers.push('terms-current');
  if (/\b(profile|requireCompletedProfile)\b/.test(text)) markers.push('profile-complete');
  if (/\b(rateLimit|RateLimit)\b|\b[A-Za-z]*Limit(?:er)?\b/.test(text)) markers.push('rate-limited');
  if (/\b\w*[Uu]pload\w*\s*\./.test(text)) markers.push('upload');
  return [...new Set(markers)].sort();
}

const appFile = resolve(sourceRoot, 'app.ts');
const mounts = discoverMounts(appFile);
const rows = [];
for (const file of sourceFiles(sourceRoot)) {
  const source = parse(file);
  const localRoutes = [];
  const inheritedByRouter = new Map();
  visit(source, (node) => {
    const call = callName(node);
    if (call?.method !== 'use' || !call.object || !node.arguments.length) return;
    const prefix = stringArg(node.arguments[0]);
    if (prefix !== null) return;
    const current = inheritedByRouter.get(call.object) ?? [];
    inheritedByRouter.set(call.object, middlewareMarkers(node.arguments, current));
  });
  visit(source, (node) => {
    const call = callName(node);
    if (!call || !['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(call.method)) return;
    if (!['router', 'app', 'publicApi', 'management'].includes(call.object)) return;
    const path = stringArg(node.arguments[0]);
    const sourceName = relative(resolve(apiRoot, '..', '..'), file).split(sep).join('/');
    const basePrefixes = call.object === 'app'
      ? ['']
      : [...(mounts.get(file) ?? (relative(sourceRoot, file).split(sep).join('/') === 'integrations/api-v1.ts' ? new Set(['/api/v1']) : new Set(['/api'])))];
    const inherited = call.object === 'router' ? inheritedByRouter.get(call.object) ?? [] : [];
    const guards = middlewareMarkers(node.arguments.slice(1, -1), inherited);
    for (const prefix of basePrefixes) {
      const routePath = path === null ? '[dynamic]' : `${prefix}${path.startsWith('/') ? path : `/${path}`}`;
      localRoutes.push({ method: call.method.toUpperCase(), path: routePath || '/', guards, source: sourceName, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    }
  });
  rows.push(...localRoutes);
}

rows.sort((left, right) => left.path.localeCompare(right.path) || left.method.localeCompare(right.method) || left.source.localeCompare(right.source) || left.line - right.line);
const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const lines = [
  '# API route inventory',
  '',
  '> Generated from Express route declarations under `apps/api/src`. Middleware markers are source-level signals for review; they do not prove runtime authorization or policy correctness.',
  '',
  '| Method | Path | Middleware markers | Source |',
  '| --- | --- | --- | --- |',
  ...rows.map((route) => `| ${route.method} | ${escapeCell(route.path)} | ${route.guards.length ? route.guards.join(', ') : 'none detected'} | [${route.source}:${route.line}](../../${route.source}#L${route.line}) |`),
  '',
  `Route declarations found: ${rows.length}.`,
  '',
];
const generated = lines.join('\n');
if (rows.length === 0) {
  console.error('No route declarations found; refusing to write an empty inventory.');
  process.exitCode = 1;
} else if (checkOnly) {
  let existing = '';
  try { existing = readFileSync(outputPath, 'utf8'); } catch { /* The initial generation has no previous file. */ }
  if (existing !== generated) {
    console.error('API route inventory is stale. Run `npm run routes:inventory` and review the diff.');
    process.exitCode = 1;
  } else {
    console.log(`API route inventory is current (${rows.length} declarations).`);
  }
} else {
  writeFileSync(outputPath, generated, 'utf8');
  console.log(`Wrote ${relative(resolve(apiRoot, '..', '..'), outputPath).split(sep).join('/')} (${rows.length} declarations).`);
}
