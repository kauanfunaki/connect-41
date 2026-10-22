"use server";

import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { credenciaisDoSped } from "@/lib/sped/credenciais";
import { raizesSincronizadas } from "@/lib/sped/raizesSincronizadas";
import { criarClienteDoMotor, ErroDoMotor } from "@/lib/sped/motor";

/**
 * "Testar conexão" do motor SPED (22/10/2026): um `GET /saude` com o token de
 * leitura, na primeira raiz do escritório — a rota exige `cnpj_raiz`. Não
 * escreve nada; a escrita só é informada pelo que o motor declara
 * (`escrita_habilitada`) e pelo token gravado aqui. Nenhum token volta.
 */
export async function testarConexaoSped(): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { ok: false, erro: "Sem permissão para configurar integrações." };
  const creds = await credenciaisDoSped(ctx.tenantId);
  if (!creds) return { ok: false, erro: "Ligue a integração e preencha a URL e o token de serviço antes de testar." };
  const [raiz] = await raizesSincronizadas(ctx.tenantId);
  if (!raiz) return { ok: false, erro: "Nenhuma raiz de CNPJ liberada para o SPED neste escritório." };
  try {
    const s = await criarClienteDoMotor(creds).saude(raiz);
    const agentes = s.agentes.length === 0 ? "nenhum agente com sinal" : s.agentes.map((a) => `${a.agente_host}${a.segundos_sem_sinal != null ? ` (${a.segundos_sem_sinal}s)` : ""}`).join(", ");
    const escrita = !creds.tokenEscrita ? "escrita não configurada no Connect" : s.escrita_habilitada ? "escrita habilitada" : "escrita desligada no motor";
    return { ok: true, texto: `Motor respondeu (API v${s.versao_api}) · banco ${s.banco.ok ? "no ar" : "fora do ar"} · ${agentes} · ${escrita}.` };
  } catch (err) {
    return { ok: false, erro: err instanceof ErroDoMotor ? err.message : "Falha ao falar com o motor SPED." };
  }
}
