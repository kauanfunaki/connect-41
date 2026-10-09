// A lista de empresas da tela inicial dos Arquivos: quantos documentos cada uma
// tem e o que o cliente mandou que a equipe ainda não abriu. Regras puras em
// ./listaDeEmpresas.

import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { nomeExibicao } from "@/lib/companyName";
import { digitsOnly } from "@/lib/validation/common";
import { caminhoDaPasta, caminhoNaLixeira, CHAVE_ENVIADOS, mapaDePastas, podeVerCaminho } from "./regras";
import { SELECT_PASTA } from "./servidor";
import { totaisDoConnect } from "./doConnect";
import { novosPorPasta, ordenarEmpresas, paginar, type EmpresaNaLista } from "./listaDeEmpresas";

export type EmpresaDosArquivos = EmpresaNaLista & {
  /** Arquivos + "Do Connect": o número da etiqueta. */
  documentos: number;
  /** Abre direto em "Enviados pelo cliente" quando há novidade. */
  pastaDeEnviados: string | null;
};

export async function empresasDosArquivos(
  ctx: AuthContext,
  { termo, pagina, agora = new Date() }: { termo: string; pagina: number; agora?: Date }
): Promise<{ itens: EmpresaDosArquivos[]; pagina: number; paginas: number; total: number; comNovidade: number }> {
  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  const digitos = digitsOnly(termo);

  const empresas = await prisma.company.findMany({
    where: {
      tenantId,
      ...(termo
        ? {
            OR: [
              { name: { contains: termo } },
              { displayName: { contains: termo } },
              { tradeName: { contains: termo } },
              ...(digitos && digitos.length >= 3 ? [{ cnpj: { contains: digitos } }] : []),
            ],
          }
        : { status: "ACTIVE" as const }),
    },
    select: { id: true, name: true, displayName: true, cnpj: true },
  });
  const ids = empresas.map((e) => e.id);
  if (ids.length === 0) return { itens: [], pagina: 1, paginas: 1, total: 0, comNovidade: 0 };

  // As pastas das empresas, para contar só o que quem pede vê (pasta de setor,
  // lixeira) — a mesma régua do navegador.
  const [pastas, porPasta, envios, vistas] = await Promise.all([
    prisma.driveFolder.findMany({ where: { tenantId, companyId: { in: ids } }, select: SELECT_PASTA }),
    prisma.driveFile.groupBy({
      by: ["folderId"],
      where: { tenantId, deletedAt: null, folder: { companyId: { in: ids } } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.driveFile.findMany({
      where: { tenantId, deletedAt: null, uploadedByPortalUserId: { not: null }, folder: { companyId: { in: ids } } },
      select: { folderId: true, createdAt: true },
    }),
    prisma.driveFolderSeen.findMany({ where: { tenantId }, select: { folderId: true, seenAt: true } }),
  ]);
  const mapa = mapaDePastas(pastas);
  const visivel = new Map<string, string>(); // pasta visível → empresa
  const enviadosDa = new Map<string, string>(); // empresa → pasta de envios
  for (const p of pastas) {
    const c = caminhoDaPasta(p.id, mapa);
    if (!p.companyId || !c || caminhoNaLixeira(c) || !podeVerCaminho(ctx, c)) continue;
    visivel.set(p.id, p.companyId);
    if (p.systemKey === CHAVE_ENVIADOS) enviadosDa.set(p.companyId, p.id);
  }

  const novos = novosPorPasta(
    envios.filter((e) => visivel.has(e.folderId)).map((e) => ({ folderId: e.folderId, criadoEm: e.createdAt })),
    new Map(vistas.map((v) => [v.folderId, v.seenAt])),
    agora
  );
  const porEmpresa = new Map<string, { arquivos: number; ultimo: Date | null; novos: number; ultimoNovo: Date | null }>();
  const daEmpresa = (id: string) => {
    let e = porEmpresa.get(id);
    if (!e) porEmpresa.set(id, (e = { arquivos: 0, ultimo: null, novos: 0, ultimoNovo: null }));
    return e;
  };
  for (const g of porPasta) {
    const companyId = visivel.get(g.folderId);
    if (!companyId) continue;
    const e = daEmpresa(companyId);
    e.arquivos += g._count._all;
    if (g._max.createdAt && (!e.ultimo || g._max.createdAt > e.ultimo)) e.ultimo = g._max.createdAt;
  }
  for (const [folderId, n] of novos) {
    const e = daEmpresa(visivel.get(folderId)!);
    e.novos += n.novos;
    if (!e.ultimoNovo || n.ultimo > e.ultimoNovo) e.ultimoNovo = n.ultimo;
  }

  const lista: EmpresaNaLista[] = empresas.map((emp) => {
    const e = porEmpresa.get(emp.id);
    return {
      id: emp.id,
      nome: nomeExibicao(emp),
      cnpj: emp.cnpj,
      arquivos: e?.arquivos ?? 0,
      novos: e?.novos ?? 0,
      ultimoNovo: e?.ultimoNovo ?? null,
      ultimoMovimento: e?.ultimo ?? null,
    };
  });
  const pag = paginar(ordenarEmpresas(lista, !!termo), pagina);
  // O "Do Connect" só da página: contar os módulos das 400 empresas a cada
  // abertura da tela custaria seis varreduras grandes para mostrar doze linhas.
  const doConnect = await totaisDoConnect(
    ctx,
    pag.itens.map((e) => e.id)
  );
  return {
    ...pag,
    itens: pag.itens.map((e) => ({
      ...e,
      documentos: e.arquivos + (doConnect.get(e.id) ?? 0),
      pastaDeEnviados: enviadosDa.get(e.id) ?? null,
    })),
    comNovidade: lista.filter((e) => e.novos > 0).length,
  };
}
