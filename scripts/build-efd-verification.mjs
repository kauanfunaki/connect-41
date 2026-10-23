// Build local em cópia sem credenciais, sem disputar .next com outros trabalhos.
import { access, cp, mkdir, mkdtemp, readFile, symlink, writeFile, stat, rm, realpath } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const raiz = process.cwd(), base = path.join(raiz, ".local", "efd");
await mkdir(base, { recursive: true });
const workspace = process.argv.includes("--refresh") ? JSON.parse(await readFile(path.join(base, "build-workspace.json"), "utf8")).workspace : await mkdtemp(path.join(base, "build-"));
if (path.dirname(path.resolve(workspace)) !== base || !path.basename(workspace).startsWith("build-")) throw new Error("Cópia fora de .local/efd recusada.");
// Reaproveita o cache, mas sincroniza os fontes sem conservar rotas removidas.
if (process.argv.includes("--refresh")) {
  const copia = await realpath(workspace), baseReal = await realpath(base);
  if (path.dirname(copia) !== baseReal) throw new Error("Pasta de verificação fora da área isolada.");
  for (const name of ["src", "prisma", "public"]) {
    const destino = path.join(copia, name);
    const real = await realpath(destino).catch(() => destino);
    if (path.dirname(destino) !== copia || !real.startsWith(copia + path.sep)) throw new Error("Destino de limpeza inválido.");
    await rm(destino, { recursive: true, force: true });
  }
}
for (const name of ["src", "prisma", "public", "package.json", "package-lock.json", "next.config.ts", "next-env.d.ts", "tsconfig.json", "postcss.config.mjs", "scripts/preparar-standalone.mjs"]) {
  await cp(path.join(raiz, name), path.join(workspace, name), { recursive: true, filter: async (origem, destino) => {
    if (!(await stat(origem)).isFile()) return true;
    try { return !(await readFile(origem)).equals(await readFile(destino)); } catch { return true; }
  } });
}
if (!await access(path.join(workspace, "node_modules")).then(() => true, () => false)) await symlink(path.join(raiz, "node_modules"), path.join(workspace, "node_modules"), "junction");
console.log("Build isolado em " + workspace);
const sistema = Object.fromEntries(["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "COMSPEC", "PATHEXT", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE"].flatMap(k => process.env[k] ? [[k, process.env[k]]] : []));
const env = { ...sistema, DATABASE_URL: "mysql://root:efd-ci-only@127.0.0.1:33382/connect41", NEXT_TELEMETRY_DISABLED: "1", JWT_ACCESS_SECRET: "efd-build-local-ficticio", JWT_REFRESH_SECRET: "efd-refresh-ficticio" };
const build = spawnSync(process.execPath, [path.join(raiz, "node_modules/next/dist/bin/next"), "build", "--webpack"], { cwd: workspace, env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, windowsHide: true });
await writeFile(path.join(base, "build.log"), (build.stdout ?? "") + (build.stderr ?? ""));
if (build.status !== 0) { console.error((build.stdout ?? "").slice(-4000) + (build.stderr ?? "").slice(-4000)); process.exitCode = build.status ?? 1; }
else {
  const assets = spawnSync(process.execPath, ["scripts/preparar-standalone.mjs"], { cwd: workspace, env, encoding: "utf8", windowsHide: true });
  if (assets.status !== 0) throw new Error(assets.stderr);
  await writeFile(path.join(base, "build-workspace.json"), JSON.stringify({ workspace }));
  console.log("Build concluído; log em .local/efd/build.log.");
}
