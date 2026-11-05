"use client";

import { useState, useTransition } from "react";
import { FilePen, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { SlideOver } from "@/components/ui/SlideOver";
import { formatarReaisDeCentavos as moeda } from "@/lib/format";
import { modeloDoCodigo } from "@/lib/dre/estrutura";
import type { DiferencaDaDre } from "@/lib/dre/publicacao";
import { publicarDreDoMes } from "@/app/(app)/dre/publicacao-actions";

type Props = {
  companyId: string;
  /** "AAAA-MM". */
  competencia: string;
  /** "Out/26". */
  rotuloDoMes: string;
  diferencas: DiferencaDaDre[];
  /** O mês nunca foi publicado: o cliente não o vê no portal. */
  nuncaPublicado: boolean;
};

const REGIME: Record<"caixa" | "competencia", string> = { caixa: "Caixa", competencia: "Competência" };

/**
 * A faixa do rascunho (05/11/2026, decisão D4 do Kauan): a DRE da equipe mudou
 * e o portal ainda mostra a versão publicada. "Ver diferenças" abre, à
 * direita, linha a linha o que o cliente passaria a ver; "Publicar para o
 * cliente" grava a foto de agora.
 *
 * Tom de marca, e não de atenção: rascunho é o estado normal de quem está
 * fechando o mês, não um problema. O âmbar fica para o que tira dinheiro do
 * resultado (o aviso do sem grupo, logo abaixo).
 */
export function FaixaDoRascunho({ companyId, competencia, rotuloDoMes, diferencas, nuncaPublicado }: Props) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [publicando, iniciar] = useTransition();

  function publicar() {
    setErro(null);
    iniciar(async () => {
      const r = await publicarDreDoMes(companyId, competencia);
      if (r && "error" in r) setErro(r.error);
      else setAberto(false);
    });
  }

  const n = diferencas.length;
  const texto = nuncaPublicado
    ? `${rotuloDoMes} ainda não foi publicado: o cliente não vê este mês no portal.`
    : `${n} ${n === 1 ? "mudança ainda não está" : "mudanças ainda não estão"} no portal.`;

  const botaoPublicar = (
    <Button variant="primary" size="xs" onClick={publicar} disabled={publicando} aria-busy={publicando || undefined}>
      <Send size={14} aria-hidden /> {publicando ? "Publicando…" : "Publicar para o cliente"}
    </Button>
  );

  return (
    <>
      <Aviso tom="marca" icone={<FilePen />} className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-fg min-w-0 flex-1">
            <strong>Rascunho de {rotuloDoMes}</strong> — {texto}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="xs" onClick={() => setAberto(true)} aria-haspopup="dialog">
              Ver diferenças
            </Button>
            {botaoPublicar}
          </div>
        </div>
        {erro && !aberto && (
          <p role="alert" className="text-fs-2 text-danger mt-2">
            {erro}
          </p>
        )}
      </Aviso>

      <SlideOver open={aberto} onClose={() => !publicando && setAberto(false)} title={`O que muda no portal — ${rotuloDoMes}`} width="max-w-xl" fundo="leve">
        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto">
          <p className="text-ui text-fg-secondary">
            {nuncaPublicado
              ? "Este mês ainda não está no portal. Publicado, o cliente passa a ver estas linhas."
              : "À esquerda, o que o cliente vê hoje no portal; à direita, o que ele passa a ver se você publicar agora."}
          </p>
          <TabelaDeDiferencas diferencas={diferencas} />
          {erro && (
            <Aviso tom="perigo">
              {erro}
            </Aviso>
          )}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {botaoPublicar}
            <Button variant="ghost" size="xs" onClick={() => setAberto(false)} disabled={publicando}>
              Fechar
            </Button>
          </div>
        </div>
      </SlideOver>
    </>
  );
}

function TabelaDeDiferencas({ diferencas }: { diferencas: DiferencaDaDre[] }) {
  const modelo = diferencas.find((d) => d.tipo === "modelo");
  const porRegime = (["caixa", "competencia"] as const)
    .map((regime) => ({ regime, linhas: diferencas.filter((d) => d.tipo !== "modelo" && d.regime === regime) }))
    .filter((g) => g.linhas.length > 0);
  const valor = (c: number | null) => (c === null ? "—" : moeda(c));

  return (
    <div className="flex flex-col gap-4">
      {modelo && modelo.tipo === "modelo" && (
        <p className="text-ui text-fg">
          Modelo da DRE: <strong>{modeloDoCodigo(modelo.noPortal).nome}</strong> no portal, <strong>{modeloDoCodigo(modelo.agora).nome}</strong> agora.
        </p>
      )}
      {porRegime.map((g) => (
        <section key={g.regime} aria-labelledby={`diferencas-${g.regime}`}>
          <h3 id={`diferencas-${g.regime}`} className="text-card-title font-semibold text-fg mb-2">
            {REGIME[g.regime]}
          </h3>
          <div className="c41-tabela scroll-x overflow-x-auto bg-surface border border-border rounded-lg">
            <table className="w-full min-w-[420px]">
              <thead>
                <tr>
                  <th className="px-3">Linha</th>
                  <th className="px-3 text-right">No portal</th>
                  <th className="px-3 text-right">Agora</th>
                </tr>
              </thead>
              <tbody>
                {g.linhas.map((d) =>
                  d.tipo === "linha" ? (
                    <tr key={`l-${d.codigo}`} className="border-b border-border-soft">
                      <td className="px-3">{d.rotulo}</td>
                      <td className="px-3 text-right tabular-nums text-fg-secondary">{valor(d.noPortal)}</td>
                      <td className="px-3 text-right tabular-nums font-medium">{valor(d.agora)}</td>
                    </tr>
                  ) : d.tipo === "categorias" ? (
                    <tr key={`c-${d.grupo}`} className="border-b border-border-soft">
                      <td className="px-3" colSpan={3}>
                        {d.rotulo}: <span className="text-fg-secondary">mesmo total, categorias diferentes</span>
                      </td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
