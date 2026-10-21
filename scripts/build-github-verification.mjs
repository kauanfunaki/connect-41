// Cópia de build sem .env e sem interferir nos servidores e builds já abertos.
import { access, cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd(), base = path.join(root, ".local", "github");
await mkdir(base, { recursive: true });
const workspace = process.argv.includes("--refresh") ? JSON.parse(await readFile(path.join(base, "build-workspace.json"), "utf8")).workspace : await mkdtemp(path.join(base, "build-"));
if (path.dirname(path.resolve(workspace)) !== base || !path.basename(workspace).startsWith("build-")) throw new Error("Workspace de verificação fora de .local/github recusado.");
for (const name of ["src", "prisma", "public", "package.json", "package-lock.json", "next.config.ts", "next-env.d.ts", "tsconfig.json", "postcss.config.mjs", "scripts/preparar-standalone.mjs"]) await cp(path.join(root, name), path.join(workspace, name), { recursive: true });
if (!await access(path.join(workspace, "node_modules")).then(() => true, () => false)) await symlink(path.join(root, "node_modules"), path.join(workspace, "node_modules"), "junction");
const system = Object.fromEntries(["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "COMSPEC", "PATHEXT", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE"].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
const env = { ...system, DATABASE_URL: "mysql://root:github-fixture@127.0.0.1:33381/connect41", NEXT_TELEMETRY_DISABLED: "1", JWT_ACCESS_SECRET: "github-build-fixture", JWT_REFRESH_SECRET: "github-refresh-fixture", SECRETS_ENCRYPTION_KEY: "github-encryption-fixture" };
console.log("Build isolado em " + workspace);
const result = spawnSync(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"], { cwd: workspace, env, encoding: "utf8", maxBuffer: 25 * 1024 * 1024, windowsHide: true });
await writeFile(path.join(base, "build.log"), (result.stdout ?? "") + (result.stderr ?? ""));
if (result.status !== 0) { console.error(((result.stdout ?? "") + (result.stderr ?? "")).slice(-6500)); process.exitCode = result.status ?? 1; }
else {
  const assets = spawnSync(process.execPath, ["scripts/preparar-standalone.mjs"], { cwd: workspace, env, encoding: "utf8", windowsHide: true });
  if (assets.status !== 0) throw new Error(assets.stderr);
  await writeFile(path.join(base, "build-workspace.json"), JSON.stringify({ workspace }));
  console.log("Build e standalone concluídos. Log: .local/github/build.log");
}
