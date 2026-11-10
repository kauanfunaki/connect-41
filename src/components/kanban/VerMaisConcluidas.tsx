import Link from "next/link";
import { formatarNumero } from "@/lib/format";
import { proximoLimite, temMaisConcluidas, type ResumoDaConcluida } from "@/lib/kanban/concluidasDoQuadro";

/** O endereço da lista com mais um passo de concluídas, ou `null` no teto. */
export function enderecoComMaisConcluidas(basePath: string, limiteAtual: number): string | null {
  const proximo = proximoLimite(limiteAtual);
  return proximo === null ? null : `${basePath}?concluidas=${proximo}`;
}

/**
 * O pé da coluna concluída do quadro e do grupo concluído da Lista (10/11/2026):
 * a página traz só as concluídas mais recentes, e aqui se pede mais um passo.
 * No teto (`CONCLUIDAS_NO_MAXIMO`) fica só a contagem — dali em diante, a busca.
 */
export function VerMaisConcluidas({ resumo, href }: { resumo: ResumoDaConcluida | undefined; href: string | null }) {
  if (!resumo || !temMaisConcluidas(resumo)) return null;
  const contagem = `${formatarNumero(resumo.mostradas, 0)} de ${formatarNumero(resumo.total, 0)}`;
  if (!href) {
    return <p className="text-fs-1 text-fg-muted">Mostrando as {contagem} concluídas mais recentes</p>;
  }
  return (
    <Link href={href} scroll={false} className="inline-flex text-fs-1 font-medium text-brand hover:underline">
      Ver mais concluídas ({contagem})
    </Link>
  );
}
