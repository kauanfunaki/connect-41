/** A simulação só pode consultar e escrever no banco de demonstração desta máquina. */
export function bancoFiscalLocal(url = process.env.DATABASE_URL): boolean {
  try {
    const banco = new URL(url ?? "");
    return banco.protocol === "mysql:" && ["localhost", "127.0.0.1"].includes(banco.hostname)
      && banco.port === "3307" && banco.pathname === "/connect41";
  } catch { return false; }
}
