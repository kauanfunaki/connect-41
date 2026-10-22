// Build local em cópia sem credenciais, sem disputar .next com outros trabalhos.
import { access, cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const raiz = process.cwd(), base = path.join(raiz, ".local", "tech-interno");
await mkdir(base, { recursive: true });
const workspace = process.argv.includes("--refresh") ? JSON.parse(await readFile(path.join(base, "build-workspace.json"), "utf8")).workspace : await mkdtemp(path.join(base, "build-"));
if (path.dirname(path.resolve(workspace)) !== base || !path.basename(workspace).startsWith("build-")) throw new Error("Cópia fora de .local/tech-interno recusada.");
for (const name of ["src", "prisma", "public", "package.json", "package-lock.json", "next.config.ts", "next-env.d.ts", "tsconfig.json", "postcss.config.mjs", "scripts/preparar-standalone.mjs"]) {
  await cp(path.join(raiz, name), path.join(workspace, name), { recursive: true });
}
if (!await access(path.join(workspace, "node_modules")).then(() => true, () => false)) await symlink(path.join(raiz, "node_modules"), path.join(workspace, "node_modules"), "junction");
console.log("Build isolado em " + workspace);
const sistema = Object.fromEntries(["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "COMSPEC", "PATHEXT", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE"].flatMap(k => process.env[k] ? [[k, process.env[k]]] : []));
const env = { ...sistema, DATABASE_URL: "mysql://root:tech-interno-fixture@127.0.0.1:33379/connect41", NEXT_TELEMETRY_DISABLED: "1", JWT_ACCESS_SECRET: "tech-interno-build-local-ficticio", JWT_REFRESH_SECRET: "tech-interno-refresh-ficticio" };
const build = spawnSync(process.execPath, [path.join(raiz, "node_modules/next/dist/bin/next"), "build", "--webpack"], { cwd: workspace, env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, windowsHide: true });
await writeFile(path.join(base, "build.log"), (build.stdout ?? "") + (build.stderr ?? ""));
if (build.status !== 0) { console.error((build.stdout ?? "").slice(-4000) + (build.stderr ?? "").slice(-4000)); process.exitCode = build.status ?? 1; }
else {
  const assets = spawnSync(process.execPath, ["scripts/preparar-standalone.mjs"], { cwd: workspace, env, encoding: "utf8", windowsHide: true });
  if (assets.status !== 0) throw new Error(assets.stderr);
  await writeFile(path.join(base, "build-workspace.json"), JSON.stringify({ workspace }));
  console.log("Build concluído; log em .local/tech-interno/build.log.");
}
