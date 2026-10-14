import { getPrisma } from "@/lib/prisma";
import type { AlcanceFiscal } from "@/lib/fiscal/alcance";
import { raizesSincronizadas } from "./raizesSincronizadas";

/**
 * As raízes de CNPJ que um alcance autoriza consultar no SPED.
 *
 * ─── Por que isto existe ─────────────────────────────────────────────────────
 *
 * A consulta ao vivo de CT-e não passa pelo `where` do acervo: ela pergunta ao
 * SPED por `cnpj_raiz`, e o SPED não conhece `tenantId` nem `companyId`. Sem
 * uma tradução explícita, o parâmetro viria da URL e qualquer pessoa logada
 * leria o frete de qualquer contribuinte — o `whereDoAlcance` não protegeria
 * nada, porque nem seria chamado.
 *
 * Então esta é a fronteira: alcance entra, conjunto de raízes sai, e a rota só
 * aceita raiz que estiver no conjunto.
 *
 * ─── A mesma regra do `alcanceVazio` ─────────────────────────────────────────
 *
 * Alcance sem empresa devolve conjunto vazio, e conjunto vazio não autoriza
 * nada. É o espelho do `IN ()` do acervo: o "nada" precisa ser explícito, senão
 * vira "tudo" no primeiro `if` distraído.
 */
export async function raizesDoAlcance(alcance: AlcanceFiscal): Promise<Set<string>> {
  // As raízes são as que o SPED sincroniza, como no laço de sincronização —
  // a mesma lista, para a consulta ao vivo não autorizar raiz que a
  // sincronização não busca. Desde 14/10/2026 ela sai da fotografia de
  // `sped_sync_roots`, e não mais dos clientes (ver raizesSincronizadas.ts).
  const sincronizadas = await raizesSincronizadas(alcance.tenantId);
  if (alcance.tipo === "TENANT") return new Set(sincronizadas);

  // Alcance de empresas (o cliente no portal): das sincronizadas, só as raízes
  // do CNPJ das empresas que ele alcança. Sem empresa, nada.
  if (alcance.companyIds.length === 0) return new Set();
  const empresas = await getPrisma().company.findMany({
    where: { tenantId: alcance.tenantId, id: { in: alcance.companyIds }, cnpj: { not: null } },
    select: { cnpj: true },
  });
  const dasEmpresas = new Set(empresas.map((e) => (e.cnpj ?? "").replace(/\D/g, "").slice(0, 8)));
  return new Set(sincronizadas.filter((r) => dasEmpresas.has(r)));
}

/**
 * A janela de rota do mês corrente, em `AAAA-MM-DD`.
 *
 * Mês corrente é o recorte decidido em 09/09: CT-e não vira lançamento (vem sem
 * valor) e um único mês tem 2,3 a 4,8 milhões de documentos — 16 a 34 vezes o
 * acervo inteiro. Consulta ao vivo de um mês resolve o uso real, que é conferir
 * o frete que acabou de sair, sem crescer a tabela em nada.
 *
 * **A janela é de data de rota, não de competência.** As duas não coincidem: na
 * virada de ano medida pelo lado do SPED, uma janela de 29/12 a 03/01 tem 59%
 * de dezembro e 41% de janeiro. Quem quiser agrupar por competência agrupa pelo
 * campo `competencia` de cada linha, que vem exato da chave.
 */
export function janelaDoMesCorrente(hoje = new Date()): { de: string; ate: string } {
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  const primeiro = new Date(Date.UTC(ano, mes, 1));
  // Dia 0 do mês seguinte é o último dia deste — evita a tabela de 28/30/31.
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { de: iso(primeiro), ate: iso(ultimo) };
}

/** `AAAA-MM-DD` — o formato que a janela de rota aceita. */
export function ehDataValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}
