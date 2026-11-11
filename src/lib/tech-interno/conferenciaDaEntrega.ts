// O que o Connect confere sozinho no "Antes de testar" de um item do Controle
// interno (11/11/2026, funcionalidade-579, desenho aprovado pelo Kauan em 10/11).
//
// O item podia dizer "falta o merge e o deploy" com o PR mergeado e no ar há
// dias. O botão "Conferir", junto ao PR, olha três coisas:
//
// - o PR: aberto, mergeado ou fechado, pelo GitHub;
// - cada migration citada (no critério, na descrição ou entre os arquivos do PR):
//   se está aplicada no banco (`_prisma_migrations`);
// - se está no ar: o commit do merge faz parte do commit do deploy, que o Connect
//   em produção conhece (o EasyPanel passa GIT_SHA no build, e o Next o publica
//   como deploymentId).
//
// O que deu certo fica marcado no item, na seção "auto" das marcas, com quem
// pediu a conferência. O resto (ligar um módulo, um agente, o push) a pessoa
// marca à mão, nos pontos do próprio "Antes de testar".
//
// Puro, sem banco nem rede: a leitura está em conferenciaDaEntregaServidor.ts.

export type ChaveDaConferencia = "pr" | "no-ar" | `migration:${string}`;
export type ResultadoDaConferencia = { chave: ChaveDaConferencia; ok: boolean; detalhe: string };

/** O repositório do Connect, onde valem a migration e o "no ar". */
export const REPOSITORIO_DO_CONNECT_PADRAO = "kauanfunaki/connect-41";

/** O nome da pasta de uma migration do Prisma: "20261111030000_algo". */
const MIGRATION = /\b(\d{14}_[a-z0-9_]+)\b/g;
const ARQUIVO_DE_MIGRATION = /^prisma\/migrations\/(\d{14}_[a-z0-9_]+)\/migration\.sql$/;

export type PrDoGithub = { dono: string; repo: string; numero: number };

/** O PR do GitHub a partir do endereço do item; `null` em outro endereço. */
export function lerPr(url: string | null | undefined): PrDoGithub | null {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/pull\/(\d{1,7})(?:[/?#].*)?$/i.exec((url ?? "").trim());
  return m ? { dono: m[1], repo: m[2], numero: Number(m[3]) } : null;
}

/** O PR é do repositório do Connect (sem diferença de caixa). */
export function ehDoConnect(pr: PrDoGithub | null, repositorio: string): boolean {
  return !!pr && `${pr.dono}/${pr.repo}`.toLowerCase() === repositorio.toLowerCase();
}

/** As migrations citadas nos textos, sem repetir, na ordem em que aparecem. */
export function migrationsCitadas(...textos: (string | null | undefined)[]): string[] {
  const nomes = new Set<string>();
  for (const t of textos) for (const m of (t ?? "").matchAll(MIGRATION)) nomes.add(m[1]);
  return [...nomes];
}

/** As migrations entre os arquivos de um PR. */
export function migrationsDosArquivos(arquivos: readonly string[]): string[] {
  return [...new Set(arquivos.map(a => ARQUIVO_DE_MIGRATION.exec(a)?.[1]).filter((n): n is string => !!n))];
}

/**
 * O commit do deploy, quando é um sha. Sem o GIT_SHA no build, o Dockerfile usa
 * a hora (`date +%s`, só dígitos), que não é commit nenhum.
 */
export function commitDoDeploy(valor: string | false | null | undefined): string | null {
  return typeof valor === "string" && /^[0-9a-f]{7,40}$/i.test(valor) && !/^\d+$/.test(valor) ? valor.toLowerCase() : null;
}

export type ItemParaConferir = {
  prUrl: string | null;
  commitSha: string | null;
  acceptanceCriteria: string | null;
  description: string | null;
};

/**
 * As conferências que o item mostra, na ordem: o PR, cada migration e o "no
 * ar". A migration e o "no ar" só valem para o repositório do Connect — num PR
 * de outro sistema, o banco e o deploy daqui não dizem nada sobre ele.
 * `jaMarcadas` traz as migrations achadas nos arquivos do PR numa conferência
 * anterior, que o texto do item pode não citar.
 */
export function conferenciasDoItem(item: ItemParaConferir, repositorio: string, jaMarcadas: readonly string[] = []): ChaveDaConferencia[] {
  const pr = lerPr(item.prUrl);
  const doConnect = pr ? ehDoConnect(pr, repositorio) : !!item.commitSha;
  const chaves: ChaveDaConferencia[] = [];
  if (pr) chaves.push("pr");
  if (doConnect) {
    const anteriores = jaMarcadas.filter(c => c.startsWith("migration:")).map(c => c.slice("migration:".length));
    for (const nome of new Set([...migrationsCitadas(item.acceptanceCriteria, item.description), ...anteriores])) chaves.push(`migration:${nome}`);
    chaves.push("no-ar");
  }
  return chaves;
}

/** O texto da linha na tela. */
export function rotuloDaConferencia(chave: ChaveDaConferencia): string {
  if (chave === "pr") return "PR mergeado";
  if (chave === "no-ar") return "No ar: o merge está no deploy de produção";
  return `Migration ${chave.slice("migration:".length)} aplicada no banco`;
}

/**
 * O commit do merge está no deploy quando, comparando o deploy (base) com ele
 * (head), o GitHub diz que ele é o mesmo commit ou que ficou para trás.
 */
export function estaNoDeploy(statusDaComparacao: string): boolean {
  return statusDaComparacao === "identical" || statusDaComparacao === "behind";
}

/** O resumo para o aviso da tela: "2 de 3 conferidos; falta: No ar…". */
export function resumoDaConferencia(resultados: readonly ResultadoDaConferencia[]): string {
  if (!resultados.length) return "Nada para conferir: o item não tem PR nem commit do Connect.";
  const ok = resultados.filter(r => r.ok).length;
  const faltam = resultados.filter(r => !r.ok).map(r => `${rotuloDaConferencia(r.chave)} (${r.detalhe})`);
  return faltam.length ? `${ok} de ${resultados.length} conferido${resultados.length === 1 ? "" : "s"}. Falta: ${faltam.join("; ")}.` : `Tudo conferido: ${resultados.map(r => rotuloDaConferencia(r.chave)).join("; ")}.`;
}
