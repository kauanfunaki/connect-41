import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";

/** Como a integração está: ligada e em dia, com problema, ou desligada (ou nunca ligada). */
export type EstadoDaIntegracao = "ligada" | "problema" | "desligada";

export type BlocoDeIntegracao = {
  /** O endereço do painel: `?integracao=<chave>`. */
  chave: string;
  nome: string;
  icone: React.ReactNode;
  /** Uma linha do que ela faz. */
  descricao: string;
  selo: { tom: TomDoSelo; rotulo: string };
  estado: EstadoDaIntegracao;
  /** O detalhe da situação: "12 empresas", "Anthropic", o último erro. */
  detalhe?: string | null;
};

/**
 * As integrações em blocos iguais (escolha 6A dos Ajustes de 15/10,
 * 20/10/2026): ícone, situação, uma linha do que faz e "Configurar", que abre
 * o painel ao lado. Era uma página com cada seção num desenho — cartões
 * empilhados com o botão à esquerda, o Chatwoot e o Serpro duas vezes, o Omie
 * num parágrafo longo e a chave da IA no meio. O que está com problema salta
 * aos olhos pela borda.
 */
export function CatalogoDeIntegracoes({ blocos, hrefDe }: { blocos: BlocoDeIntegracao[]; hrefDe: (chave: string) => string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {blocos.map((b) => (
        <Card
          key={b.chave}
          href={hrefDe(b.chave)}
          className={`flex flex-col gap-2 p-4 ${b.estado === "problema" ? "border-danger/40" : ""}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex size-9 items-center justify-center rounded-lg bg-brand-subtle text-brand [&>svg]:size-[18px]" aria-hidden>
              {b.icone}
            </span>
            <Selo tom={b.selo.tom}>{b.selo.rotulo}</Selo>
          </div>
          <p className="text-fs-3 font-semibold text-fg">{b.nome}</p>
          <p className="min-h-[2.5rem] text-fs-2 text-fg-muted">{b.descricao}</p>
          {b.detalhe && <p className="truncate text-fs-1 text-fg-secondary" title={b.detalhe}>{b.detalhe}</p>}
          <span className="mt-auto inline-flex items-center gap-1 pt-1 text-label font-medium text-brand">
            Configurar <ArrowRight size={14} aria-hidden />
          </span>
        </Card>
      ))}
    </div>
  );
}
