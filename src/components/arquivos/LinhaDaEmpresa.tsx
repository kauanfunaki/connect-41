import Link from "next/link";
import { Building2, CircleAlert } from "lucide-react";
import { Contador } from "@/components/ui/Contador";
import { Selo } from "@/components/ui/Selo";
import { formatCnpj } from "@/lib/format";
import type { EmpresaNaTela } from "@/lib/drive/tela";

/**
 * A linha de uma empresa nos Arquivos: nome, CNPJ e, à direita, a etiqueta com
 * quantos documentos ela tem — âmbar com "!" e o número de novos quando o
 * cliente mandou algo que ninguém da equipe abriu ainda. O clique abre as
 * pastas da empresa (direto em "Enviados pelo cliente" quando há novidade).
 *
 * Saiu da tela inicial em 16/11/2026 (melhoria-716) para a lista do início e
 * o grupo "Empresas" do resultado da busca terem o mesmo desenho. `noCasco` é
 * a linha dentro do cartão do resultado: no computador, o respiro lateral
 * acompanha o da barra e o da tabela.
 */
export function LinhaDaEmpresa({ empresa: e, noCasco = false }: { empresa: EmpresaNaTela; noCasco?: boolean }) {
  const documentos = `${e.documentos} ${e.documentos === 1 ? "documento" : "documentos"}`;
  const rotulo = e.novos > 0 ? `${e.novos} ${e.novos === 1 ? "envio novo" : "envios novos"} do cliente · ${documentos}` : documentos;
  return (
    <li>
      <Link
        href={`/arquivos/empresa/${e.id}${e.novos > 0 ? "?pasta=enviados" : ""}`}
        className={`flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors ${noCasco ? "md:px-4" : ""}`.trim()}
      >
        <Building2 size={16} className="text-fg-muted shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 text-fs-3 font-medium text-fg truncate">{e.nome}</span>
        {e.cnpj && <span className="text-micro text-fg-muted tabular-nums shrink-0 hidden sm:inline">{formatCnpj(e.cnpj)}</span>}
        {/* A etiqueta: quantos documentos (Arquivos + Do Connect);
            com envio novo do cliente, "!" e quantos são novos. */}
        {e.novos > 0 ? (
          <Selo tom="atencao" className="shrink-0 gap-1 tabular-nums">
            <CircleAlert size={12} aria-hidden />
            <span>{e.novos}</span>
            <span className="sr-only">{rotulo}</span>
          </Selo>
        ) : (
          // A contagem no `Contador` (15/10/2026): o `Selo` é de
          // situação. O envio novo continua no selo de atenção.
          <span className="shrink-0 inline-flex">
            <span aria-hidden className="inline-flex">
              <Contador valor={e.documentos} teto={Number.MAX_SAFE_INTEGER} />
            </span>
            <span className="sr-only">{rotulo}</span>
          </span>
        )}
      </Link>
    </li>
  );
}
