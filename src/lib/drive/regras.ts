// Arquivos (Drive) — o que não depende de banco: quem vê e quem mexe em cada
// pasta, o que o cliente enxerga no portal, nome de pasta, ciclo ao mover e o
// modelo de pastas que toda empresa ganha.
//
// Decisões do Kauan em 09/10/2026: funciona como o diretório do Acessórias —
// a pessoa escolhe a pasta, o arquivo fica no Connect (volume do EasyPanel), e
// uma pasta pode ser compartilhada com o cliente pelo portal. O cliente vê,
// baixa e envia (para "Enviados pelo cliente"). Pasta de setor só o setor vê.
//
// Tudo aqui trabalha sobre o CAMINHO da pasta (da raiz até ela), porque as duas
// propriedades que importam herdam para baixo: o setor dono de uma pasta vale
// para tudo que está dentro dela, e o compartilhamento também.

import { canAct, canActOnSector, canViewSector } from "@/lib/auth/papeis";
import type { AuthContext } from "@/lib/auth/context";

export const MODULO_ARQUIVOS = "arquivos";

/** A pasta que recebe o que o cliente manda pelo portal. Uma por empresa, sempre compartilhada. */
export const CHAVE_ENVIADOS = "enviados";
export const NOME_DE_ENVIADOS = "Enviados pelo cliente";

/** As pastas do modelo levam a chave "modelo:<id do DriveTemplateFolder>". */
export const PREFIXO_DO_MODELO = "modelo:";
export const chaveDoModelo = (templateId: string) => `${PREFIXO_DO_MODELO}${templateId}`;

/** Quanto tempo o que foi excluído fica na lixeira antes de sumir de vez. */
export const DIAS_NA_LIXEIRA = 30;

export const MAX_NOME_DA_PASTA = 120;
export const MAX_NOME_DO_ARQUIVO = 160;

/** O mínimo de uma pasta para as regras. Bate com o `select` de src/lib/drive/servidor.ts. */
export type PastaDoDrive = {
  id: string;
  name: string;
  parentId: string | null;
  companyId: string | null;
  sectorCode: string | null;
  systemKey: string | null;
  sharedWithPortal: boolean;
  deletedAt: Date | null;
};

/** Quem pede: só os campos do `AuthContext` que as regras leem. */
export type QuemPede = Pick<AuthContext, "role" | "sectors" | "subscriptionReadOnly">;

// ─── Caminho ─────────────────────────────────────────────────────────────────

/** Uma árvore não passa disto; cortar aqui protege contra ciclo gravado no banco. */
export const PROFUNDIDADE_MAXIMA = 20;

/**
 * O caminho da raiz até a pasta (inclusive), ou `null` quando a pasta não está
 * no mapa, quando falta um pai ou quando há ciclo.
 */
export function caminhoDaPasta(id: string, mapa: ReadonlyMap<string, PastaDoDrive>): PastaDoDrive[] | null {
  const caminho: PastaDoDrive[] = [];
  let atual = mapa.get(id);
  while (atual) {
    caminho.unshift(atual);
    if (caminho.length > PROFUNDIDADE_MAXIMA) return null;
    if (atual.parentId === null) return caminho;
    atual = mapa.get(atual.parentId);
  }
  return null;
}

export function mapaDePastas(pastas: readonly PastaDoDrive[]): Map<string, PastaDoDrive> {
  return new Map(pastas.map((p) => [p.id, p]));
}

/** Os setores donos ao longo do caminho, sem repetição. Quase sempre zero ou um. */
export function setoresDoCaminho(caminho: readonly PastaDoDrive[]): string[] {
  return [...new Set(caminho.map((p) => p.sectorCode).filter((s): s is string => !!s))];
}

/** Excluída, ou dentro de uma pasta excluída. */
export function caminhoNaLixeira(caminho: readonly PastaDoDrive[]): boolean {
  return caminho.some((p) => p.deletedAt !== null);
}

// ─── Equipe ──────────────────────────────────────────────────────────────────

/** Vê a pasta: todo setor dono no caminho precisa estar ao alcance de quem pede. */
export function podeVerCaminho(quem: QuemPede, caminho: readonly PastaDoDrive[]): boolean {
  return setoresDoCaminho(caminho).every((s) => canViewSector(quem, s));
}

/**
 * Mexe na pasta (enviar, criar, renomear, mover, excluir, compartilhar): além
 * de ver, precisa poder agir — o READONLY vê tudo e não mexe em nada, e a
 * assinatura vencida trava a escrita de todos.
 */
export function podeMexerNoCaminho(quem: QuemPede, caminho: readonly PastaDoDrive[]): boolean {
  if (quem.subscriptionReadOnly || !canAct(quem.role)) return false;
  return setoresDoCaminho(caminho).every((s) => canActOnSector(quem, s));
}

/** Escrita fora de qualquer pasta (criar pasta no primeiro nível). */
export function podeMexerNoDrive(quem: QuemPede): boolean {
  return !quem.subscriptionReadOnly && canAct(quem.role);
}

/** Pode tornar uma pasta "só do setor X": precisa poder agir no setor X. */
export function podeRestringirAoSetor(quem: QuemPede, setor: string): boolean {
  return podeMexerNoDrive(quem) && canActOnSector(quem, setor);
}

/** Pasta da casa (modelo ou "Enviados pelo cliente"): não muda de nome, de lugar, nem vai para a lixeira. */
export function ehPastaDaCasa(pasta: Pick<PastaDoDrive, "systemKey">): boolean {
  return pasta.systemKey !== null;
}

// ─── Cliente (portal) ────────────────────────────────────────────────────────

/** O cliente enxerga a pasta quando ela ou alguma acima dela está compartilhada, e nada no caminho está na lixeira. */
export function clienteVeCaminho(caminho: readonly PastaDoDrive[]): boolean {
  return !caminhoNaLixeira(caminho) && caminho.some((p) => p.sharedWithPortal);
}

/**
 * O pedaço do caminho que o cliente vê: da primeira pasta compartilhada (de
 * cima para baixo) até a pasta. "Contábil" fechada com "Contábil › Balanços"
 * compartilhada mostra ao cliente só "Balanços" — o nome da pasta de cima não
 * é dele.
 */
export function caminhoDoCliente(caminho: readonly PastaDoDrive[]): PastaDoDrive[] {
  const i = caminho.findIndex((p) => p.sharedWithPortal);
  return i < 0 ? [] : caminho.slice(i);
}

/**
 * As pastas que abrem a área Arquivos do cliente numa empresa: as compartilhadas
 * que não estão dentro de outra compartilhada.
 */
export function raizesDoCliente(pastas: readonly PastaDoDrive[]): PastaDoDrive[] {
  const mapa = mapaDePastas(pastas);
  return pastas.filter((p) => {
    if (!p.sharedWithPortal) return false;
    const caminho = caminhoDaPasta(p.id, mapa);
    if (!caminho || caminhoNaLixeira(caminho)) return false;
    return caminhoDoCliente(caminho)[0]?.id === p.id;
  });
}

// ─── Nome e mover ────────────────────────────────────────────────────────────

/** Caractere de controle C0, DEL ou C1. Filtrado por código, para o arquivo nunca carregar o byte. */
function ehControle(codigo: number): boolean {
  return codigo < 0x20 || (codigo >= 0x7f && codigo <= 0x9f);
}

export type NomeValidado = { ok: true; nome: string } | { ok: false; erro: string };

/** Nome de pasta ou de arquivo: sem barra, sem controle, sem só espaço, com teto. */
export function validarNome(bruto: string | null | undefined, maximo: number, oQue: string): NomeValidado {
  let limpo = "";
  for (const ch of bruto ?? "") limpo += ehControle(ch.codePointAt(0) ?? 0) ? " " : ch;
  limpo = limpo.replace(/\s+/g, " ").trim();
  if (!limpo) return { ok: false, erro: `Dê um nome ${oQue}.` };
  if (/[\\/]/.test(limpo)) return { ok: false, erro: `O nome ${oQue} não pode ter barra ( / ou \\ ).` };
  if (/^\.+$/.test(limpo)) return { ok: false, erro: `Esse nome ${oQue} não vale.` };
  if ([...limpo].length > maximo) return { ok: false, erro: `O nome ${oQue} passa de ${maximo} caracteres.` };
  return { ok: true, nome: limpo };
}

export const validarNomeDaPasta = (bruto: string | null | undefined) => validarNome(bruto, MAX_NOME_DA_PASTA, "da pasta");

/**
 * Novo nome de arquivo, mantendo a extensão. Quem renomeia "contrato.pdf" para
 * "contrato assinado" recebe "contrato assinado.pdf": a extensão é a do tipo
 * conferido na entrada, e trocar o nome não troca o que o arquivo é.
 */
export function validarNomeDoArquivo(bruto: string | null | undefined, nomeAtual: string): NomeValidado {
  const ext = /\.[A-Za-z0-9]{1,5}$/.exec(nomeAtual)?.[0] ?? "";
  const semExt = (bruto ?? "").trim().replace(/\.[A-Za-z0-9]{1,5}$/, (m) => (m.toLowerCase() === ext.toLowerCase() ? "" : m));
  const v = validarNome(semExt, MAX_NOME_DO_ARQUIVO - ext.length, "do arquivo");
  return v.ok ? { ok: true, nome: `${v.nome}${ext}` } : v;
}

/** Mover `pastaId` para dentro de `novoPaiId` criaria ciclo (a pasta iria para dentro dela mesma)? */
export function moverCriaCiclo(pastaId: string, novoPaiId: string | null, mapa: ReadonlyMap<string, PastaDoDrive>): boolean {
  if (novoPaiId === null) return false;
  const caminho = caminhoDaPasta(novoPaiId, mapa);
  if (!caminho) return true;
  return caminho.some((p) => p.id === pastaId);
}

// ─── Modelo de pastas ────────────────────────────────────────────────────────

export type PastaDoModelo = { name: string; sectorCode: string | null; sharedWithPortal: boolean };

/**
 * O modelo com que o escritório começa, até alguém mudar em /admin/arquivos.
 * Só o DP nasce fechado ao setor (holerite, ASO, rescisão); Guias e Certidões
 * nascem compartilhadas porque são do cliente por natureza.
 */
export const MODELO_PADRAO: readonly PastaDoModelo[] = [
  { name: "Fiscal", sectorCode: null, sharedWithPortal: false },
  { name: "Departamento Pessoal", sectorCode: "dp", sharedWithPortal: false },
  { name: "Societário", sectorCode: null, sharedWithPortal: false },
  { name: "Contábil", sectorCode: null, sharedWithPortal: false },
  { name: "Guias", sectorCode: null, sharedWithPortal: true },
  { name: "Certidões", sectorCode: null, sharedWithPortal: true },
];

// ─── Vencimento ──────────────────────────────────────────────────────────────

/** Com quantos dias de antecedência o arquivo que vence passa a pedir atenção (o mesmo do alerta). */
export const DIAS_DE_AVISO_DO_VENCIMENTO = 30;

/** "AAAA-MM-DD" válido, ou `null` para tirar o vencimento. `undefined` quando o texto não é uma data. */
export function lerVencimento(bruto: string | null | undefined): string | null | undefined {
  const t = (bruto ?? "").trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return undefined;
  const d = new Date(`${t}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t ? undefined : t;
}

export type SituacaoDoVencimento = "vencido" | "vence-logo" | "em-dia";

/** Dias de `de` até `ate`, as duas "AAAA-MM-DD" (negativo quando `ate` já passou). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

/** Marcos do alerta de vencimento: 30 e 7 dias antes, e no dia. Depois disso, um aviso de vencido. */
export const FAIXAS_DO_VENCIMENTO = [30, 7, 0] as const;
export type FaixaDoVencimento = (typeof FAIXAS_DO_VENCIMENTO)[number] | "vencido";

/**
 * Em que faixa de aviso o arquivo está hoje — a menor que ainda cobre os dias
 * que faltam, como nos certificados: quem põe o vencimento a 10 dias recebe o
 * aviso de 7, e não o de 30 atrasado. `null` = longe de vencer.
 */
export function faixaDoVencimento(venceEm: string, hoje: string): FaixaDoVencimento | null {
  const dias = diasEntre(hoje, venceEm);
  if (dias < 0) return "vencido";
  const cobre = FAIXAS_DO_VENCIMENTO.filter((f) => dias <= f);
  return cobre.length ? cobre[cobre.length - 1] : null;
}

/** O texto do sino. Cabe nos 255 do aviso. */
export function textoDoVencimento(input: { arquivo: string; onde: string; venceEm: string; hoje: string }): string {
  const dias = diasEntre(input.hoje, input.venceEm);
  const data = input.venceEm.split("-").reverse().join("/");
  const quando = dias < 0 ? `venceu em ${data}` : dias === 0 ? "vence hoje" : `vence em ${dias} dia(s), ${data}`;
  return `“${input.arquivo}” (${input.onde}) ${quando}.`.slice(0, 255);
}

/** Compara datas-calendário em texto ("AAAA-MM-DD"), sem fuso no meio. */
export function situacaoDoVencimento(venceEm: string | null, hoje: string): SituacaoDoVencimento | null {
  if (!venceEm) return null;
  if (venceEm < hoje) return "vencido";
  const limite = new Date(`${hoje}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + DIAS_DE_AVISO_DO_VENCIMENTO);
  return venceEm <= limite.toISOString().slice(0, 10) ? "vence-logo" : "em-dia";
}

// ─── Avisos ──────────────────────────────────────────────────────────────────

/** O texto do sino quando o cliente manda arquivos pelo portal. Cabe nos 255 do aviso. */
export function textoDoEnvioDoCliente(input: { quem: string; quantidade: number; empresa: string }): string {
  const oQue = input.quantidade === 1 ? "1 arquivo" : `${input.quantidade} arquivos`;
  return `${input.quem} enviou ${oQue} de ${input.empresa} pelo portal.`;
}

// ─── Exibição ────────────────────────────────────────────────────────────────

/** Ordem das pastas na tela: as da casa primeiro ("Enviados pelo cliente" por último entre elas), depois por nome. */
export function ordenarPastas<T extends Pick<PastaDoDrive, "name" | "systemKey">>(pastas: readonly T[], posicaoDoModelo?: ReadonlyMap<string, number>): T[] {
  const peso = (p: T) => {
    if (p.systemKey === CHAVE_ENVIADOS) return 1;
    if (p.systemKey?.startsWith(PREFIXO_DO_MODELO)) return 0;
    return 2;
  };
  return [...pastas].sort((a, b) => {
    const pa = peso(a), pb = peso(b);
    if (pa !== pb) return pa - pb;
    if (pa === 0 && posicaoDoModelo) {
      const ia = posicaoDoModelo.get(a.systemKey!) ?? 0, ib = posicaoDoModelo.get(b.systemKey!) ?? 0;
      if (ia !== ib) return ia - ib;
    }
    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base", numeric: true });
  });
}
