// A pasta de rede ligada aos Arquivos (21/10/2026) — o que não depende de banco.
//
// Pedido do Kauan nos ajustes de 15/10 (item 9): os setores organizam a pasta
// de rede de cada cliente num modelo nosso, e um robô no escritório traz o que
// cai nela para os Arquivos do Connect, poucos clientes por vez.
//
// O modelo da pasta de rede é o mesmo modelo de pastas dos Arquivos:
//
//   <raiz>/<CNPJ> - <nome da empresa>/<pasta do modelo>/<subpastas…>/<arquivo>
//
// - a pasta da empresa começa pelo CNPJ (com ou sem pontuação); o resto do
//   nome é livre e serve só para quem olha a rede;
// - o primeiro nível dentro dela é uma pasta do modelo (Fiscal, Departamento
//   Pessoal…), comparada sem acento e sem caixa. É ela que diz o setor dono, e
//   por isso arquivo solto na pasta da empresa, ou em pasta fora do modelo, não
//   entra: o robô avisa no Ops Center;
// - as subpastas se repetem nos Arquivos, criadas na primeira vez.
//
// O robô fica em scripts/pasta-de-rede.mjs; o que chega vai por
// src/lib/drive/pastaDeRedeServidor.ts.

import { MAX_NOME_DO_ARQUIVO, PROFUNDIDADE_MAXIMA, validarNome, validarNomeDaPasta } from "./regras";

export const FALTA_ATUALIZAR_O_BANCO_DA_REDE =
  "Falta atualizar o banco para a pasta de rede (migration 20261021220000_pasta_de_rede). Peça para rodar `npx prisma migrate deploy`.";

/** O teto do caminho dentro da pasta da empresa — o da coluna `relativePath`. */
export const MAX_CAMINHO_DA_REDE = 500;

export type CaminhoDaRede =
  | { ok: true; pastas: string[]; arquivo: string; caminho: string }
  | { ok: false; erro: string };

/**
 * O caminho que o robô manda, relativo à pasta da empresa ("Fiscal/2026/nota.pdf",
 * com "/" ou "\"). Recusa "..", nome inválido, arquivo fora de pasta e caminho
 * fundo demais. `caminho` volta normalizado com "/": é ele que identifica o
 * arquivo na conferência do que já veio.
 */
export function lerCaminhoDaRede(bruto: string | null | undefined): CaminhoDaRede {
  const partes = (bruto ?? "").split(/[\\/]+/).map((p) => p.trim()).filter((p) => p && p !== ".");
  if (partes.length === 0) return { ok: false, erro: "Informe o caminho do arquivo." };
  if (partes.some((p) => /^\.+$/.test(p))) return { ok: false, erro: "Caminho inválido." };
  if (partes.length === 1) return { ok: false, erro: "O arquivo está solto na pasta da empresa: ponha numa pasta do modelo." };
  if (partes.length > PROFUNDIDADE_MAXIMA) return { ok: false, erro: `O caminho passa de ${PROFUNDIDADE_MAXIMA} níveis.` };

  const pastas: string[] = [];
  for (const p of partes.slice(0, -1)) {
    const v = validarNomeDaPasta(p);
    if (!v.ok) return { ok: false, erro: v.erro };
    pastas.push(v.nome);
  }
  const a = validarNome(partes.at(-1), MAX_NOME_DO_ARQUIVO, "do arquivo");
  if (!a.ok) return { ok: false, erro: a.erro };

  const caminho = [...pastas, a.nome].join("/");
  if (caminho.length > MAX_CAMINHO_DA_REDE) return { ok: false, erro: `O caminho passa de ${MAX_CAMINHO_DA_REDE} caracteres.` };
  return { ok: true, pastas, arquivo: a.nome, caminho };
}

/** Os 14 dígitos do CNPJ, ou `null`. Aceita com ou sem pontuação. */
export function lerCnpj(bruto: string | null | undefined): string | null {
  const t = (bruto ?? "").trim();
  if (!/^[\d./-]+$/.test(t)) return null;
  const d = t.replace(/\D/g, "");
  return d.length === 14 ? d : null;
}

/** "12.345.678/0001-90" a partir dos dígitos — a forma em que o cadastro costuma guardar. */
export function cnpjFormatado(digitos: string): string {
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/**
 * O CNPJ do começo do nome da pasta da empresa na rede ("12.345.678/0001-90 -
 * Padaria", "12345678000190 Padaria"), ou `null`. Na rede do Windows a barra
 * não vale em nome de pasta: aceita o CNPJ sem ela também.
 */
export function cnpjDaPastaDaEmpresa(nome: string): string | null {
  const m = /^\s*(\d{2}\.?\d{3}\.?\d{3}[/ ]?\d{4}-?\d{2})(?!\d)/.exec(nome);
  if (!m) return null;
  const d = m[1].replace(/\D/g, "");
  return d.length === 14 ? d : null;
}

/** Nome comparável: sem acento, sem caixa e com espaço simples ("Societário" = "societario"). */
export function nomeComparavel(nome: string): string {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** A pasta, entre as dadas, com o mesmo nome comparável. */
export function pastaPeloNome<T extends { name: string }>(nome: string, pastas: readonly T[]): T | null {
  const alvo = nomeComparavel(nome);
  return pastas.find((p) => nomeComparavel(p.name) === alvo) ?? null;
}

/**
 * Arquivo que o robô nem manda: temporário do Office ("~$contrato.docx"), do
 * Windows (Thumbs.db, desktop.ini), do Mac (.DS_Store, "._x") e cópia em curso
 * (.tmp, .part, .crdownload). O mesmo critério do robô — repetido no servidor
 * para um robô antigo não encher os Arquivos.
 */
export function arquivoIgnoradoNaRede(nome: string): boolean {
  const n = nome.toLowerCase();
  return (
    n.startsWith("~$") ||
    n.startsWith("._") ||
    n.startsWith(".~") ||
    ["thumbs.db", "desktop.ini", ".ds_store"].includes(n) ||
    /\.(tmp|temp|part|crdownload|partial|lnk)$/.test(n)
  );
}
