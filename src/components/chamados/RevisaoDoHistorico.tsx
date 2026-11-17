"use client";

import { useState, useTransition } from "react";
import { Check, Download, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Selo } from "@/components/ui/Selo";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { useToast } from "@/components/ui/Toast";
import { importarHistorico, revisarCasoDoHistorico } from "@/app/(app)/chamados/configuracoes/historico/actions";
import type { SituacaoDoCaso } from "@/lib/chamados/historico";

/** "Trazer do Hub": busca os chamados novos; a IA lê depois, fora da tela. */
export function ImportarHistorico({ jaImportou }: { jaImportou: boolean }) {
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  return (
    <Button
      variant={jaImportou ? "secondary" : "primary"}
      loading={pendente}
      loadingLabel="Buscando no Hub…"
      onClick={() =>
        iniciar(async () => {
          const r = await importarHistorico();
          if (!r.ok) toast.error(r.erro);
          else if (r.novos === 0) toast.success("Nenhum chamado novo no Hub.");
          else toast.success(`${r.novos} ${r.novos === 1 ? "chamado trazido" : "chamados trazidos"}. A IA está lendo; atualize em alguns minutos.`);
        })
      }
    >
      <Download size={14} aria-hidden /> {jaImportou ? "Buscar novos no Hub" : "Trazer do Hub"}
    </Button>
  );
}

type Categoria = { id: string; caminho: string };

export type CasoNaTela = {
  id: string;
  titulo: string;
  resumo: string | null;
  descricao: string;
  solucao: string | null;
  respostas: string[];
  setor: string | null;
  abertoEm: string;
  situacao: SituacaoDoCaso;
  /** O caminho da categoria escolhida no Hub, como veio. */
  escolhidaNoHub: string;
  original: { id: string | null; caminho: string | null };
  sugerida: { id: string | null; caminho: string | null };
  final: string | null;
  revisadoPorAlguem: boolean;
  tags: string[];
};

/**
 * Um caso do histórico: o pedido resumido, a solução, e a escolha entre a
 * categoria de quem pediu e a sugerida pela IA (ou outra, ou descartar). No
 * caso já confirmado ou descartado, a escolha fica num "Mudar".
 */
export function RevisaoDoCaso({ caso, categorias }: { caso: CasoNaTela; categorias: Categoria[] }) {
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [mudando, setMudando] = useState(caso.situacao === "A_REVISAR");
  const [outra, setOutra] = useState("");
  const decidido = caso.situacao === "CONFIRMADO" || caso.situacao === "DESCARTADO";

  function decidir(decisao: { categoryId: string } | { descartar: true }) {
    iniciar(async () => {
      const r = await revisarCasoDoHistorico(caso.id, decisao);
      if (!r.ok) toast.error(r.erro);
      else {
        toast.success("descartar" in decisao ? "Caso descartado." : "Categoria confirmada.");
        setOutra("");
      }
    });
  }

  const iguais = caso.original.id && caso.original.id === caso.sugerida.id;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-card-title font-semibold text-fg break-words">{caso.resumo || caso.titulo}</h2>
          <p className="text-helper text-fg-muted">
            {caso.abertoEm}
            {caso.setor ? ` · ${caso.setor}` : ""}
            {caso.tags.length > 0 ? ` · ${caso.tags.join(", ")}` : ""}
          </p>
        </div>
        {caso.situacao === "CONFIRMADO" && <Selo tom="sucesso">{caso.revisadoPorAlguem ? "Confirmado pela equipe" : "Confirmado sozinho"}</Selo>}
        {caso.situacao === "DESCARTADO" && <Selo tom="neutro">Descartado</Selo>}
      </div>

      {caso.solucao && (
        <p className="text-ui text-fg-secondary">
          <span className="font-medium text-fg">O que a equipe fez: </span>
          {caso.solucao}
        </p>
      )}

      <BlocoRecolhivel titulo="Pedido original" resumo={<span className="truncate">{caso.titulo}</span>} classeDoConteudo="flex flex-col gap-2 px-4 pb-4">
        <p className="whitespace-pre-wrap break-words text-ui text-fg-secondary">{caso.descricao || "Sem descrição."}</p>
        {caso.respostas.map((r, i) => (
          <p key={i} className="whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 text-ui text-fg-secondary">
            <span className="font-medium text-fg">Equipe: </span>
            {r}
          </p>
        ))}
      </BlocoRecolhivel>

      {decidido && !mudando ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-ui">
          <span className="text-fg-secondary">
            {caso.situacao === "CONFIRMADO" ? (
              <>
                <span className="text-fg-muted">Categoria: </span>
                <span className="font-medium text-fg">{caso.final ?? "—"}</span>
              </>
            ) : (
              "Fora dos exemplos da triagem."
            )}
          </span>
          <Button variant="link" onClick={() => setMudando(true)}>
            Mudar
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-ui sm:grid-cols-[max-content_1fr]">
            <dt className="text-fg-muted">Quem pediu escolheu</dt>
            <dd className="text-fg">{caso.original.caminho ?? `${caso.escolhidaNoHub} (sem par no Connect)`}</dd>
            <dt className="text-fg-muted">A IA sugere</dt>
            <dd className="text-fg">{caso.sugerida.caminho ?? "Não soube dizer"}</dd>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            {caso.original.id && (
              <Button size="sm" variant={iguais ? "primary" : "secondary"} disabled={pendente} onClick={() => decidir({ categoryId: caso.original.id! })}>
                <Check size={14} aria-hidden /> {iguais ? "Confirmar" : "Usar a de quem pediu"}
              </Button>
            )}
            {caso.sugerida.id && !iguais && (
              <Button size="sm" disabled={pendente} onClick={() => decidir({ categoryId: caso.sugerida.id! })}>
                <Check size={14} aria-hidden /> Usar a sugerida
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Select aria-label="Outra categoria" value={outra} onChange={(e) => setOutra(e.target.value)} className="h-8 max-w-64 text-ui">
                <option value="">Outra categoria…</option>
                {categorias.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.caminho}
                  </option>
                ))}
              </Select>
              {outra && (
                <Button size="sm" variant="secondary" disabled={pendente} onClick={() => decidir({ categoryId: outra })}>
                  Usar esta
                </Button>
              )}
            </div>
            <Button size="sm" variant="ghost" disabled={pendente} onClick={() => decidir({ descartar: true })}>
              <X size={14} aria-hidden /> Descartar
            </Button>
            {decidido && (
              <Button size="sm" variant="link" onClick={() => setMudando(false)}>
                Cancelar
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
