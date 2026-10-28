// As licenças do Radar Societário para o Connect (28/10/2026) — a leitura da
// API do Radar e a gravação. As regras estão em ./importar-radar.ts.
//
// Roda no servidor do Connect, pela tela /licencas/radar, e não num script:
// os anexos vão para o disco do Connect (storage/drive), que só existe dentro
// do container. O Radar não tem login; a URL dele vem da tela ou de
// RADAR_SOCIETARIO_URL.

import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isModuleEnabled } from "@/lib/modules";
import { hojeIso } from "@/lib/datas/calendario";
import { guardarArquivo } from "@/lib/drive/servidor";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { pastaDoModeloDaEmpresa } from "@/lib/serpro/situacaoFiscal";
import {
  jaImportadasDoRadar,
  nomeDoAnexo,
  planejarDoRadar,
  type AnexoDoRadar,
  type DoRadar,
  type EmpresaDoRadar,
  type LicencaDoRadar,
  type PlanoDoRadar,
} from "./importar-radar";

/** Quantas empresas do Radar são lidas ao mesmo tempo. */
const EM_PARALELO = 5;
/** Licenças gravadas por transação. */
const LOTE = 50;

export type LeitorDoRadar = (caminho: string) => Promise<Response>;

/** A URL do Radar, sem a barra final; recusa o que não é http(s). */
export function urlDoRadar(bruta: string | null | undefined): string | null {
  const u = (bruta ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+/i.test(u) ? u : null;
}

function leitorDe(url: string): LeitorDoRadar {
  return (caminho) => fetch(`${url}/api${caminho}`, { signal: AbortSignal.timeout(60_000), cache: "no-store" });
}

async function json<T>(ler: LeitorDoRadar, caminho: string): Promise<T> {
  const r = await ler(caminho);
  if (!r.ok) throw new Error(`O Radar respondeu ${r.status} em ${caminho}.`);
  return (await r.json()) as T;
}

/** Todas as empresas ativas do Radar, com licenças e anexos. */
export async function lerRadar(ler: LeitorDoRadar): Promise<DoRadar[]> {
  const empresas: EmpresaDoRadar[] = [];
  for (let pagina = 1; pagina < 1000; pagina++) {
    const r = await json<{ data: EmpresaDoRadar[]; total: number }>(ler, `/companies?status=active&limit=100&page=${pagina}`);
    empresas.push(...r.data);
    if (r.data.length === 0 || empresas.length >= r.total) break;
  }
  const lidas: DoRadar[] = [];
  for (let i = 0; i < empresas.length; i += EM_PARALELO) {
    lidas.push(
      ...(await Promise.all(
        empresas.slice(i, i + EM_PARALELO).map(async (empresa) => ({
          empresa,
          licencas: await json<LicencaDoRadar[]>(ler, `/companies/${encodeURIComponent(empresa.id)}/licenses`),
          anexos: await json<AnexoDoRadar[]>(ler, `/companies/${encodeURIComponent(empresa.id)}/attachments`),
        }))
      ))
    );
  }
  return lidas;
}

async function planejar(tenantId: string, radar: DoRadar[], hoje: string): Promise<PlanoDoRadar> {
  const prisma = getPrisma();
  const [empresas, orgaos, comMarca] = await Promise.all([
    prisma.company.findMany({ where: { tenantId }, select: { id: true, cnpj: true } }),
    prisma.processOrgan.findMany({ where: { tenantId, active: true }, select: { id: true, name: true } }),
    prisma.license.findMany({ where: { tenantId, notes: { contains: "[Radar #" } }, select: { notes: true } }),
  ]);
  return planejarDoRadar(radar, { empresas, orgaos, jaImportadas: jaImportadasDoRadar(comMarca.map((l) => l.notes)), hoje });
}

export type PreviaDoRadar = { ok: true; plano: PlanoDoRadar; empresasNoRadar: number } | { ok: false; erro: string };

export async function previaDoRadar(tenantId: string, url: string, opcoes: { ler?: LeitorDoRadar } = {}): Promise<PreviaDoRadar> {
  try {
    const radar = await lerRadar(opcoes.ler ?? leitorDe(url));
    return { ok: true, plano: await planejar(tenantId, radar, hojeIso()), empresasNoRadar: radar.length };
  } catch (err) {
    return { ok: false, erro: `Não consegui ler o Radar: ${err instanceof Error ? err.message : "falha de rede"}` };
  }
}

export type ResultadoDaImportacao =
  | { ok: true; licencas: number; anexos: number; anexosQueFalharam: number; semPastaOuArquivos: number }
  | { ok: false; erro: string };

/**
 * Lê o Radar de novo (a prévia pode estar velha), grava as licenças em lotes
 * — conferindo as marcas dentro da transação, para duas rodadas não duplicarem —
 * e depois traz os anexos para Arquivos › Societário. Anexo que falha não
 * desfaz a licença: o resultado conta quantos ficaram para trás.
 */
export async function importarDoRadar(tenantId: string, userId: string, url: string, opcoes: { ler?: LeitorDoRadar } = {}): Promise<ResultadoDaImportacao> {
  const ler = opcoes.ler ?? leitorDe(url);
  let radar: DoRadar[];
  try {
    radar = await lerRadar(ler);
  } catch (err) {
    return { ok: false, erro: `Não consegui ler o Radar: ${err instanceof Error ? err.message : "falha de rede"}` };
  }
  const prisma = getPrisma();
  const plano = await planejar(tenantId, radar, hojeIso());

  const gravadas: { id: string; plano: PlanoDoRadar["licencas"][number] }[] = [];
  for (let i = 0; i < plano.licencas.length; i += LOTE) {
    const lote = plano.licencas.slice(i, i + LOTE);
    const criadas = await prisma.$transaction(
      async (tx) => {
        const ja = jaImportadasDoRadar(
          (await tx.license.findMany({ where: { tenantId, notes: { contains: "[Radar #" } }, select: { notes: true } })).map((l) => l.notes)
        );
        const novas = lote.filter((l) => !ja.has(l.radarId));
        const ids: { id: string; plano: (typeof lote)[number] }[] = [];
        for (const l of novas) {
          const c = await tx.license.create({
            data: { tenantId, companyId: l.companyId, kind: l.kind, organId: l.organId, expiresAt: l.expiresAt, notes: l.notes },
            select: { id: true },
          });
          ids.push({ id: c.id, plano: l });
        }
        return ids;
      },
      { timeout: 60_000 }
    );
    gravadas.push(...criadas);
  }

  let anexos = 0;
  let anexosQueFalharam = 0;
  let semPastaOuArquivos = 0;
  const comArquivos = await isModuleEnabled(tenantId, MODULO_ARQUIVOS);
  const pastas = new Map<string, string | null>();
  for (const { plano: l } of gravadas) {
    for (const a of l.anexos) {
      if (!comArquivos) {
        semPastaOuArquivos++;
        continue;
      }
      if (!pastas.has(l.companyId)) pastas.set(l.companyId, await pastaDoModeloDaEmpresa(tenantId, l.companyId, "societario"));
      const pasta = pastas.get(l.companyId);
      if (!pasta) {
        semPastaOuArquivos++;
        continue;
      }
      try {
        const r = await ler(`/attachments/${a.id}/download`);
        if (!r.ok) throw new Error(String(r.status));
        const bytes = new Uint8Array(await r.arrayBuffer());
        const guardado = await guardarArquivo({
          tenantId,
          folderId: pasta,
          arquivo: new File([Buffer.from(bytes)], nomeDoAnexo(l.kind, a.original_name), { type: a.mime_type || "application/octet-stream" }),
          uploadedByUserId: userId,
        });
        if (guardado.ok) anexos++;
        else anexosQueFalharam++;
      } catch {
        anexosQueFalharam++;
      }
    }
  }

  await logAudit({
    tenantId,
    userId,
    action: "license.import_radar",
    entityType: "License",
    metadata: { licencas: gravadas.length, anexos, anexosQueFalharam, semPastaOuArquivos, semEmpresa: plano.semEmpresa.length, naoSeAplica: plano.naoSeAplica },
  });
  return { ok: true, licencas: gravadas.length, anexos, anexosQueFalharam, semPastaOuArquivos };
}
