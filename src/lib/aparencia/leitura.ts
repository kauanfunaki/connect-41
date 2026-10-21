// A leitura da aparência do escritório (21/10/2026). Mesmo cuidado das telas
// bloqueadas do portal: nunca derruba nada — sem a tabela (deploy antes da
// migration) ou com o banco recusando, vale o padrão, que é o portal de antes.

import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { APARENCIA_PADRAO, corCanonica, lerCoresDosGrupos, type Aparencia } from "./cores";

/** `sem-tabela`: a migration ainda não rodou. `erro`: o banco recusou a leitura. */
export type LeituraDaAparencia = {
  aparencia: Aparencia;
  /** O logo do escritório (`tenants.logoUrl`) e o nome, que é o texto alternativo dele. */
  escritorio: { nome: string; logoUrl: string | null };
  situacao: "ok" | "sem-tabela" | "erro";
};

const SEM_ESCRITORIO = { nome: "Escritório", logoUrl: null };

let avisouSemTabela = false;

/** A aparência do escritório e o logo dele. Nunca lança. */
export async function lerAparencia(tenantId: string): Promise<LeituraDaAparencia> {
  if (!tenantId) return { aparencia: APARENCIA_PADRAO, escritorio: SEM_ESCRITORIO, situacao: "ok" };
  const prisma = getPrisma();
  // O logo vem de `tenants`, que sempre existe: lido à parte, para a falta da
  // tabela nova não esconder o logo da prévia.
  const escritorio = prisma.tenant
    .findUnique({ where: { id: tenantId }, select: { name: true, logoUrl: true } })
    .then((t) => (t ? { nome: t.name, logoUrl: t.logoUrl } : SEM_ESCRITORIO))
    .catch(() => SEM_ESCRITORIO);
  try {
    const linha = await prisma.tenantAparencia.findUnique({ where: { tenantId } });
    return {
      aparencia: linha
        ? {
            // Relido pelo cálculo: o que sai daqui vai para um <style>.
            corPrincipal: corCanonica(linha.corPrincipal),
            coresDosGrupos: lerCoresDosGrupos(linha.coresDosGrupos),
            coresPorGrupo: linha.coresPorGrupo,
            logoNoPortal: linha.logoNoPortal,
            noConnect: linha.noConnect,
          }
        : APARENCIA_PADRAO,
      escritorio: await escritorio,
      situacao: "ok",
    };
  } catch (err) {
    if (isPrismaMissingTableError(err)) {
      if (!avisouSemTabela) {
        avisouSemTabela = true;
        console.warn("[aparencia] tabela tenant_aparencias ainda não existe: vale o padrão até rodar a migration.");
      }
      return { aparencia: APARENCIA_PADRAO, escritorio: await escritorio, situacao: "sem-tabela" };
    }
    console.error("[aparencia] leitura", err);
    return { aparencia: APARENCIA_PADRAO, escritorio: await escritorio, situacao: "erro" };
  }
}

/** Uma leitura por requisição: o layout e o Início fazem a mesma pergunta. */
export const aparenciaDoEscritorio = cache(lerAparencia);

export const FALTA_ATUALIZAR_O_BANCO_DA_APARENCIA =
  "Falta atualizar o banco para guardar a aparência do portal (a migration “aparencia_do_escritorio”). Até lá o portal segue com as cores de sempre.";
