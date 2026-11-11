import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Selo } from "@/components/ui/Selo";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { FiltroDaEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { FormularioDoDp2 } from "@/components/dp2/Formulario";
import { Secao, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/dp2/Secao";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { canActOnSector, canManageSector, getAuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { lerEmpresaEmFoco, podeUsarOFoco } from "@/lib/empresas/focoServidor";
import { formatCpf, formatInstantDateTime } from "@/lib/format";
import { num } from "@/lib/dp2/formato";
import { colaboradoresDaCompetencia, listarRubricas, type TotaisDaCompetencia } from "@/lib/dp2/servidor";
import { PAPEIS_LANCAVEIS, ehPapel } from "@/lib/dp2/rubricas";
import { compararValores, type CampoComparado } from "@/lib/dp2/comparativo";
import { brl, nomeDaCompetencia, NOME_DA_SITUACAO, NOME_DO_TIPO_DE_COMPETENCIA, TOM_DA_SITUACAO } from "@/lib/dp2/tela";
import type { Encargos, ItemDoHolerite, Provisoes } from "@/lib/dp2/mensal";
import {
  calcularCompetenciaAction,
  fecharCompetenciaAction,
  importarComparativoAction,
  lancarEventoAction,
  reabrirCompetenciaAction,
  removerEventoAction,
} from "../../actions";

const n = (v: unknown) => Number(v ?? 0);
const NOME_DO_CAMPO: Record<CampoComparado, string> = { proventos: "Proventos", descontos: "Descontos", liquido: "Líquido", inss: "INSS", irrf: "IRRF", fgts: "FGTS" };

/**
 * Uma competência do DP 2 (11/11/2026): lançar os eventos do mês, calcular,
 * conferir (holerite com memória de cálculo e comparativo com a Domínio) e
 * fechar.
 */
export default async function CompetenciaDoDp2({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pessoa?: string }> }) {
  const { id } = await params;
  const { pessoa: pessoaAberta } = await searchParams;
  // A mesma tela abre as parcelas do 13º: vale o módulo da competência ou o do 13º.
  const modulo = (await podeNoModulo(await getAuthContext(), "dp2_competencia", "ver")) ? "dp2_competencia" : "dp2_decimo";
  const { ctx, setor } = await abrirTelaDoModulo(modulo);
  const prisma = getPrisma();
  const comp = await prisma.dp2Competencia.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { company: { select: { id: true, name: true, displayName: true } } },
  });
  if (!comp) notFound();
  const empresa = nomeExibicao(comp.company);
  const foco = (await podeUsarOFoco(ctx)) ? await lerEmpresaEmFoco(ctx) : null;
  const titulo = `${NOME_DO_TIPO_DE_COMPETENCIA[comp.tipo] ?? comp.tipo} · ${nomeDaCompetencia(comp.ano, comp.mes)}`;

  if (foco && !foco.grupo.includes(comp.companyId)) {
    return (
      <PageContainer>
        <PageHeader title={titulo} subtitle={empresa} />
        <Aviso tom="atencao">
          Esta competência é de {empresa}, e você está trabalhando em {foco.nome}. Troque a empresa na faixa acima para abrir esta folha.
        </Aviso>
      </PageContainer>
    );
  }

  const podeAgir = canActOnSector(ctx, setor);
  const podeGerir = canManageSector(ctx, setor);
  const fechada = comp.situacao === "FECHADA";
  const mensal = comp.tipo === "MENSAL";

  const [calculos, eventos, comparativos, rubricas, pessoas] = await Promise.all([
    prisma.dp2Calculo.findMany({ where: { tenantId: ctx.tenantId, competenciaId: id }, include: { person: { select: { id: true, name: true, cpf: true } } } }),
    prisma.dp2Evento.findMany({
      where: { tenantId: ctx.tenantId, competenciaId: id },
      include: { person: { select: { name: true } }, rubrica: { select: { codigo: true, nome: true, lancamento: true, papel: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.dp2Comparativo.findMany({ where: { tenantId: ctx.tenantId, competenciaId: id } }),
    listarRubricas(ctx.tenantId),
    colaboradoresDaCompetencia(ctx.tenantId, comp.companyId, comp.ano, comp.mes),
  ]);
  calculos.sort((a, b) => a.person.name.localeCompare(b.person.name, "pt-BR"));
  const totais = (comp.totais ?? null) as TotaisDaCompetencia | null;
  const semContrato = pessoas.filter((p) => !p.dp2Vinculo);
  const lancaveis = rubricas.filter((r) => r.ativa && (r.papel ? ehPapel(r.papel) && PAPEIS_LANCAVEIS.has(r.papel) : r.tipo !== "INFORMATIVA"));
  const comparativoDe = new Map(comparativos.map((c) => [c.personId, c]));
  const aberto = pessoaAberta ? calculos.find((c) => c.personId === pessoaAberta) : undefined;

  let divergentes = 0;
  const diferencaDe = new Map<string, ReturnType<typeof compararValores>>();
  for (const c of calculos) {
    const d = comparativoDe.get(c.personId);
    if (!d) continue;
    const r = compararValores(
      { proventos: n(c.proventos), descontos: n(c.descontos), liquido: n(c.liquido), inss: n(c.inss), irrf: n(c.irrf), fgts: n(c.fgts) },
      { proventos: d.proventos === null ? null : n(d.proventos), descontos: d.descontos === null ? null : n(d.descontos), liquido: d.liquido === null ? null : n(d.liquido), inss: d.inss === null ? null : n(d.inss), irrf: d.irrf === null ? null : n(d.irrf), fgts: d.fgts === null ? null : n(d.fgts) }
    );
    diferencaDe.set(c.personId, r);
    if (r.diverge) divergentes++;
  }

  const etapas = [
    { nome: "Abrir", feita: true },
    { nome: mensal ? "Lançar eventos" : "Conferir contratos", feita: eventos.length > 0 || !mensal || comp.situacao !== "ABERTA" },
    { nome: "Calcular", feita: comp.situacao !== "ABERTA" },
    { nome: "Conferir", feita: fechada },
    { nome: "Fechar", feita: fechada },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={titulo}
        subtitle={
          <>
            <Link href="/dp2/competencia" className="text-brand hover:underline">
              {empresa}
            </Link>
            {comp.calculadaEm && <> · calculada em {formatInstantDateTime(comp.calculadaEm)}</>}
          </>
        }
        meta={<Selo tom={TOM_DA_SITUACAO[comp.situacao] ?? "neutro"}>{NOME_DA_SITUACAO[comp.situacao] ?? comp.situacao}</Selo>}
      />
      <FiltroDaEmpresa foco={foco ? { ...foco, pedida: null } : null} />

      <ol className="flex flex-wrap gap-2 mb-5" aria-label="Etapas da competência">
        {etapas.map((e, i) => (
          <li key={e.nome} className={`text-fs-2 rounded-full px-3 py-1 border ${e.feita ? "border-transparent bg-success/10 text-success-fg" : "border-border text-fg-muted"}`}>
            {i + 1}. {e.nome}
          </li>
        ))}
      </ol>

      {totais && (
        <div className="mb-5">
          <FaixaDeTotais
            itens={[
              { rotulo: "Pessoas", valor: String(totais.pessoas), detalhe: totais.semVinculo ? `${totais.semVinculo} sem contrato no DP 2` : undefined },
              { rotulo: "Proventos", valor: brl(totais.proventos) },
              { rotulo: "Líquido", valor: brl(totais.liquido) },
              { rotulo: "INSS", valor: brl(totais.inss) },
              { rotulo: "IRRF", valor: brl(totais.irrf) },
              { rotulo: "FGTS", valor: brl(totais.fgts) },
              { rotulo: "Custo de encargos", valor: brl(totais.encargos), detalhe: "INSS patronal, RAT, terceiros e FGTS" },
              { rotulo: "Provisões", valor: brl(totais.provisoes), detalhe: "Férias, 1/3, 13º e encargos" },
            ]}
          />
        </div>
      )}

      {comp.situacao === "ABERTA" && calculos.length > 0 && (
        <Aviso tom="atencao" className="mb-5">
          Houve lançamento depois do último cálculo: calcule de novo antes de conferir.
        </Aviso>
      )}

      {podeAgir && (
        <div className="flex flex-wrap items-start gap-4 mb-6">
          {!fechada && (
            <FormularioDoDp2 acao={calcularCompetenciaAction} rotulo={calculos.length ? "Calcular de novo" : "Calcular a folha"} rotuloEnviando="Calculando…">
              <input type="hidden" name="competenciaId" value={comp.id} />
            </FormularioDoDp2>
          )}
          {comp.situacao === "CALCULADA" && (
            <FormularioDoDp2 acao={fecharCompetenciaAction} rotulo="Fechar competência" rotuloEnviando="Fechando…" variante="secondary">
              <input type="hidden" name="competenciaId" value={comp.id} />
            </FormularioDoDp2>
          )}
          {fechada && podeGerir && (
            <FormularioDoDp2 acao={reabrirCompetenciaAction} rotulo="Reabrir" rotuloEnviando="Reabrindo…" variante="secondary" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="competenciaId" value={comp.id} />
              <CampoForm label="Por que reabrir" htmlFor="motivo">
                <Input id="motivo" name="motivo" placeholder="Ex.: comissão lançada a menor" className="w-72" required />
              </CampoForm>
            </FormularioDoDp2>
          )}
        </div>
      )}

      <div className="flex flex-col gap-5">
        {semContrato.length > 0 && (
          <Aviso tom="info">
            {semContrato.length} colaborador(es) da empresa sem contrato no DP 2 ficam fora do cálculo:{" "}
            {semContrato.slice(0, 6).map((p, i) => (
              <span key={p.id}>
                {i > 0 && ", "}
                <Link className="text-brand hover:underline" href={`/dp2/colaboradores?pessoa=${p.id}`}>
                  {p.name}
                </Link>
              </span>
            ))}
            {semContrato.length > 6 && "…"}
          </Aviso>
        )}

        {mensal && (
          <Secao titulo="Eventos do mês" apoio="Horas extras, adicional noturno, faltas e atrasos em horas ou dias; comissões, adiantamentos e outros em valor. O motor calcula o resto (salário, DSR, INSS, IRRF, FGTS).">
            {podeAgir && !fechada && (
              <FormularioDoDp2 acao={lancarEventoAction} rotulo="Lançar" rotuloEnviando="Lançando…" className="mb-5">
                <input type="hidden" name="competenciaId" value={comp.id} />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.4fr_0.7fr_0.8fr_1.2fr]">
                  <CampoForm label="Colaborador" htmlFor="personId">
                    <Select id="personId" name="personId" required defaultValue="">
                      <option value="" disabled>
                        Escolha…
                      </option>
                      {pessoas
                        .filter((p) => p.dp2Vinculo)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Rubrica" htmlFor="rubricaId">
                    <Select id="rubricaId" name="rubricaId" required defaultValue="">
                      <option value="" disabled>
                        Escolha…
                      </option>
                      {lancaveis.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.codigo} · {r.nome}
                          {r.papel && r.lancamento !== "VALOR" ? ` (${r.lancamento === "HORAS" ? "horas" : "dias"})` : ""}
                        </option>
                      ))}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Horas ou dias" htmlFor="quantidade">
                    <Input id="quantidade" name="quantidade" inputMode="decimal" placeholder="10,5" />
                  </CampoForm>
                  <CampoForm label="Valor" htmlFor="valor">
                    <Input id="valor" name="valor" inputMode="decimal" prefix="R$" placeholder="0,00" />
                  </CampoForm>
                  <CampoForm label="Observação" htmlFor="observacao">
                    <Input id="observacao" name="observacao" maxLength={300} />
                  </CampoForm>
                </div>
              </FormularioDoDp2>
            )}
            {eventos.length === 0 ? (
              <p className="text-fs-3 text-fg-muted">Nenhum lançamento. Sem eventos, a folha sai só com salário e adicionais fixos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-fs-3">
                  <thead>
                    <tr>
                      <th className={TH}>Colaborador</th>
                      <th className={TH}>Rubrica</th>
                      <th className={TH_NUM}>Horas/dias</th>
                      <th className={TH_NUM}>Valor</th>
                      <th className={TH}>Observação</th>
                      <th className={TH} />
                    </tr>
                  </thead>
                  <tbody>
                    {eventos.map((e) => (
                      <tr key={e.id} className={TR}>
                        <td className={TD}>{e.person.name}</td>
                        <td className={TD}>
                          {e.rubrica.codigo} · {e.rubrica.nome}
                        </td>
                        <td className={TD_NUM}>{e.quantidade !== null ? num(n(e.quantidade)) : "—"}</td>
                        <td className={TD_NUM}>{e.valor !== null ? brl(n(e.valor)) : "—"}</td>
                        <td className={`${TD} text-fg-muted`}>{e.observacao ?? ""}</td>
                        <td className={`${TD} text-right`}>
                          {podeAgir && !fechada && (
                            <FormularioDoDp2 acao={removerEventoAction} rotulo="Retirar" rotuloEnviando="Retirando…" variante="ghost" tamanho="xs">
                              <input type="hidden" name="eventoId" value={e.id} />
                            </FormularioDoDp2>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>
        )}

        <Secao
          titulo="Resultado do cálculo"
          apoio={
            calculos.length === 0
              ? "Calcule a folha para ver o resultado de cada pessoa."
              : `Clique no nome para ver o holerite com a memória de cálculo.${comparativos.length ? ` ${divergentes} pessoa(s) diferem da Domínio em mais de 1 centavo.` : ""}`
          }
        >
          {calculos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-fs-3">
                <thead>
                  <tr>
                    <th className={TH}>Colaborador</th>
                    <th className={TH_NUM}>Proventos</th>
                    <th className={TH_NUM}>INSS</th>
                    <th className={TH_NUM}>IRRF</th>
                    <th className={TH_NUM}>Descontos</th>
                    <th className={TH_NUM}>Líquido</th>
                    <th className={TH_NUM}>FGTS</th>
                    <th className={TH}>Conferência</th>
                  </tr>
                </thead>
                <tbody>
                  {calculos.map((c) => {
                    const alertas = (c.alertas as string[]) ?? [];
                    const dif = diferencaDe.get(c.personId);
                    return (
                      <tr key={c.id} className={`${TR} ${c.personId === pessoaAberta ? "bg-surface-hover" : ""}`}>
                        <td className={TD}>
                          <Link href={`/dp2/competencia/${comp.id}?pessoa=${c.personId}#holerite`} scroll={false} className="text-brand hover:underline font-medium">
                            {c.person.name}
                          </Link>
                        </td>
                        <td className={TD_NUM}>{brl(n(c.proventos))}</td>
                        <td className={TD_NUM}>{brl(n(c.inss))}</td>
                        <td className={TD_NUM}>{brl(n(c.irrf))}</td>
                        <td className={TD_NUM}>{brl(n(c.descontos))}</td>
                        <td className={`${TD_NUM} font-medium`}>{brl(n(c.liquido))}</td>
                        <td className={TD_NUM}>{brl(n(c.fgts))}</td>
                        <td className={TD}>
                          <div className="flex flex-wrap gap-1">
                            {alertas.length > 0 && <Selo tom="atencao">{alertas.length} alerta(s)</Selo>}
                            {dif && (dif.diverge ? <Selo tom="perigo">difere da Domínio</Selo> : <Selo tom="sucesso">bate com a Domínio</Selo>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Secao>

        {aberto && (
          <div id="holerite">
            <Holerite
              nome={aberto.person.name}
              cpf={aberto.person.cpf}
              itens={(aberto.itens as unknown as ItemDoHolerite[]) ?? []}
              memoria={aberto.memoria as { inss?: string[]; irrf?: string[]; diasTrabalhados?: number }}
              encargos={aberto.encargos as unknown as Encargos}
              provisoes={aberto.provisoes as unknown as Provisoes}
              alertas={(aberto.alertas as string[]) ?? []}
              totais={{ proventos: n(aberto.proventos), descontos: n(aberto.descontos), liquido: n(aberto.liquido), baseInss: n(aberto.baseInss), baseIrrf: n(aberto.baseIrrf), baseFgts: n(aberto.baseFgts) }}
              diferencas={diferencaDe.get(aberto.personId)?.diferencas}
              fecharHref={`/dp2/competencia/${comp.id}`}
            />
          </div>
        )}

        <Secao
          titulo="Comparar com a Domínio"
          apoio="Enquanto o DP 2 roda em paralelo: cole, uma pessoa por linha, CPF; proventos; descontos; líquido; INSS; IRRF; FGTS (pode copiar direto do Excel). Campo vazio não é comparado."
        >
          {podeAgir ? (
            <FormularioDoDp2 acao={importarComparativoAction} rotulo="Comparar" rotuloEnviando="Lendo…" variante="secondary">
              <input type="hidden" name="competenciaId" value={comp.id} />
              <Textarea name="texto" rows={4} placeholder={"123.456.789-09; 3.243,89; 277,87; 2.966,02; 277,87; 0,00; 259,51"} aria-label="Valores da Domínio" />
            </FormularioDoDp2>
          ) : (
            <p className="text-fs-3 text-fg-muted">{comparativos.length} pessoa(s) com valores da Domínio.</p>
          )}
        </Secao>
      </div>
    </PageContainer>
  );
}

function Holerite({
  nome,
  cpf,
  itens,
  memoria,
  encargos,
  provisoes,
  alertas,
  totais,
  diferencas,
  fecharHref,
}: {
  nome: string;
  cpf: string | null;
  itens: ItemDoHolerite[];
  memoria: { inss?: string[]; irrf?: string[]; diasTrabalhados?: number };
  encargos: Encargos;
  provisoes: Provisoes;
  alertas: string[];
  totais: { proventos: number; descontos: number; liquido: number; baseInss: number; baseIrrf: number; baseFgts: number };
  diferencas?: Partial<Record<CampoComparado, number>>;
  fecharHref: string;
}) {
  const linhas = itens.filter((i) => i.tipo !== "INFORMATIVA");
  const informativas = itens.filter((i) => i.tipo === "INFORMATIVA");
  return (
    <Secao
      titulo={`Holerite de ${nome}`}
      apoio={`${cpf ? `CPF ${formatCpf(cpf)} · ` : ""}${memoria.diasTrabalhados ?? 30} dia(s) no mês`}
      acao={
        <Button href={fecharHref} variant="ghost" size="sm" scroll={false}>
          Fechar holerite
        </Button>
      }
    >
      {alertas.length > 0 && (
        <Aviso tom="atencao" className="mb-4">
          <ul className="list-disc pl-4">
            {alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-fs-3">
          <thead>
            <tr>
              <th className={TH}>Cód.</th>
              <th className={TH}>Rubrica</th>
              <th className={TH}>Ref.</th>
              <th className={TH_NUM}>Proventos</th>
              <th className={TH_NUM}>Descontos</th>
              <th className={TH}>Como foi calculado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((i, k) => (
              <tr key={`${i.codigo}-${k}`} className={TR}>
                <td className={`${TD} text-fg-muted tabular-nums`}>{i.codigo}</td>
                <td className={TD}>{i.nome}</td>
                <td className={`${TD} whitespace-nowrap`}>{i.referencia}</td>
                <td className={TD_NUM}>{i.tipo === "PROVENTO" ? brl(i.valor) : ""}</td>
                <td className={TD_NUM}>{i.tipo === "DESCONTO" ? brl(i.valor) : ""}</td>
                <td className={`${TD} text-fs-2 text-fg-muted max-w-[42ch]`}>{i.memoria}</td>
              </tr>
            ))}
            <tr className={`${TR} font-semibold`}>
              <td className={TD} />
              <td className={TD}>Totais</td>
              <td className={TD} />
              <td className={TD_NUM}>{brl(totais.proventos)}</td>
              <td className={TD_NUM}>{brl(totais.descontos)}</td>
              <td className={TD}>Líquido {brl(totais.liquido)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mt-5 text-fs-2">
        <div>
          <h3 className="font-semibold text-fg mb-1">Bases</h3>
          <p>INSS {brl(totais.baseInss)}</p>
          <p>IRRF {brl(totais.baseIrrf)}</p>
          <p>FGTS {brl(totais.baseFgts)}</p>
          {informativas.map((i) => (
            <p key={i.codigo}>
              {i.nome}: {brl(i.valor)}
            </p>
          ))}
        </div>
        <div>
          <h3 className="font-semibold text-fg mb-1">INSS</h3>
          <ul className="text-fg-muted space-y-0.5">{(memoria.inss ?? []).map((l) => <li key={l}>{l}</li>)}</ul>
          <h3 className="font-semibold text-fg mt-3 mb-1">IRRF</h3>
          <ul className="text-fg-muted space-y-0.5">{(memoria.irrf ?? []).map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
        <div>
          <h3 className="font-semibold text-fg mb-1">Custo para a empresa</h3>
          <ul className="text-fg-muted space-y-0.5">{encargos.memoria.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-1">Total {brl(encargos.total)}</p>
          <h3 className="font-semibold text-fg mt-3 mb-1">Provisões do mês</h3>
          <ul className="text-fg-muted space-y-0.5">{provisoes.memoria.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-1">Total {brl(provisoes.total)}</p>
        </div>
      </div>

      {diferencas && Object.keys(diferencas).length > 0 && (
        <div className="mt-5">
          <h3 className="font-semibold text-fg text-fs-2 mb-1">Diferença para a Domínio (DP 2 − Domínio)</h3>
          <p className="text-fs-2">
            {(Object.entries(diferencas) as [CampoComparado, number][]).map(([campo, d], i) => (
              <span key={campo} className={Math.abs(d) > 0.01 ? "text-danger font-medium" : "text-fg-muted"}>
                {i > 0 && " · "}
                {NOME_DO_CAMPO[campo]} {d > 0 ? "+" : ""}
                {brl(d)}
              </span>
            ))}
          </p>
        </div>
      )}
    </Secao>
  );
}
