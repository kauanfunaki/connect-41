// Arquivos (Drive) — baixar a pasta inteira num zip, pela equipe e pelo
// cliente (13/10/2026). Aqui ficam o banco e a resposta HTTP; nomes, teto e o
// zip em si estão em ./zip.ts.
//
// A régua é a do download de um arquivo avulso, nas mesmas funções:
// - **Equipe:** a pasta passa por `pastaParaAEquipe` (a porta de
//   `arquivoParaAEquipe`) e cada subpasta por `equipeAlcancaCaminho`, a conta
//   que `pastaParaAEquipe` faz. Pasta de setor fora do alcance e lixeira ficam
//   de fora, com tudo que está dentro.
// - **Cliente:** só pasta de empresa do grupo dele e compartilhada (ela ou
//   alguma acima), pela `clienteVeCaminho` de `arquivoParaOCliente`. O nome do
//   zip usa só o pedaço do caminho que o cliente vê.
//
// O "Do Connect" não entra: não é pasta, e cada anexo dele tem a régua da rota
// de download do próprio módulo (setor, responsável, campo sensível).

import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { caminhoDaPasta, caminhoDoCliente, clienteVeCaminho, equipeAlcancaCaminho, mapaDePastas, type PastaDoDrive } from "./regras";
import { SELECT_PASTA, armazenamentoDoDrive, empresaDoDrive, pastaParaAEquipe, pastasDoEscopo } from "./servidor";
import {
  contentDispositionDeAnexo,
  montarConteudoDoZip,
  nomeDoZip,
  pastasDoZip,
  problemaDoZip,
  streamDoZip,
  type Alcance,
  type ConteudoDoZip,
  type OpcoesDoStream,
  type ProblemaDoZip,
} from "./zip";

const SELECT_ARQUIVO_DO_ZIP = {
  id: true,
  name: true,
  sizeBytes: true,
  mimeType: true,
  storageKey: true,
  folderId: true,
  createdAt: true,
  deletedAt: true,
} as const;

export type ZipDaPasta = {
  /** "Empresa - Fiscal - 2026.zip". */
  nome: string;
  conteudo: ConteudoDoZip;
  /** Vazia ou acima do teto: a resposta é a mensagem, não o zip. */
  problema: ProblemaDoZip | null;
};

async function montar(
  tenantId: string,
  raiz: PastaDoDrive,
  pastas: PastaDoDrive[],
  alcanca: Alcance,
  partesDoNome: (string | null | undefined)[]
): Promise<ZipDaPasta | null> {
  const alcancadas = pastasDoZip(raiz.id, pastas, alcanca);
  if (!alcancadas) return null;
  const arquivos = await getPrisma().driveFile.findMany({
    where: { tenantId, deletedAt: null, folderId: { in: alcancadas.map((a) => a.pasta.id) } },
    select: SELECT_ARQUIVO_DO_ZIP,
  });
  const conteudo = montarConteudoDoZip({ raizId: raiz.id, pastas, arquivos, alcanca });
  if (!conteudo) return null;
  return { nome: nomeDoZip(partesDoNome), conteudo, problema: problemaDoZip(conteudo) };
}

/**
 * O zip de uma pasta para a equipe. `null` nos mesmos casos em que a tela da
 * pasta responde 404: não existe, é de outro escritório, está na lixeira ou é
 * de setor fora do alcance.
 */
export async function zipDaPastaParaAEquipe(ctx: AuthContext, pastaId: string): Promise<ZipDaPasta | null> {
  const alvo = await pastaParaAEquipe(ctx, pastaId);
  if (!alvo) return null;
  const empresa = alvo.pasta.companyId ? await empresaDoDrive(ctx.tenantId, alvo.pasta.companyId) : null;
  const alcanca: Alcance = (caminho) => equipeAlcancaCaminho(ctx, caminho);
  return montar(ctx.tenantId, alvo.pasta, alvo.pastas, alcanca, [empresa?.nome, ...alvo.caminho.map((p) => p.name)]);
}

/**
 * O zip de uma pasta para o cliente: empresa no alcance dele, pasta
 * compartilhada (ela ou alguma acima) e fora da lixeira. Fora disso, `null` —
 * a rota responde 404, igual a um id que não existe.
 */
export async function zipDaPastaParaOCliente(tenantId: string, companyIds: string[], pastaId: string): Promise<ZipDaPasta | null> {
  const pasta = await getPrisma().driveFolder.findFirst({
    where: { id: pastaId, tenantId, companyId: { in: companyIds } },
    select: SELECT_PASTA,
  });
  if (!pasta?.companyId) return null;
  const [pastas, empresa] = await Promise.all([pastasDoEscopo(tenantId, pasta.companyId), empresaDoDrive(tenantId, pasta.companyId)]);
  const caminho = caminhoDaPasta(pasta.id, mapaDePastas(pastas));
  if (!caminho || !clienteVeCaminho(caminho)) return null;
  return montar(tenantId, pasta, pastas, clienteVeCaminho, [empresa?.nome, ...caminhoDoCliente(caminho).map((p) => p.name)]);
}

/**
 * A resposta da rota do zip, igual na equipe e no portal. `?conferir=1` só
 * diz se dá (o botão pergunta antes, para mostrar a mensagem do teto num aviso
 * em vez de um download que falha); sem ele, o zip vai aos pedaços.
 */
export function respostaDoZip(zip: ZipDaPasta, opcoes: { conferir: boolean; aoTerminar?: OpcoesDoStream["aoTerminar"] }): Response {
  if (zip.problema) return NextResponse.json({ error: zip.problema.erro }, { status: zip.problema.status });
  if (opcoes.conferir) {
    return NextResponse.json({ nome: zip.nome, arquivos: zip.conteudo.arquivos, bytes: zip.conteudo.bytes });
  }
  const corpo = streamDoZip(zip.conteudo.entradas, {
    ler: (arquivo) => armazenamentoDoDrive.lerAnexo(arquivo.storageKey),
    aoTerminar: opcoes.aoTerminar,
  });
  return new Response(corpo, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDispositionDeAnexo(zip.nome),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
