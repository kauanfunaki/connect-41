"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { useConfirm } from "@/components/ui/useConfirm";
import { formatInstantDate } from "@/lib/format";
import { moeda } from "@/lib/financeiro/formato";
import { aprovarContas, reprovarConta } from "@/app/(portal)/portal/(area)/aprovacoes/actions";
import { ReprovarComMotivo } from "./ReprovarComMotivo";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { saoPauloParts } from "@/lib/agenda";

export type ContaParaAprovar = {
  id: string;
  fornecedor: string;
  descricao: string | null;
  empresa: string;
  vencimento: Date;
  valorCentavos: number;
  /** Calculado no servidor com a alçada vigente; a action confere de novo. */
  dentroDoTeto: boolean;
};

/**
 * A lista do cliente, com aprovação em lote.
 *
 * Só dá para marcar o que está dentro do teto: marcar o que o servidor vai
 * recusar de qualquer jeito só adia a frustração. O que está fora aparece, com
 * o selo, porque saber que existe uma conta esperando outra pessoa também é
 * informação.
 */
export function AprovacoesDoPortal({ contas }: { contas: ContaParaAprovar[] }) {
  const { dialog, requestConfirm } = useConfirm();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [resultado, setResultado] = useState<string | null>(null);
  // As linhas que o funil das colunas deixou à vista (avisadas pela
  // TabelaFiltravel): "Marcar todas" e "Aprovar selecionadas" não levam conta
  // escondida pelo filtro.
  const [naTela, setNaTela] = useState<Set<string>>(() => new Set(contas.map((c) => c.id)));

  const aprovaveis = useMemo(() => contas.filter((c) => c.dentroDoTeto && naTela.has(c.id)), [contas, naTela]);
  const marcadasNaTela = new Set([...marcadas].filter((id) => naTela.has(id)));
  const totalMarcado = contas.filter((c) => marcadasNaTela.has(c.id)).reduce((s, c) => s + c.valorCentavos, 0);

  function alternar(id: string) {
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  function aprovar(ids: string[], titulo: string) {
    setResultado(null);
    requestConfirm({ title: titulo, description: "Aprovar libera a baixa pela equipe.", confirmLabel: "Aprovar" }, async () => {
      const r = await aprovarContas(ids);
      if ("error" in r) throw new Error(r.error);
      setMarcadas(new Set());
      setResultado(
        `${r.aprovadas} ${r.aprovadas === 1 ? "conta aprovada" : "contas aprovadas"}` +
          (r.ignoradas > 0 ? ` · ${r.ignoradas} não ${r.ignoradas === 1 ? "pôde" : "puderam"} ser aprovada(s): ${r.motivos.join(" ")}` : "")
      );
    });
  }

  return (
    <div>
      {aprovaveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Checkbox
            label="Marcar todas dentro do meu teto"
            checked={aprovaveis.every((c) => marcadas.has(c.id))}
            onChange={(e) => setMarcadas(e.target.checked ? new Set(aprovaveis.map((c) => c.id)) : new Set())}
          />
          <Button
            size="sm"
            variant="success"
            disabled={marcadasNaTela.size === 0}
            onClick={() =>
              aprovar(
                [...marcadasNaTela],
                `Aprovar ${marcadasNaTela.size} ${marcadasNaTela.size === 1 ? "conta" : "contas"} (${moeda(totalMarcado)})?`
              )
            }
          >
            <CheckCircle2 size={13} /> Aprovar selecionadas
          </Button>
        </div>
      )}
      {resultado && <p className="text-[12px] text-success mb-3">{resultado}</p>}

      {/* Abaixo de md, cartões. Aprovar pagamento é o que o cliente mais faz
          longe do computador, e a tabela de 820px escondia o valor e os botões
          atrás de uma rolagem lateral. */}
      <CartoesNoCelular>
        {contas.map((c) => (
          <Cartao key={c.id}>
            <div className="flex items-start gap-2.5">
              {c.dentroDoTeto && (
                <Checkbox
                  checked={marcadas.has(c.id)}
                  onChange={() => alternar(c.id)}
                  aria-label={`Marcar ${c.fornecedor}`}
                  className="mt-1"
                />
              )}
              <div className="min-w-0 flex-1">
                <TopoDoCartao nome={c.fornecedor} valor={moeda(c.valorCentavos)} />
                {c.descricao && <InfoDoCartao className="break-words">{c.descricao}</InfoDoCartao>}
                <InfoDoCartao className="mt-1 tabular-nums">
                  vence {formatInstantDate(c.vencimento)} · {c.empresa}
                </InfoDoCartao>
                <PeDoCartao>
                  {c.dentroDoTeto ? <Badge variant="success">Dentro do teto</Badge> : <Badge variant="warning">Fora do teto</Badge>}
                </PeDoCartao>
                <div className="mt-2">
                  {c.dentroDoTeto ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="xs"
                        variant="success"
                        onClick={() => aprovar([c.id], `Aprovar ${c.fornecedor} (${moeda(c.valorCentavos)})?`)}
                      >
                        <CheckCircle2 size={12} /> Aprovar
                      </Button>
                      <ReprovarComMotivo
                        entryId={c.id}
                        descricao={`${c.fornecedor} · ${moeda(c.valorCentavos)} · ${c.empresa}`}
                        acao={async (id, motivo) => {
                          const r = await reprovarConta(id, motivo);
                          if ("ok" in r) setResultado("Conta reprovada. A equipe foi avisada.");
                          return r;
                        }}
                      />
                    </div>
                  ) : (
                    <span className="text-[11px] text-fg-muted">Outra pessoa aprova</span>
                  )}
                </div>
              </div>
            </div>
          </Cartao>
        ))}
      </CartoesNoCelular>

      {/* No casco padrão, com funil nas colunas (02/10). A lista vem inteira,
          então filtra no navegador. */}
      <TabelaFiltravel
        onLinhasVisiveis={setNaTela}
        linhas={contas.map((c) => ({
          id: c.id,
          valores: {
            vencimento: saoPauloParts(c.vencimento).dateKey,
            fornecedor: c.fornecedor,
            empresa: c.empresa,
            teto: c.dentroDoTeto ? "Dentro do teto" : "Fora do teto",
          },
        }))}
      >
      <TabelaNoDesktop padrao>
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
              <th className="py-2 pr-2 w-8"></th>
              <th className="py-2 pr-3 font-medium">
                <FiltroDaColuna rotulo="Vencimento" chave="vencimento" tipo="data" />
              </th>
              <th className="py-2 pr-3 font-medium">
                <FiltroDaColuna rotulo="Fornecedor" chave="fornecedor" />
              </th>
              <th className="py-2 pr-3 font-medium">
                <FiltroDaColuna rotulo="Empresa" chave="empresa" />
              </th>
              <th className="py-2 pr-3 font-medium">Valor</th>
              <th className="py-2 pr-3 font-medium">
                <FiltroDaColuna rotulo="Teto" chave="teto" align="right" />
              </th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {contas.map((c) => (
              <LinhaFiltravel key={c.id} id={c.id} className="border-b border-border-soft">
                <td className="py-2.5 pr-2">
                  {c.dentroDoTeto && (
                    <Checkbox checked={marcadas.has(c.id)} onChange={() => alternar(c.id)} aria-label={`Marcar ${c.fornecedor}`} />
                  )}
                </td>
                <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">{formatInstantDate(c.vencimento)}</td>
                <td className="py-2.5 pr-3">
                  <span className="font-medium">{c.fornecedor}</span>
                  {c.descricao && <span className="block text-[11px] text-fg-muted truncate max-w-[240px]">{c.descricao}</span>}
                </td>
                <td className="py-2.5 pr-3 text-fg-secondary">{c.empresa}</td>
                <td className="py-2.5 pr-3 tabular-nums font-medium">{moeda(c.valorCentavos)}</td>
                <td className="py-2.5 pr-3">
                  {c.dentroDoTeto ? <Badge variant="success">Dentro do teto</Badge> : <Badge variant="warning">Fora do teto</Badge>}
                </td>
                <td className="py-2.5">
                  {c.dentroDoTeto ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="xs"
                        variant="success"
                        onClick={() => aprovar([c.id], `Aprovar ${c.fornecedor} (${moeda(c.valorCentavos)})?`)}
                      >
                        <CheckCircle2 size={12} /> Aprovar
                      </Button>
                      <ReprovarComMotivo
                        entryId={c.id}
                        descricao={`${c.fornecedor} · ${moeda(c.valorCentavos)} · ${c.empresa}`}
                        acao={async (id, motivo) => {
                          const r = await reprovarConta(id, motivo);
                          if ("ok" in r) setResultado("Conta reprovada. A equipe foi avisada.");
                          return r;
                        }}
                      />
                    </div>
                  ) : (
                    <span className="text-[11px] text-fg-muted">Outra pessoa aprova</span>
                  )}
                </td>
              </LinhaFiltravel>
            ))}
          </tbody>
        </table>
      </TabelaNoDesktop>
      </TabelaFiltravel>
      {dialog}
    </div>
  );
}
