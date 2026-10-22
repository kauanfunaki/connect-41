// A pasta de rede ligada aos Arquivos (21/10/2026) — o que toca o banco e o
// disco. As regras de caminho e de nome estão em ./pastaDeRede.ts.
//
// O robô do escritório (scripts/pasta-de-rede.mjs) manda arquivo a arquivo para
// POST /api/ops/watchers/<slug>/arquivos, com a chave do Ops Center: a
// automação é cadastrada lá, e o que entra (ou é recusado) aparece no painel
// dela, como os outros robôs.

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { nomeExibicao } from "@/lib/companyName";
import { ErroOps, receberEvento, type CredencialAutenticadaOps } from "@/lib/ops/servidor";
import { TAMANHO_MAXIMO_NO_DRIVE } from "./tipoDoArquivo";
import { MODULO_ARQUIVOS, PREFIXO_DO_MODELO } from "./regras";
import { garantirPastasDaEmpresa, guardarArquivo, pastasDoEscopo } from "./servidor";
import { arquivoIgnoradoNaRede, cnpjFormatado, lerCaminhoDaRede, lerCnpj, pastaPeloNome } from "./pastaDeRede";

const sha256 = (dados: string | Uint8Array) => createHash("sha256").update(dados).digest("hex");

/** Um envio parado há mais que isto (o robô caiu no meio) pode ser refeito. */
const ENVIO_ABANDONADO_MS = 10 * 60_000;

/** O arquivo de 10 MB e o resto do formulário (CNPJ, caminho, hash). */
const CORPO_MAXIMO = TAMANHO_MAXIMO_NO_DRIVE + 64 * 1024;

export type RespostaDaRede = { ok: true; arquivoId: string | null; duplicado: boolean };

type Envio = { cnpj: string; caminho: string; sha256: string; arquivo: File };

/** Lê o formulário do robô. O tamanho é conferido antes de ler o corpo. */
export async function lerEnvioDaRede(request: Request): Promise<Envio> {
  const tamanho = Number(request.headers.get("content-length"));
  if (!tamanho) throw new ErroOps("Informe o tamanho do envio (Content-Length).", 411);
  if (tamanho > CORPO_MAXIMO) throw new ErroOps("Arquivo acima do limite de 10 MB.", 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ErroOps("Envie o arquivo como multipart/form-data.");
  }
  const arquivo = form.get("arquivo");
  const texto = (campo: string) => {
    const v = form.get(campo);
    return typeof v === "string" ? v : "";
  };
  if (!(arquivo instanceof File)) throw new ErroOps("Envie o arquivo no campo “arquivo”.");
  return { cnpj: texto("cnpj"), caminho: texto("caminho"), sha256: texto("sha256").toLowerCase(), arquivo };
}

/**
 * Guarda nos Arquivos da empresa um arquivo que o robô achou na pasta de rede.
 *
 * - a empresa é a do CNPJ, no escritório da chave, e precisa estar no piloto
 *   (`pastaDeRedeNoDrive`);
 * - o primeiro nível do caminho é uma pasta do modelo da empresa; as
 *   subpastas são criadas na primeira vez;
 * - o mesmo caminho com o mesmo conteúdo volta como `duplicado`, sem criar
 *   outro arquivo — o robô pode reenviar à vontade;
 * - recusa (4xx) e entrada viram evento no Ops Center da automação.
 */
export async function receberDaPastaDeRede(w: CredencialAutenticadaOps, envio: Envio): Promise<RespostaDaRede> {
  if (!w.slug) throw new ErroOps("Informe a automação.", 400);
  const slug = w.slug;
  if (!(await isModuleEnabled(w.tenantId, MODULO_ARQUIVOS))) throw new ErroOps("Os Arquivos estão desligados neste escritório.", 403);

  const cnpj = lerCnpj(envio.cnpj);
  if (!cnpj) throw new ErroOps("CNPJ inválido.");
  if (!/^[a-f0-9]{64}$/.test(envio.sha256)) throw new ErroOps("Informe o SHA-256 do arquivo.");

  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({
    where: { tenantId: w.tenantId, cnpj: { in: [cnpj, cnpjFormatado(cnpj)] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, displayName: true, pastaDeRedeNoDrive: true },
  });
  if (!empresa) throw new ErroOps(`Nenhuma empresa com o CNPJ ${cnpjFormatado(cnpj)} neste escritório.`, 404);
  const nomeDaEmpresa = nomeExibicao(empresa);

  // Daqui em diante a empresa é conhecida: a recusa fica no Ops Center com o
  // nome dela, para a equipe saber o que arrumar na rede.
  const avisar = (status: "SUCCESS" | "WARNING", caminho: string, erro: string | null) =>
    receberEvento(w, {
      watcherSlug: slug,
      eventId: `rede-${status === "SUCCESS" ? "ok" : "rec"}-${sha256(`${empresa.id}/${caminho}`).slice(0, 40)}-${envio.sha256.slice(0, 40)}`,
      filename: caminho.slice(0, 1000),
      status,
      errorMessage: erro,
      client: nomeDaEmpresa.slice(0, 120),
    }).catch((err) => console.warn("[pasta-de-rede] evento não registrado", err instanceof Error ? err.message : err));
  async function recusar(caminho: string, erro: string, status = 422): Promise<never> {
    await avisar("WARNING", caminho, erro);
    throw new ErroOps(erro, status);
  }

  const brutoDoCaminho = envio.caminho.trim() || envio.arquivo.name;
  if (!empresa.pastaDeRedeNoDrive) {
    return recusar(brutoDoCaminho, `${nomeDaEmpresa} não está no piloto da pasta de rede. Ligue em Administração › Arquivos.`, 403);
  }
  const lido = lerCaminhoDaRede(brutoDoCaminho);
  if (!lido.ok) return recusar(brutoDoCaminho, lido.erro);
  if (arquivoIgnoradoNaRede(lido.arquivo)) return recusar(lido.caminho, "Arquivo temporário ou do sistema: não entra nos Arquivos.");

  const bytes = new Uint8Array(await envio.arquivo.arrayBuffer());
  if (sha256(bytes) !== envio.sha256) throw new ErroOps("O arquivo chegou diferente do que saiu. Envie de novo.", 400);

  const chave = { tenantId: w.tenantId, companyId: empresa.id, pathHash: sha256(lido.caminho), sha256: envio.sha256 };
  const ja = await prisma.driveNetworkFile.findUnique({ where: { tenantId_companyId_pathHash_sha256: chave }, select: { driveFileId: true } });
  if (ja?.driveFileId) return { ok: true, arquivoId: ja.driveFileId, duplicado: true };

  // A pasta do modelo, pelo nome do primeiro nível.
  await garantirPastasDaEmpresa(w.tenantId, empresa.id);
  const pastas = await pastasDoEscopo(w.tenantId, empresa.id);
  const doModelo = pastas.filter((p) => p.parentId === null && p.deletedAt === null && p.systemKey?.startsWith(PREFIXO_DO_MODELO));
  const raiz = pastaPeloNome(lido.pastas[0], doModelo);
  if (!raiz) {
    const nomes = doModelo.map((p) => p.name).sort((a, b) => a.localeCompare(b, "pt-BR")).join(", ");
    return recusar(lido.caminho, `A pasta “${lido.pastas[0]}” não é do modelo. Use uma destas: ${nomes}.`);
  }

  // Reserva o envio antes de gravar: dois robôs (ou duas voltas) com o mesmo
  // arquivo não criam dois. A reserva abandonada por um robô que caiu no meio
  // é refeita depois de 10 minutos.
  const reservado = await reservar(chave, lido.caminho, slug);
  if (reservado === "pronto") {
    const r = await prisma.driveNetworkFile.findUnique({ where: { tenantId_companyId_pathHash_sha256: chave }, select: { driveFileId: true } });
    return { ok: true, arquivoId: r?.driveFileId ?? null, duplicado: true };
  }
  if (reservado === "em-curso") throw new ErroOps("Este arquivo já está sendo recebido. Tente de novo em instantes.", 409);

  try {
    const pastaId = await subpastas(w.tenantId, empresa.id, raiz.id, lido.pastas.slice(1), pastas);
    const r = await guardarArquivo({ tenantId: w.tenantId, folderId: pastaId, arquivo: new File([bytes], lido.arquivo) });
    if (!r.ok) {
      await prisma.driveNetworkFile.delete({ where: { id: reservado.id } }).catch(() => {});
      return recusar(lido.caminho, r.erro);
    }
    await prisma.driveNetworkFile.update({ where: { id: reservado.id }, data: { driveFileId: r.arquivoId } });
    await avisar("SUCCESS", lido.caminho, null);
    return { ok: true, arquivoId: r.arquivoId, duplicado: false };
  } catch (err) {
    if (!(err instanceof ErroOps)) await prisma.driveNetworkFile.delete({ where: { id: reservado.id } }).catch(() => {});
    throw err;
  }
}

type Chave = { tenantId: string; companyId: string; pathHash: string; sha256: string };

async function reservar(chave: Chave, caminho: string, slug: string): Promise<{ id: string } | "pronto" | "em-curso"> {
  const prisma = getPrisma();
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      return await prisma.driveNetworkFile.create({ data: { ...chave, relativePath: caminho, watcherSlug: slug }, select: { id: true } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
      const atual = await prisma.driveNetworkFile.findUnique({ where: { tenantId_companyId_pathHash_sha256: chave } });
      if (!atual) continue;
      if (atual.driveFileId) return "pronto";
      if (Date.now() - atual.createdAt.getTime() < ENVIO_ABANDONADO_MS) return "em-curso";
      await prisma.driveNetworkFile.deleteMany({ where: { id: atual.id, driveFileId: null } });
    }
  }
  return "em-curso";
}

/**
 * A pasta final do caminho, a partir da pasta do modelo: acha cada subpasta
 * pelo nome comparável (fora da lixeira) e cria a que falta. A pasta criada
 * não leva setor nem compartilhamento próprios — herda os da pasta do modelo.
 */
async function subpastas(
  tenantId: string,
  companyId: string,
  raizId: string,
  nomes: string[],
  pastas: { id: string; name: string; parentId: string | null; deletedAt: Date | null }[]
): Promise<string> {
  const prisma = getPrisma();
  let paiId = raizId;
  for (const nome of nomes) {
    const filhas = pastas.filter((p) => p.parentId === paiId && p.deletedAt === null);
    const achada = pastaPeloNome(nome, filhas);
    if (achada) {
      paiId = achada.id;
      continue;
    }
    const criada = await prisma.driveFolder.create({ data: { tenantId, companyId, parentId: paiId, name: nome }, select: { id: true } });
    pastas.push({ id: criada.id, name: nome, parentId: paiId, deletedAt: null });
    paiId = criada.id;
  }
  return paiId;
}

// ─── Administração ───────────────────────────────────────────────────────────

export type EmpresaDaRede = {
  id: string;
  nome: string;
  cnpj: string | null;
  ligada: boolean;
  /** Quantos arquivos o robô já trouxe, e quando foi o último. */
  recebidos: number;
  ultimoEm: string | null;
};

/**
 * As empresas para a tela do piloto: as ligadas primeiro, com o que já veio;
 * depois as ativas com CNPJ, para ligar. `null` quando falta atualizar o banco.
 */
export async function empresasDaPastaDeRede(tenantId: string): Promise<EmpresaDaRede[] | null> {
  const prisma = getPrisma();
  try {
    const [empresas, recebidos] = await Promise.all([
      prisma.company.findMany({
        where: { tenantId, cnpj: { not: null }, OR: [{ pastaDeRedeNoDrive: true }, { status: "ACTIVE" }] },
        select: { id: true, name: true, displayName: true, cnpj: true, pastaDeRedeNoDrive: true },
      }),
      prisma.driveNetworkFile.groupBy({
        by: ["companyId"],
        where: { tenantId, driveFileId: { not: null } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
    ]);
    const porEmpresa = new Map(recebidos.map((r) => [r.companyId, r]));
    return empresas
      .map((e) => ({
        id: e.id,
        nome: nomeExibicao(e),
        cnpj: e.cnpj,
        ligada: e.pastaDeRedeNoDrive,
        recebidos: porEmpresa.get(e.id)?._count._all ?? 0,
        ultimoEm: porEmpresa.get(e.id)?._max.createdAt?.toISOString() ?? null,
      }))
      .sort((a, b) => Number(b.ligada) - Number(a.ligada) || a.nome.localeCompare(b.nome, "pt-BR"));
  } catch (err) {
    const codigo = (err as { code?: unknown })?.code;
    if (codigo === "P2021" || codigo === "P2022") return null;
    throw err;
  }
}
