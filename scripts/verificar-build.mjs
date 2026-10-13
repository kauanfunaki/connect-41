#!/usr/bin/env node
// No Windows, Next pode remover server.js antes de descobrir que a pasta está bloqueada.
import { spawnSync } from "node:child_process";

if (process.platform === "win32") {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command",
    'Get-CimInstance Win32_Process -Filter "Name = \'node.exe\'" | Where-Object { $_.CommandLine -match \'(?i)node(?:\\.exe)?["\\s]+[^\\r\\n]*[\\\\/]standalone[\\\\/]server\\.js\' } | Select-Object -ExpandProperty ProcessId'],
  { encoding: "utf8" });
  if (result.status !== 0) {
    console.error("Não foi possível verificar se há standalone em execução. Build cancelado para preservar .next.");
    process.exit(1);
  }
  if (result.stdout.trim()) {
    console.error(`Build cancelado: há servidor standalone em execução (PID ${result.stdout.trim().split(/\s+/).join(", ")}).`);
    console.error("Encerre o servidor com Ctrl+C no terminal dele e execute npm run build novamente. Nenhum processo foi encerrado automaticamente.");
    process.exit(1);
  }
}
