// Non-storybook `package` adapter. Bundles dist/ when present (the authoritative
// component list comes from shipped .d.ts; with no dist it synthesizes an
// entry from src/ as a last resort) and opportunistically enriches each
// component from src/ — JSDoc and dir-derived group. Every enrichment miss
// degrades to the plain-dist behaviour.
//
// Discovery is heuristic-based; each heuristic has a `.design-sync/config.json`
// override (ASSUMPTION comments below name them) so repos that don't match the
// defaults write config, not code. `componentSrcMap` is the single override
// knob for component inclusion: non-null value = add/pin src path, null =
// exclude a .d.ts-exported internal.

// forked from design-sync lib/source-kit.mjs — exclude componentSrcMap:null
// files from the synth entry itself, not just the post-hoc component list
import { existsSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { Project, Node, ts } from 'ts-morph';
import { leadingJsdoc, readText, slash, walk } from '../../.ds-sync/lib/common.mjs';
import { resolveDistEntry } from '../../.ds-sync/lib/bundle.mjs';
import { exportedNames, isComponentName } from '../../.ds-sync/lib/dts.mjs';

const NON_IMPL_RX = /\.(stories|test|spec)\./;
const SRC_IMPL_RX = /\.(tsx|jsx)$/;
// Dir names that don't usefully group components — skip so the emitted path
// is `components/<group>/<Name>` not `components/components/<Name>`.
const GENERIC_DIR = new Set(['components', 'component', 'src', 'lib', 'ui', 'packages', 'react']);
const slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'general';

// forked: name -> [file, ...] for every PascalCase value export, shared by
// entry-synthesis (to alias-export collisions) and component derivation (to
// disambiguate them) — a name exported by >1 file silently loses all but one
// under the upstream Set-based dedup, and the bundle's blanket `export *`
// silently drops the binding entirely too (ES module ambiguous-star-export
// rule), so window.<GLOBAL>.<Name> ends up undefined for every one of them.
function scanExportsByFile(srcFiles) {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, allowJs: true, skipLibCheck: true },
  });
  const byName = new Map();
  for (const p of srcFiles) {
    if (NON_IMPL_RX.test(p) || !SRC_IMPL_RX.test(p)) continue;
    const sf = project.addSourceFileAtPathIfExists(p);
    if (!sf) continue;
    for (const [name, decls] of sf.getExportedDeclarations()) {
      // `export default function Button()` is keyed as 'default' — recover
      // the declared name from the function/class node.
      const real = name === 'default'
        ? decls.map((d) => d.getName?.()).find((n) => n && n !== 'default')
        : name;
      if (!real || !/^[A-Z][A-Za-z0-9]*$/.test(real)) continue;
      if (decls.some((d) => Node.isVariableDeclaration(d) || Node.isFunctionDeclaration(d) || Node.isClassDeclaration(d))) {
        if (!byName.has(real)) byName.set(real, []);
        const files = byName.get(real);
        if (!files.includes(p)) files.push(p);
      }
    }
  }
  return byName;
}

const dirPrefix = (f) => { const d = basename(dirname(f)); return d.charAt(0).toUpperCase() + d.slice(1); };

// No .d.ts → scan src files for PascalCase value exports via ts-morph.
function deriveComponentsFromSrc(byName) {
  const result = [];
  for (const [name, files] of byName) {
    if (files.length === 1) {
      result.push({ name, group: 'general' });
    } else {
      // Collision: disambiguate by parent-dir prefix and pre-resolve
      // srcPath/group/doc directly — the later fuzzy filename-match would
      // never find "EmpresasDeleteButton" inside a file literally named
      // DeleteButton.tsx, so enrichment would silently skip these otherwise.
      for (const f of files) {
        const group = slug(basename(dirname(f)));
        result.push({
          name: `${dirPrefix(f)}${name}`,
          group,
          srcPath: f,
          exportedAs: name,
          doc: leadingJsdoc(readText(f), name) || undefined,
        });
      }
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolvePackage(ctx) {
  const { PKG_DIR, pkgJson, ENTRY_OVERRIDE, PKG, OUT, cfg } = ctx;
  const srcMap = cfg.componentSrcMap ?? {};

  // ── 1. src/ discovery (best-effort; feeds enrichment + synth-entry fallback).
  // ASSUMPTION: source root is first of src/ | lib/ | components/. Override: cfg.srcDir.
  const srcRoot = [cfg.srcDir, 'src', 'lib', 'components']
    .map((d) => d && resolve(PKG_DIR, d))
    .find((d) => d && existsSync(d));
  const srcFiles = srcRoot ? walk(srcRoot, (n) => /\.(tsx|jsx|mdx?)$/.test(n)) : [];
  // forked: computed once, shared by entry-synthesis (alias collisions) and
  // component derivation (disambiguate them) — see scanExportsByFile above.
  const exportCollisions = scanExportsByFile(srcFiles);

  // ── 2. entry: dist if it exists, else synthesize from src/ (last resort).
  let entry = resolveDistEntry({ pkgDir: PKG_DIR, pkgJson, override: ENTRY_OVERRIDE, pkgName: PKG, soft: true });
  let synthEntry = false;
  if (!entry) {
    if (!srcRoot) {
      console.error(`[NO_DIST] ${PKG} has no built entry and no src/ to synthesize from — run its build.`);
      process.exit(1);
    }
    // forked: also exclude files whose basename is null-mapped in
    // cfg.componentSrcMap BEFORE synthesizing the entry — the upstream
    // version only applies that exclusion to the post-hoc component list,
    // so a file with a value-level import unsafe to bundle (e.g. a real
    // Next.js server action, not just its type) still made it into the
    // synth entry and broke the whole bundle. Filename === component name
    // holds for this repo's one-component-per-file layout.
    const comps = srcFiles
      .filter((p) => SRC_IMPL_RX.test(p) && !NON_IMPL_RX.test(p))
      .filter((p) => srcMap[basename(p).replace(/\.(tsx|jsx)$/, '')] !== null);
    entry = join(OUT, '.pkg-entry.mjs');
    // forked: a plain `export *` silently drops any name two-plus files
    // export in common (ES module ambiguous-star-export rule) — add an
    // explicit aliased named re-export per collision so each one still
    // reaches window.<GLOBAL> under a disambiguated name.
    const collisionLines = [];
    for (const [name, files] of exportCollisions) {
      if (files.length < 2) continue;
      for (const f of files) collisionLines.push(`export { ${name} as ${dirPrefix(f)}${name} } from ${JSON.stringify(f)};`);
    }
    // forked: cfg.extraEntries is bounded to workspaceRoot, which the
    // external --node-modules staging (see NOTES.md) leaves pointed outside
    // this repo's git tree, so a mock-router extraEntries path always gets
    // skipped as "outside the workspace root." Injecting the export directly
    // into the synth entry bypasses that check entirely (it only gates
    // config-declared paths, not lines the entry file already contains) —
    // same mechanism as the collision aliasing above, just an absolute path
    // instead of a discovered one.
    const mockRouterPath = join(PKG_DIR, '.design-sync', 'mock-router.tsx');
    const extraLines = existsSync(mockRouterPath)
      ? [`export { MockRouterProvider } from ${JSON.stringify(mockRouterPath)};`]
      : [];
    writeFileSync(
      entry,
      comps.map((p) => `export * from ${JSON.stringify(p)};`).concat(collisionLines, extraLines).join('\n') + '\n',
    );
    synthEntry = true;
    console.error(
      `[NO_DIST] no built entry — synthesizing from ${comps.length} src files (run the package's build for best results)`,
    );
  }

  // ── 3. component list: from shipped .d.ts (authoritative when dist exists).
  // ASSUMPTION: components = PascalCase value exports in the .d.ts tree.
  // Override: cfg.componentSrcMap (non-null adds/pins, null excludes).
  const exported = exportedNames(PKG_DIR, pkgJson);
  const names = new Set([...exported].filter(isComponentName));
  for (const [k, v] of Object.entries(srcMap)) {
    if (v === null) { names.delete(k); continue; }
    // Names reach `<script>` blocks in the emitted HTML — reject anything
    // that isn't a plain PascalCase identifier.
    if (!/^[A-Z][A-Za-z0-9]*$/.test(k)) {
      console.error(`[CONFIG] componentSrcMap: "${k}" is not a valid component name (PascalCase identifiers only)`);
      continue;
    }
    names.add(k);
  }
  let components = [...names].sort().map((name) => ({ name, group: 'general' }));
  if (!components.length && synthEntry) {
    components = deriveComponentsFromSrc(exportCollisions).filter((c) => srcMap[c.name] !== null);
  }
  if (!components.length) {
    if (cfg.cssEntry || existsSync(join(PKG_DIR, 'styles.css'))) {
      console.error('[ZERO_MATCH] no component exports — treating as tokens-only DS');
      return { shape: 'package', entry, components: [], tokensOnly: true };
    }
    console.error(`[ZERO_MATCH] no PascalCase exports in ${PKG} and no styles — nothing to sync`);
    process.exit(1);
  }

  // ── 4. src/ enrichment per component. Every miss degrades to plain-dist.
  if (srcRoot) {
    for (const c of components) {
      // Pinned via config → skip fuzzy-find entirely.
      let hit = typeof srcMap[c.name] === 'string' ? slash(resolve(PKG_DIR, srcMap[c.name])) : null;
      if (!hit) {
        // ASSUMPTION: <Name>.tsx | <name>/<name>.tsx | <Name>/index.tsx |
        // <kebab-name>.tsx, case-insensitive; dir-match ranks above
        // bare-file match, then prefer one that actually exports `c.name`.
        // Override: cfg.componentSrcMap.
        const kebab = c.name.replace(/([a-z0-9])([A-Z])/g, '$1-$2');
        const nameRx = new RegExp(
          `(?:^|/)(?:${c.name}/(?:index|${c.name})\\.(tsx|jsx)|(?:${c.name}|${kebab})\\.(tsx|jsx))$`,
          'i',
        );
        const hits = srcFiles
          .filter((p) => nameRx.test(p) && !NON_IMPL_RX.test(p))
          .sort(
            (a, b) =>
              (b.toLowerCase().includes(`/${c.name.toLowerCase()}/`) ? 1 : 0) -
              (a.toLowerCase().includes(`/${c.name.toLowerCase()}/`) ? 1 : 0),
          );
        const exportRx = new RegExp(`export\\s+(?:default\\s+)?(?:const|let|var|function|class)\\s+${c.name}\\b`);
        hit = hits.find((p) => exportRx.test(readText(p))) ?? hits[0];
      }
      if (!hit || !existsSync(hit)) continue;
      c.srcPath = hit;
      c.doc = leadingJsdoc(readText(hit), c.name) || undefined;
      // group = last src/ path segment that isn't the component's own dir or
      // a generic container name — else JSDoc @category — else 'general'.
      c.group = slug(
        slash(relative(srcRoot, dirname(hit)))
          .split('/')
          .filter((s) => s && s.toLowerCase() !== c.name.toLowerCase() && !GENERIC_DIR.has(s.toLowerCase()))
          .at(-1)
        || (c.doc && /@category\s+(\S+)/.exec(c.doc)?.[1])
        || 'general',
      );
    }
  }

  console.error(
    `  package: ${components.length} components` +
      (srcRoot ? ` (${components.filter((c) => c.srcPath).length} src-matched)` : ' (no src/ — dist-only)'),
  );
  return { shape: 'package', entry, components, synthEntry, exported };
}
