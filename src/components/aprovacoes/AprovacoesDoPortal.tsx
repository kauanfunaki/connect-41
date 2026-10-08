"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { formatInstantDate } from "@/lib/format";
import { moeda } from "@/lib/financeiro/formato";
import { aprovarContas, reprovarConta } from "@/app/(portal)/portal/(area)/aprovacoes/actions";
import { ReprovarComMotivo } from "./ReprovarComMotivo";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
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
 *
 * No casco da tabela (07/10/2026), como Pendências e a tela da equipe: a
 * contagem e o total à esquerda, o "Marcar todas" e o "Aprovar selecionadas" à
 * direita — eram uma fileira solta acima da lista.
 *
 * O resultado sai num aviso que some sozinho (`useToast`, anunciado pelo leitor
 * de tela): era um parágrafo de 12px acima da lista, e no celular, depois de
 * aprovar um cartão lá embaixo, ficava fora da tela. O que não pôde ser
 * aprovado, com o motivo, fica num aviso fixo acima da lista até a próxima ação.
 */
export function AprovacoesDoPortal({ contas, vazio }: { contas: ContaParaAprovar[]; vazio: React.ReactNode }) {
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [ignoradas, setIgnoradas] = useState<string | null>(null);
  // As linhas que o funil das colunas deixou à vista (avisadas pela
  // TabelaFiltravel): "Marcar todas" e "Aprovar selecionadas" não levam conta
  // escondida pelo filtro.
  const [naTela, setNaTela] = useState<Set<string>>(() => new Set(contas.map((c) => c.id)));

  const visiveis = contas.filter((c) => naTela.has(c.id));
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
    setIgnoradas(null);
    requestConfirm({ title: titulo, description: "Aprovar libera a baixa pela equipe.", confirmLabel: "Aprovar" }, async () => {
      const r = await aprovarContas(ids);
      if ("error" in r) throw new Error(r.error);
      setMarcadas(new Set());
      const aprovadas = `${r.aprovadas} ${r.aprovadas === 1 ? "conta aprovada" : "contas aprovadas"}`;
      if (r.ignoradas === 0) {
        toast.success(`${aprovadas}. A equipe foi avisada.`);
        return;
      }
      const naoPuderam = `${r.ignoradas} não ${r.ignoradas === 1 ? "pôde ser aprovada" : "puderam ser aprovadas"}`;
      setIgnoradas(`${naoPuderam}: ${r.motivos.join(" ")}`);
      const resumo = `${aprovadas} · ${naoPuderam}. O motivo está no topo da lista.`;
      if (r.aprovadas > 0) toast.success(resumo);
      else toast.error(resumo);
    });
  }

  async function reprovar(id: string, motivo: string) {
    setIgnoradas(null);
    const r = await reprovarConta(id, motivo);
    if ("ok" in r) toast.success("Conta reprovada. A equipe foi avisada.");
    return r;
  }

  const acoesDoLote =
    aprovaveis.length > 0 ? (
      <>
        {/* O rótulo inteiro é o alvo, com 40px de altura no celular — a caixa
            sozinha tem 18px. */}
        <label className="inline-flex min-h-10 md:min-h-0 items-center gap-2 text-label leading-5 text-fg-secondary cursor-pointer">
          <Checkbox
            checked={aprovaveis.every((c) => marcadas.has(c.id))}
            onChange={(e) => setMarcadas(e.target.checked ? new Set(aprovaveis.map((c) => c.id)) : new Set())}
          />
          Marcar todas dentro do meu teto
        </label>
        <Button
          size="sm"
          variant="success"
          className="max-md:h-10"
          disabled={marcadasNaTela.size === 0}
          onClick={() =>
            aprovar(
              [...marcadasNaTela],
              `Aprovar ${marcadasNaTela.size} ${marcadasNaTela.size === 1 ? "conta" : "contas"} (${moeda(totalMarcado)})?`
            )
          }
        >
          <CheckCircle2 size={14} /> Aprovar selecionadas
        </Button>
      </>
    ) : undefined;

  return (
    <div>
      {ignoradas && (
        <Aviso tom="atencao" className="mb-3">
          {ignoradas}
        </Aviso>
      )}

      <CascoDaTabela
        contagem={contarItens(visiveis.length, "conta", "contas")}
        total={contas.length > 0 ? moeda(visiveis.reduce((s, c) => s + c.valorCentavos, 0)) : undefined}
        acoes={acoesDoLote}
      >
        {contas.length === 0 ? (
          vazio
        ) : (
          <>
            {/* Abaixo de md, cartões. Aprovar pagamento é o que o cliente mais
                faz longe do computador, e a tabela de 820px escondia o valor e
                os botões atrás de uma rolagem lateral.

                Alvos de toque (07/10/2026): a caixa de marcar ganha uma área de
                44px em volta (era 18px) e os dois botões vão para o tamanho
                `lg`, de 40px, lado a lado na largura do cartão — eram `xs`, de
                28px. A tabela do computador fica como estava. */}
            <CartoesNoCelular>
              {contas.map((c) => (
                <Cartao key={c.id}>
                  <div className="flex items-start">
                    {c.dentroDoTeto && (
                      <label className="-ml-3 -mt-2.5 flex size-11 flex-shrink-0 items-center justify-center cursor-pointer">
                        <Checkbox checked={marcadas.has(c.id)} onChange={() => alternar(c.id)} aria-label={`Marcar ${c.fornecedor}`} />
                      </label>
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
                    </div>
                  </div>
                  {c.dentroDoTeto ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        size="lg"
                        variant="success"
                        className="w-full"
                        onClick={() => aprovar([c.id], `Aprovar ${c.fornecedor} (${moeda(c.valorCentavos)})?`)}
                      >
                        <CheckCircle2 size={16} /> Aprovar
                      </Button>
                      <ReprovarComMotivo
                        entryId={c.id}
                        descricao={`${c.fornecedor} · ${moeda(c.valorCentavos)} · ${c.empresa}`}
                        tamanho="lg"
                        className="w-full"
                        acao={reprovar}
                      />
                    </div>
                  ) : (
                    <p className="mt-2 text-ui text-fg-muted">Outra pessoa aprova</p>
                  )}
                </Cartao>
              ))}
            </CartoesNoCelular>

            {/* No casco padrão, com funil nas colunas (02/10). A lista vem
                inteira, então filtra no navegador. */}
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
                <table className="w-full min-w-[820px]">
                  <thead>
                    <tr>
                      <th className="py-2 pr-2 w-8"></th>
                      <th className="py-2 pr-3">
                        <FiltroDaColuna rotulo="Vencimento" chave="vencimento" tipo="data" />
                      </th>
                      <th className="py-2 pr-3">
                        <FiltroDaColuna rotulo="Fornecedor" chave="fornecedor" />
                      </th>
                      <th className="py-2 pr-3">
                        <FiltroDaColuna rotulo="Empresa" chave="empresa" />
                      </th>
                      <th className="py-2 pr-3">Valor</th>
                      <th className="py-2 pr-3">
                        <FiltroDaColuna rotulo="Teto" chave="teto" align="right" />
                      </th>
                      <th className="py-2"></th>
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
                          {c.descricao && <span className="block text-micro text-fg-muted truncate max-w-[240px]">{c.descricao}</span>}
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
                                acao={reprovar}
                              />
                            </div>
                          ) : (
                            <span className="text-ui text-fg-muted">Outra pessoa aprova</span>
                          )}
                        </td>
                      </LinhaFiltravel>
                    ))}
                  </tbody>
                </table>
              </TabelaNoDesktop>
            </TabelaFiltravel>
          </>
        )}
      </CascoDaTabela>
      {dialog}
    </div>
  );
}
