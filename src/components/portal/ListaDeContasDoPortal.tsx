"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FileDown, SearchX, X } from "lucide-react";
import { SeloDaAprovacao } from "@/components/aprovacoes/HistoricoDaAprovacao";
import type { VarianteDoBadge } from "@/components/ui/Badge";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { FilterButton, FilterButtonSection } from "@/components/ui/FilterButton";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import type { ContaDoPortal } from "@/lib/financeiro/consultas";
import type { SituacaoDaConta } from "@/lib/financeiro/contas";
import { formatInstantDate, formatarCompetencia } from "@/lib/format";
import { moeda } from "@/lib/financeiro/formato";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { SeletorDeEmpresaQueNavega } from "@/components/shared/SeletorDeEmpresaQueNavega";
import type { EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import {
  PARAMETRO_DA_SITUACAO,
  PARAMETRO_DO_VENCIMENTO,
  enderecoComFiltro,
  filtrosAtivos,
  lerFiltro,
  mesesDeVencimento,
  opcoesDeSituacao,
  passaNoFiltro,
  type SituacaoDoFiltro,
} from "./filtroDasContas";

// Os nomes da equipe (`ContasTable`), para o cliente e o escritório falarem
// da mesma conta com a mesma palavra (07/10/2026): era "Liquidada", ao lado do
// cartão "Pago"/"Recebido" da própria tela. A conta a receber é "Recebida".
// Cancelada no selo neutro: no azul do `info`, era a mesma cor de "A vencer"
// na mesma coluna. O mapa é daqui, e não importado de `ContasTable`, que traz
// as ações de baixa — esta tela é só leitura por construção.
const SITUACAO: Record<SituacaoDaConta, { rotulo: string; variante: VarianteDoBadge }> = {
  VENCIDA: { rotulo: "Vencida", variante: "danger" },
  VENCE_HOJE: { rotulo: "Vence hoje", variante: "warning" },
  A_VENCER: { rotulo: "A vencer", variante: "info" },
  PAGA: { rotulo: "Paga", variante: "success" },
  CANCELADA: { rotulo: "Cancelada", variante: "neutral" },
};

export type TotaisDaTela = {
  emAberto: number;
  vencido: number;
  venceHoje: number;
  pago: number;
  /** "desde Out/26" — já no texto, montado no servidor. */
  pagoDesde?: string;
};

/**
 * A lista de Contas a pagar/receber do portal, com o recorte (P02, 11/11/2026).
 *
 * No celular eram até 500 cartões sem filtro nem busca: o funil por coluna só
 * existe na tabela, que some abaixo de `md`. Agora a barra do casco tem a
 * busca (fornecedor ou cliente, descrição, empresa, categoria) e o botão
 * Filtros (situação e mês do vencimento), e os dois valem para os cartões e
 * para a tabela. O funil das colunas continua na tabela, refinando o que o
 * recorte deixou.
 *
 * O recorte do painel mora na URL (`?situacao=`, `?vencimento=`), trocado por
 * `history.pushState`: a lista já está toda no navegador, então filtra na hora,
 * sem ida ao servidor, e o voltar do celular desfaz. Os cartões do topo são
 * atalhos do mesmo recorte — "Vencido" mostra as vencidas, e tocar de novo tira.
 * A busca fica só na tela: é digitação, não endereço.
 *
 * A empresa (11/11/2026) é o seletor único do portal, logo abaixo do cabeçalho,
 * como no Fluxo de caixa e na Cobrança. Ela, sim, vai ao servidor — os totais
 * do topo são somados no banco — e leva junto a situação e o mês do recorte.
 */
export function ListaDeContasDoPortal({
  contas,
  totais,
  aPagar,
  empresas = [],
  empresaId = null,
  variasEmpresas,
  linkDaAprovacao,
  limitada,
  limite,
  vazio,
}: {
  contas: ContaDoPortal[];
  totais: TotaisDaTela;
  aPagar: boolean;
  /** As empresas do cliente; com mais de uma, entra o seletor de empresa. */
  empresas?: (EmpresaParaEscolher & { nome: string })[];
  /** A empresa que a lista mostra (`empresaDaTela`); `null` = todas. */
  empresaId?: string | null;
  variasEmpresas: boolean;
  linkDaAprovacao: boolean;
  /** A consulta parou no teto: há mais contas do que a lista mostra. */
  limitada: boolean;
  limite: number;
  vazio: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const filtro = useMemo(() => lerFiltro(params), [params]);
  const [busca, setBusca] = useState("");

  const rotuloDa = (s: SituacaoDaConta) => (s === "PAGA" && !aPagar ? "Recebida" : SITUACAO[s].rotulo);
  const quitadaEm = aPagar ? "pago em" : "recebido em";
  const tela = aPagar ? "pagar" : "receber";
  const contraparte = aPagar ? "Fornecedor" : "Cliente";

  const visiveis = useMemo(() => contas.filter((c) => passaNoFiltro(c, filtro, busca)), [contas, filtro, busca]);
  const meses = useMemo(() => mesesDeVencimento(contas), [contas]);
  const recortada = filtrosAtivos(filtro) > 0 || busca.trim() !== "";

  function trocar(mudancas: Parameters<typeof enderecoComFiltro>[2]) {
    window.history.pushState(null, "", enderecoComFiltro(pathname, params, mudancas));
  }
  function limparTudo() {
    setBusca("");
    trocar({ [PARAMETRO_DA_SITUACAO]: null, [PARAMETRO_DO_VENCIMENTO]: null });
  }

  // O cartão do topo é o atalho da situação: liga o recorte, e o cartão já
  // ligado desliga.
  const atalho = (s: SituacaoDoFiltro) => ({
    href: enderecoComFiltro(pathname, params, { [PARAMETRO_DA_SITUACAO]: filtro.situacao === s ? null : s }),
    ativo: filtro.situacao === s,
  });

  const opcoes = opcoesDeSituacao(aPagar);
  const rotuloDaSituacao = opcoes.find((o) => o.value === filtro.situacao)?.label;

  const etiqueta = (rotulo: string, valor: string, tirar: () => void) => (
    <button
      type="button"
      onClick={tirar}
      aria-label={`Tirar o filtro ${rotulo.toLowerCase()}: ${valor}`}
      className="inline-flex items-center gap-1 h-8 max-md:h-11 pl-2.5 pr-1.5 rounded-full border border-brand/30 bg-brand-subtle text-fs-2 text-fg hover:border-brand/60 transition-colors"
    >
      <span className="text-fg-muted">{rotulo}:</span>
      <span className="font-medium max-w-[160px] truncate">{valor}</span>
      <X size={14} aria-hidden className="text-fg-muted" />
    </button>
  );

  const filtros = (
    <div className="flex flex-wrap items-center gap-2">
      <FilterButton activeCount={filtrosAtivos(filtro)} width={280}>
        {({ close }) => (
          <div className="space-y-3">
            <FilterButtonSection label="Situação">
              <Select
                aria-label="Situação"
                value={filtro.situacao ?? ""}
                onChange={(e) => trocar({ [PARAMETRO_DA_SITUACAO]: e.target.value || null })}
              >
                <option value="">Todas</option>
                {opcoes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </FilterButtonSection>
            <FilterButtonSection label="Mês do vencimento">
              <Select
                aria-label="Mês do vencimento"
                value={filtro.vencimento ?? ""}
                onChange={(e) => trocar({ [PARAMETRO_DO_VENCIMENTO]: e.target.value || null })}
              >
                <option value="">Todos os meses</option>
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {formatarCompetencia(m)}
                  </option>
                ))}
              </Select>
            </FilterButtonSection>
            {filtrosAtivos(filtro) > 0 && (
              <div className="flex justify-end border-t border-border pt-2">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    close();
                    trocar({ [PARAMETRO_DA_SITUACAO]: null, [PARAMETRO_DO_VENCIMENTO]: null });
                  }}
                >
                  Limpar filtros
                </Button>
              </div>
            )}
          </div>
        )}
      </FilterButton>
      {rotuloDaSituacao && etiqueta("Situação", rotuloDaSituacao, () => trocar({ [PARAMETRO_DA_SITUACAO]: null }))}
      {filtro.vencimento && etiqueta("Vencimento", formatarCompetencia(filtro.vencimento), () => trocar({ [PARAMETRO_DO_VENCIMENTO]: null }))}
    </div>
  );

  return (
    <>
      {empresas.length > 1 && (
        <SeletorDeEmpresaQueNavega
          acao={pathname}
          empresas={empresas}
          empresaId={empresaId}
          permitirTodas
          manter={{ [PARAMETRO_DA_SITUACAO]: filtro.situacao, [PARAMETRO_DO_VENCIMENTO]: filtro.vencimento }}
        />
      )}

      {/* O tom de cada cartão é o da tela da equipe (07/10): vencido e o que
          vence hoje só ganham cor acima de zero; o pago é neutro e diz desde
          quando soma. Desde 11/11 são atalhos do recorte da lista. */}
      <FaixaDeTotais
        itens={[
          { rotulo: "Em aberto", valor: moeda(totais.emAberto), ...atalho("aberto") },
          { rotulo: "Vencido", valor: moeda(totais.vencido), tom: totais.vencido > 0 ? "text-danger" : undefined, ...atalho("vencida") },
          { rotulo: "Vence hoje", valor: moeda(totais.venceHoje), tom: totais.venceHoje > 0 ? "text-warning" : undefined, ...atalho("hoje") },
          { rotulo: aPagar ? "Pago" : "Recebido", valor: moeda(totais.pago), tom: "text-fg-muted", detalhe: totais.pagoDesde, ...atalho("paga") },
        ]}
      />

      {/* No casco da tabela (07/10/2026), como Pendências do portal e a tela da
          equipe: a contagem na barra e a lista vazia dentro dele. Com recorte,
          a contagem é a do recorte, com o valor somado. */}
      <CascoDaTabela
        contagem={contarItens(visiveis.length, "conta", "contas", limitada && !recortada)}
        total={recortada && visiveis.length > 0 ? moeda(visiveis.reduce((s, c) => s + c.valorCentavos, 0)) : undefined}
        busca={
          contas.length > 0 ? (
            <div className="w-full sm:w-64">
              <CampoDeBusca
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={`Buscar ${contraparte.toLowerCase()} ou descrição`}
                aria-label={`Buscar ${contraparte.toLowerCase()} ou descrição`}
              />
            </div>
          ) : undefined
        }
        filtros={contas.length > 0 ? filtros : undefined}
      >
        {contas.length === 0 ? (
          vazio
        ) : visiveis.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title="Nenhuma conta neste recorte"
            description="Tire um filtro ou mude a busca para ver as outras contas."
            action={
              <Button variant="secondary" className="max-md:h-11" onClick={limparTudo}>
                Limpar filtros e busca
              </Button>
            }
          />
        ) : (
          <>
            {/* Abaixo de md, cartões. O portal é a tela que o cliente abre no
                celular — a tabela de 760px obrigava a rolar de lado para chegar ao
                valor, que é o que ele veio ver. */}
            <CartoesNoCelular>
              {visiveis.map((c) => (
                <Cartao key={c.id}>
                  <TopoDoCartao nome={c.contraparteNome} valor={moeda(c.valorCentavos)} />
                  {c.descricao && <InfoDoCartao className="break-words">{c.descricao}</InfoDoCartao>}
                  <InfoDoCartao className="mt-1 tabular-nums">
                    vence {formatInstantDate(c.vencimento)}
                    {c.pagoEm && ` · ${quitadaEm} ${formatInstantDate(c.pagoEm)}`}
                  </InfoDoCartao>
                  {(variasEmpresas || c.categoriaNome) && (
                    <InfoDoCartao className="break-words">
                      {[variasEmpresas ? c.empresaNome : null, c.categoriaNome].filter(Boolean).join(" · ")}
                    </InfoDoCartao>
                  )}
                  <PeDoCartao>
                    <Selo tom={tomDaVariante(SITUACAO[c.situacao].variante)}>{rotuloDa(c.situacao)}</Selo>
                    <LinksDosRecibos baixas={c.baixas} tela={tela} />
                    {c.aprovacao &&
                      (c.aprovacao === "AGUARDANDO" && linkDaAprovacao ? (
                        <Link href="/portal/aprovacoes" className="inline-flex" title="Abrir as aprovações">
                          <SeloDaAprovacao status={c.aprovacao} />
                        </Link>
                      ) : (
                        <SeloDaAprovacao status={c.aprovacao} />
                      ))}
                  </PeDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>

            {/* Funil nas colunas (02/10), como na tela da equipe: refina o que
                o recorte da barra deixou. A empresa entra no funil da
                contraparte só quando aparece na célula. Recomeça na troca
                de empresa: o funil guardado era das contas da anterior. */}
            <TabelaFiltravel
              key={empresaId ?? "todas"}
              linhas={visiveis.map((c) => ({
                id: c.id,
                valores: {
                  vencimento: c.vencimentoKey,
                  contraparte: c.contraparteNome,
                  empresa: c.empresaNome,
                  categoria: c.categoriaNome ?? "",
                  situacao: rotuloDa(c.situacao),
                },
              }))}
            >
              <TabelaNoDesktop padrao>
                <table className="w-full min-w-[720px] text-ui">
                  <thead>
                    <tr>
                      <th className="py-2 pr-3">
                        <FiltroDaColuna rotulo="Vencimento" chave="vencimento" tipo="data" />
                      </th>
                      <th className="py-2 pr-3">
                        <FiltroDaColuna
                          rotulo={contraparte}
                          campos={[{ chave: "contraparte", rotulo: contraparte }, ...(variasEmpresas ? [{ chave: "empresa", rotulo: "Empresa" }] : [])]}
                        />
                      </th>
                      <th className="py-2 pr-3">
                        <FiltroDaColuna rotulo="Categoria" chave="categoria" />
                      </th>
                      <th className="py-2 pr-3">Valor</th>
                      <th className="py-2">
                        <FiltroDaColuna rotulo="Situação" chave="situacao" align="right" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((c) => (
                      <LinhaFiltravel key={c.id} id={c.id} className="border-b border-border-soft">
                        <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">
                          {formatInstantDate(c.vencimento)}
                          {c.pagoEm && (
                            <span className="block text-micro text-fg-muted">
                              {quitadaEm} {formatInstantDate(c.pagoEm)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="font-medium">{c.contraparteNome}</span>
                          {c.descricao && <span className="block text-micro text-fg-muted truncate max-w-[240px]">{c.descricao}</span>}
                          {variasEmpresas && <span className="block text-micro text-fg-muted truncate max-w-[240px]">{c.empresaNome}</span>}
                        </td>
                        <td className="py-2.5 pr-3 text-fg-secondary">{c.categoriaNome ?? "—"}</td>
                        <td className="py-2.5 pr-3 tabular-nums font-medium">{moeda(c.valorCentavos)}</td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Selo tom={tomDaVariante(SITUACAO[c.situacao].variante)}>{rotuloDa(c.situacao)}</Selo>
                            <LinksDosRecibos baixas={c.baixas} tela={tela} />
                            {/* O mesmo selo que a equipe vê: "vencida" sem ele parece descuido do
                                escritório, quando a conta está esperando a aprovação do próprio cliente. */}
                            {c.aprovacao &&
                              (c.aprovacao === "AGUARDANDO" && linkDaAprovacao ? (
                                <Link href="/portal/aprovacoes" className="inline-flex" title="Abrir as aprovações">
                                  <SeloDaAprovacao status={c.aprovacao} />
                                </Link>
                              ) : (
                                <SeloDaAprovacao status={c.aprovacao} />
                              ))}
                          </div>
                        </td>
                      </LinhaFiltravel>
                    ))}
                  </tbody>
                </table>
              </TabelaNoDesktop>
            </TabelaFiltravel>

            {/* Filho direto do casco: no computador vira o pé do cartão. */}
            {limitada && (
              <p className="text-helper text-fg-muted mt-3">
                Mostrando as {limite} contas de vencimento mais recente. Os totais do topo somam todas.
              </p>
            )}
          </>
        )}
      </CascoDaTabela>
    </>
  );
}

/**
 * O recibo de cada baixa da conta (22/10/2026): o mesmo PDF que a equipe tira
 * na janela da baixa, sem a observação interna. Com mais de uma baixa
 * (pagamento em partes), um recibo por baixa, numerados pela ordem.
 *
 * Botão secundário com o ícone de baixar (P32, 11/11/2026): era um link azul de
 * 11px, difícil de ver e de acertar com o dedo. No celular, 44px de altura.
 */
function LinksDosRecibos({ baixas, tela }: { baixas: ContaDoPortal["baixas"]; tela: "pagar" | "receber" }) {
  if (baixas.length === 0) return null;
  return (
    <>
      {baixas.map((b, i) => (
        <Button
          key={b.id}
          href={`/portal/${tela}/recibos/${b.id}`}
          download
          size="xs"
          variant="secondary"
          className="max-md:h-11 max-md:px-3.5"
          data-dica={`Baixar o recibo de ${moeda(b.caixaCentavos)} de ${formatInstantDate(b.pagoEm)} em PDF`}
        >
          <FileDown size={14} aria-hidden /> {baixas.length > 1 ? `Recibo ${i + 1}` : "Recibo"}
        </Button>
      ))}
    </>
  );
}
