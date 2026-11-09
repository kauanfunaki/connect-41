// Arquivos — a busca em todas as empresas (09/11/2026, item 4e69ce64 do
// Controle interno): regras puras. O que toca o banco está em
// ./buscaServidor.ts; o formato do resultado, em ./tela.ts.
//
// Até aqui a busca dos Arquivos era por nome, dentro de uma empresa
// (`buscarNoDrive`). Agora a tela inicial acha um arquivo sem saber onde ele
// está: pelo nome do arquivo, pelo nome ou CNPJ da empresa e pelo tipo — a
// pasta do modelo em que ele mora (Fiscal, Societário, Guias...) ou o vínculo
// com uma guia ou uma certidão emitida pelo Connect.
//
// Quem vê o quê é a régua de sempre dos Arquivos (./regras.ts,
// `equipeAlcancaCaminho`): o caminho inteiro da pasta, setor por setor, fora
// da lixeira. Ela não cabe numa coluna — o setor de uma pasta vale para tudo
// que está dentro dela —, então a árvore do escritório é lida inteira (como já
// fazem a lista de empresas e a lixeira) e a régua vira uma lista de pastas na
// consulta dos arquivos. Assim o banco aplica o limite ao que a pessoa vê, e o
// "Mostrar mais" não pula nem repete arquivo.
//
// Este arquivo também vai para o navegador (a caixa de busca lê as
// constantes): nada de banco aqui, e o `Prisma` é só tipo.

import type { Prisma } from "@/generated/prisma/client";
import { canViewSector } from "@/lib/auth/papeis";
import {
  CHAVE_ENVIADOS,
  NOME_DE_ENVIADOS,
  PREFIXO_DO_MODELO,
  caminhoDaPasta,
  chaveDoModelo,
  equipeAlcancaCaminho,
  mapaDePastas,
  type PastaDoDrive,
  type QuemPede,
} from "./regras";
import type { VinculoDoArquivo } from "./tela";

/** Quantos arquivos cada "Mostrar mais" acrescenta. */
export const ARQUIVOS_POR_VEZ = 50;
/** Até onde o "Mostrar mais" vai. Daí em diante a tela pede uma busca mais fina. */
export const MAXIMO_DE_ARQUIVOS = 200;
/** Termo e palavra mais curtos que a busca considera: uma letra acha meio escritório. */
export const MINIMO_DO_TERMO = 2;
/** Palavras demais só deixam a consulta pesada. */
export const MAXIMO_DE_PALAVRAS = 5;
/**
 * Quantos números uma palavra precisa ter para ser procurada também no CNPJ
 * (e no CPF): os da raiz do CNPJ. Com menos, "2026" ou "092026" — ano e
 * competência no nome do arquivo — trariam todas as empresas que têm esses
 * números no meio do CNPJ.
 */
export const DIGITOS_DO_DOCUMENTO = 8;
/** A espera depois da última tecla antes de buscar. */
export const ESPERA_DA_DIGITACAO_MS = 400;

/** O tipo escolhido no filtro: a pasta da casa (pela chave dela) ou o vínculo. */
export type TipoDaBusca = { pasta: string } | { vinculo: VinculoDoArquivo };

export const ROTULO_DO_VINCULO: Record<VinculoDoArquivo, string> = {
  guia: "Guia emitida no Connect",
  certidao: "Certidão emitida no Connect",
};

export type FiltroDaBusca = {
  /** O termo como a pessoa digitou, aparado — é o que a tela repete. */
  termo: string;
  /** As palavras que valem; cada uma tem de aparecer no arquivo ou na empresa dele. */
  palavras: string[];
  tipo: TipoDaBusca | null;
  /** Quantas levas de 50 estão à vista: o "Mostrar mais" soma uma. */
  pagina: number;
  /** Quantos arquivos trazer: `pagina` × 50, até 200. */
  limite: number;
};

// ─── Termo ───────────────────────────────────────────────────────────────────

/**
 * As palavras do termo: separadas por espaço, sem as de uma letra só, sem
 * repetir (maiúscula e minúscula são a mesma) e no máximo cinco.
 */
export function palavrasDaBusca(termo: string): string[] {
  const vistas = new Set<string>();
  const palavras: string[] = [];
  for (const p of termo.trim().split(/\s+/)) {
    const chave = p.toLocaleLowerCase("pt-BR");
    if ([...p].length < MINIMO_DO_TERMO || vistas.has(chave)) continue;
    vistas.add(chave);
    palavras.push(p.slice(0, 80));
    if (palavras.length === MAXIMO_DE_PALAVRAS) break;
  }
  return palavras;
}

/**
 * Os dígitos da palavra, quando ela pode ser um CNPJ ou CPF (8 números ou
 * mais). A máscara não importa: "12.345.678/0001-90" e "12345678000190" dão o
 * mesmo — é assim que o CNPJ fica gravado na empresa.
 */
export function documentoDaPalavra(palavra: string): string | null {
  const digitos = palavra.replace(/\D/g, "");
  return digitos.length >= DIGITOS_DO_DOCUMENTO ? digitos : null;
}

/** O valor do filtro "Tipo" na URL: "modelo:<id>", "enviados", "guia" ou "certidao". */
export function lerTipo(bruto: string | null | undefined): TipoDaBusca | null {
  const t = (bruto ?? "").trim();
  if (t === "guia" || t === "certidao") return { vinculo: t };
  if (t === CHAVE_ENVIADOS) return { pasta: t };
  if (t.startsWith(PREFIXO_DO_MODELO) && /^[\w-]{1,60}$/.test(t.slice(PREFIXO_DO_MODELO.length))) return { pasta: t };
  return null;
}

/** O que a URL pede: `q` (o termo), `tipo` e `pagina` (quantas levas de 50). */
export function lerFiltroDaBusca(params: { q?: string; tipo?: string; pagina?: string }): FiltroDaBusca {
  const termo = (params.q ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const ultima = MAXIMO_DE_ARQUIVOS / ARQUIVOS_POR_VEZ;
  const pagina = Math.min(Math.max(1, Math.floor(Number(params.pagina)) || 1), ultima);
  return { termo, palavras: palavrasDaBusca(termo), tipo: lerTipo(params.tipo), pagina, limite: pagina * ARQUIVOS_POR_VEZ };
}

/** Há o que buscar: uma palavra que vale ou um tipo escolhido. Sem isso, a tela mostra o início dos Arquivos. */
export function buscaAtiva(filtro: Pick<FiltroDaBusca, "palavras" | "tipo">): boolean {
  return filtro.palavras.length > 0 || filtro.tipo !== null;
}

/**
 * O endereço da tela com o termo novo: troca o `q`, mantém o tipo (e o resto
 * da query) e volta para os primeiros 50 — o "Mostrar mais" de uma busca não
 * vale para a seguinte.
 */
export function urlDaBusca(caminho: string, query: string, termo: string): string {
  const q = new URLSearchParams(query);
  const t = termo.trim();
  if (t) q.set("q", t);
  else q.delete("q");
  q.delete("pagina");
  const s = q.toString();
  return s ? `${caminho}?${s}` : caminho;
}

// ─── Escopo ──────────────────────────────────────────────────────────────────

/**
 * As pastas da árvore que entram na busca, com o caminho de cada uma (é o
 * rótulo "Fiscal › 2026" do resultado), e as que ficam de fora.
 *
 * Entra a pasta que a equipe alcança — `equipeAlcancaCaminho`, a mesma conta
 * que abre a pasta e baixa o arquivo: caminho inteiro (sem pai faltando nem
 * ciclo), nada dele na lixeira e todo setor dono ao alcance de quem pede. Com
 * `raiz` (a chave de uma pasta da casa), só o que está nela ou dentro dela.
 * As pastas internas do escritório entram como as das empresas; com um tipo
 * escolhido ficam de fora, porque não têm pasta do modelo.
 */
export function pastasDaBusca(
  quem: QuemPede,
  pastas: readonly PastaDoDrive[],
  raiz: string | null
): { dentro: Map<string, PastaDoDrive[]>; fora: string[] } {
  const mapa = mapaDePastas(pastas);
  const dentro = new Map<string, PastaDoDrive[]>();
  const fora: string[] = [];
  for (const p of pastas) {
    const caminho = caminhoDaPasta(p.id, mapa);
    const entra = !!caminho && equipeAlcancaCaminho(quem, caminho) && (raiz === null || caminho.some((x) => x.systemKey === raiz));
    if (entra) dentro.set(p.id, caminho);
    else fora.push(p.id);
  }
  return { dentro, fora };
}

/**
 * A régua das pastas na consulta: a lista mais curta entre as que entram
 * (`in`) e as que ficam de fora (`notIn`). Quem vê tudo tem de fora só a
 * lixeira, e quem não é do DP, as pastas do DP — nos dois casos a lista curta
 * é a de fora. Com um tipo escolhido, a curta passa a ser a de dentro.
 * `null`: nenhuma pasta entra (a busca nem vai ao banco); `undefined`: todas.
 */
export function filtroDasPastas(dentro: Iterable<string>, fora: readonly string[]): { in: string[] } | { notIn: string[] } | null | undefined {
  const sim = [...dentro];
  if (sim.length === 0) return null;
  if (fora.length === 0) return undefined;
  return sim.length <= fora.length ? { in: sim.sort() } : { notIn: [...fora].sort() };
}

export type PalavraDaBusca = {
  palavra: string;
  /** As empresas cujo nome, apelido, nome fantasia, CNPJ ou CPF batem com a palavra. */
  empresas: readonly string[];
};

/**
 * Onde procurar as empresas de uma palavra: nome, apelido e nome fantasia
 * pelo texto; CNPJ e CPF pelos dígitos, quando a palavra tem 8 ou mais.
 */
export function empresasDaPalavra(tenantId: string, palavra: string): Prisma.CompanyWhereInput {
  const documento = documentoDaPalavra(palavra);
  return {
    tenantId,
    OR: [
      { name: { contains: palavra } },
      { displayName: { contains: palavra } },
      { tradeName: { contains: palavra } },
      ...(documento ? [{ cnpj: { contains: documento } }, { cpf: { contains: documento } }] : []),
    ],
  };
}

/**
 * A cláusula da busca na tabela dos arquivos (`drive_files`), com o caminho
 * das pastas que entraram. Toda condição leva o `tenantId` — a do arquivo, a
 * da pasta da empresa e a do vínculo —, e o teste confere. `null` quando
 * nenhuma pasta ao alcance cabe no filtro.
 *
 * - escopo: fora da lixeira e só nas pastas de `pastasDaBusca`;
 * - cada palavra tem de estar no nome do arquivo **ou** na empresa dona dele
 *   ("contrato padaria" acha o contrato da empresa com "padaria" no nome);
 * - o tipo: a pasta do modelo entra pelo escopo; o vínculo, pela guia ou
 *   certidão que aponta para o arquivo.
 */
export function clausulaDaBusca(input: {
  tenantId: string;
  quem: QuemPede;
  pastas: readonly PastaDoDrive[];
  tipo: TipoDaBusca | null;
  palavras: readonly PalavraDaBusca[];
}): { where: Prisma.DriveFileWhereInput; caminhos: Map<string, PastaDoDrive[]> } | null {
  const { tenantId, tipo } = input;
  const raiz = tipo && "pasta" in tipo ? tipo.pasta : null;
  const vinculo = tipo && "vinculo" in tipo ? tipo.vinculo : null;
  const { dentro, fora } = pastasDaBusca(input.quem, input.pastas, raiz);
  const pastas = filtroDasPastas(dentro.keys(), fora);
  if (pastas === null) return null;

  const where: Prisma.DriveFileWhereInput = {
    tenantId,
    deletedAt: null,
    ...(pastas ? { folderId: pastas } : {}),
    ...(vinculo === "guia" ? { guias: { some: { tenantId } } } : {}),
    ...(vinculo === "certidao" ? { certidoes: { some: { tenantId } } } : {}),
    ...(input.palavras.length > 0
      ? {
          AND: input.palavras.map((p) => ({
            OR: [
              { name: { contains: p.palavra } },
              ...(p.empresas.length > 0 ? [{ folder: { tenantId, companyId: { in: [...p.empresas] } } }] : []),
            ],
          })),
        }
      : {}),
  };
  return { where, caminhos: dentro };
}

// ─── Filtro da tela ──────────────────────────────────────────────────────────

export type OpcaoDoTipo = { value: string; label: string };

/**
 * As opções do filtro "Tipo", na ordem do modelo: as pastas do modelo que
 * quem pede vê (a do DP some para quem não é do DP, que nunca acharia nada
 * nela), "Enviados pelo cliente" e os dois vínculos.
 */
export function opcoesDoTipo(quem: QuemPede, modelo: readonly { id: string; name: string; sectorCode: string | null }[]): OpcaoDoTipo[] {
  return [
    ...modelo.filter((m) => !m.sectorCode || canViewSector(quem, m.sectorCode)).map((m) => ({ value: chaveDoModelo(m.id), label: m.name })),
    { value: CHAVE_ENVIADOS, label: NOME_DE_ENVIADOS },
    { value: "guia", label: ROTULO_DO_VINCULO.guia },
    { value: "certidao", label: ROTULO_DO_VINCULO.certidao },
  ];
}
