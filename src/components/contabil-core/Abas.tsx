import Link from "next/link";
import { Selo } from "@/components/ui/Selo";
import { Aviso } from "@/components/ui/Aviso";
import { formatCalendarDate, formatCnpj, formatCpf, formatInstantDateTime } from "@/lib/format";
import { listarAgencias, listarContas, listarContrapartes, listarRegras } from "@/lib/contabil-core/servidor/cadastros";
import { listarImportacoes } from "@/lib/contabil-core/servidor/importacao";
import { listarPendencias, PENDENCIAS_POR_PAGINA } from "@/lib/contabil-core/servidor/neo";
import { filaAgrupada } from "@/lib/contabil-core/servidor/neoAvancado";
import { texto as textoDec } from "@/lib/contabil-core/motor/decimal";
import { listarExtrato, listarRegistros, POR_PAGINA, ultimoMesComLancamento } from "@/lib/contabil-core/servidor/consultas";
import { moeda, moedaComSinal, ROTULO_DO_TIPO_DE_CONTA, rotuloDaAgencia, rotuloDaConta } from "@/lib/contabil-core/tela";
import { AlternarAgencia, AlternarIaParaDocumentos, AlternarRegra, CancelarClassificacao, DesfazerImportacao, ExcluirConta } from "./Botoes";
import { CorrigirContaDoRazao } from "./CorrigirContaDoRazao";
import { EnvioDeExtrato } from "./EnvioDeExtrato";
import { ImportarCadastro } from "./ImportarCadastro";
import { Exportar, ExportarExtrato } from "./Exportar";
import { Conciliacao } from "./Conciliacao";
import { ConciliacaoFinanceiro } from "./ConciliacaoFinanceiro";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Filtros } from "./Filtros";
import { FormularioDaAgencia, FormularioDaConta, FormularioDaContraparte, FormularioDaRegra } from "./Formularios";
import { FilaDoNeo, ProcessarNeo } from "./Neo";
import { Compor, Reclassificar } from "./Lancamento";
import { Notas } from "./Notas";
import { Comprovantes } from "./Comprovantes";
import { Cartoes } from "./Cartoes";
import { iaLiberadaParaDocumentos } from "@/lib/contabil-core/servidor/notas";
import { carteiraDoEscritorio, consultarDivergencias, estatisticasDaEmpresa } from "@/lib/contabil-core/servidor/painel";
import { ConflitosQualidade } from "./ConflitosQualidade";
import { CarteiraDoEscritorio, NumerosDaEmpresa } from "./Painel";
import { empresaDoTenant } from "@/lib/contabil-core/servidor/base";
import { relatorioDaEmpresa } from "@/lib/contabil-core/servidor/relatorios";
import { RELATORIOS, rotuloDoPeriodo, TITULO_DO_RELATORIO, type QualRelatorio } from "@/lib/contabil-core/relatorios/planilha";
import type { Balancete, Dre, LivroCaixa } from "@/lib/contabil-core/relatorios/relatorios";
import { BalanceteDaEmpresa, DreDaEmpresa, LivroCaixaDaEmpresa } from "./Relatorios";
import { ImprimirRelatorio } from "./ImprimirRelatorio";

// As abas do Contábil Core (Fase 2, 09/11/2026). Componentes de servidor: leem pelo serviço (que
// confere tenant e empresa) e passam para o navegador só o que a tela mostra.

export type ContextoDaAba = {
  tenantId: string;
  empresaId: string;
  podeAgir: boolean;
  podeGerir: boolean;
  mes: string | null;
  agenciaId: string | null;
  busca: string | null;
  pagina: number;
  status: string | null;
  mesAtual: string;
  /** Dentro da aba Conciliação: "financeiro" abre a conferência do financeiro (Fase B4); na aba NEO, "conflitos" abre "Conflitos e qualidade" (Fase D1). */
  vista: string | null;
  /** O período dos relatórios (Fase D2), em datas "AAAA-MM-DD" já conferidas; nula é "sem limite". */
  de: string | null;
  ate: string | null;
};

const TH = "py-2 pr-3 font-medium";
const CABECALHO = "text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left";
const LINHA = "border-b border-border last:border-0 align-top";

async function opcoes(c: ContextoDaAba) {
  const [contas, agencias] = await Promise.all([listarContas(c.tenantId, c.empresaId), listarAgencias(c.tenantId, c.empresaId)]);
  return {
    contas,
    agencias,
    opcoesDeConta: contas.filter((x) => x.tipoSa === "A").map((x) => ({ value: x.id, label: rotuloDaConta(x) })),
    todasAsContas: contas.map((x) => ({ value: x.id, label: rotuloDaConta(x) })),
    opcoesDeAgencia: agencias.filter((a) => a.ativa).map((a) => ({ value: a.id, label: rotuloDaAgencia(a) })),
  };
}

/**
 * `pagina` é a que o servidor mostrou (a pedida, ou a última quando a pedida passou do fim); sem ela, a da
 * URL. `porPagina` muda na fila do NEO (melhoria-571).
 */
function Paginacao({ c, aba, total, pagina = c.pagina, porPagina = POR_PAGINA }: { c: ContextoDaAba; aba: string; total: number; pagina?: number; porPagina?: number }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas === 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams({ empresa: c.empresaId, aba, pagina: String(p) });
    if (c.mes) q.set("mes", c.mes);
    if (c.agenciaId) q.set("agencia", c.agenciaId);
    if (c.busca) q.set("busca", c.busca);
    if (c.status) q.set("status", c.status);
    return `/contabil-core?${q}`;
  };
  return (
    <nav className="mt-3 flex items-center gap-3 text-sm" aria-label="Páginas">
      {pagina > 1 && <Link href={href(pagina - 1)} className="text-brand hover:underline">Anterior</Link>}
      <span className="text-fg-muted">
        Página {pagina} de {paginas} · {total} itens
      </span>
      {pagina < paginas && <Link href={href(pagina + 1)} className="text-brand hover:underline">Próxima</Link>}
    </nav>
  );
}

// ─── Painel ───────────────────────────────────────────────────────────────

// Bloco D, Fase D1 (26/11/2026): o `Dashboard` do original. A carteira do escritório na competência (todas as
// empresas do Contábil Core, como o seletor de empresa) e os números da empresa aberta. Só lê: aparece para quem
// vê o módulo (o `stats.read` do original).
export async function AbaPainel({ c }: { c: ContextoDaAba }) {
  const competencia = c.mes ?? c.mesAtual;
  const [carteira, estatisticas] = await Promise.all([carteiraDoEscritorio(c.tenantId, competencia), estatisticasDaEmpresa(c.tenantId, c.empresaId)]);
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-base font-semibold">Carteira do escritório</h2>
        <p className="mb-2 text-sm text-fg-muted">O trabalho da competência em cada empresa, com as de mais pendências primeiro.</p>
        <Filtros empresaId={c.empresaId} aba="painel" mes={competencia} />
        <CarteiraDoEscritorio mes={competencia} itens={carteira.itens} atual={c.empresaId} />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold">Esta empresa</h2>
        {estatisticas.ok ? <NumerosDaEmpresa e={estatisticas.valor} /> : <Aviso tom="atencao">{estatisticas.erro}</Aviso>}
      </section>
    </div>
  );
}

// ─── Importações ──────────────────────────────────────────────────────────

export async function AbaImportacoes({ c }: { c: ContextoDaAba }) {
  const [{ opcoesDeAgencia }, lotes] = await Promise.all([opcoes(c), listarImportacoes(c.tenantId, c.empresaId)]);
  return (
    <div className="flex flex-col gap-4">
      {c.podeAgir &&
        (opcoesDeAgencia.length ? (
          <EnvioDeExtrato empresaId={c.empresaId} agencias={opcoesDeAgencia} />
        ) : (
          <Aviso tom="atencao">Cadastre uma conta bancária em Configurações antes de importar extratos.</Aviso>
        ))}
      {lotes.length === 0 ? (
        <p className="text-sm text-fg-muted">Nenhum extrato importado ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className={CABECALHO}>
                <th className={TH}>Arquivo</th>
                <th className={TH}>Conta</th>
                <th className={TH}>Enviado em</th>
                <th className={`${TH} text-right`}>Importadas</th>
                <th className={`${TH} text-right`}>Duplicadas</th>
                <th className={`${TH} text-right`}>Recusadas</th>
                <th className={TH}>Situação</th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => (
                <tr key={l.id} className={LINHA}>
                  <td className="py-2 pr-3">
                    {l.nomeArquivo}
                    {l.alertaSaldo && <span className="mt-1 block text-micro text-warning-fg">{l.alertaSaldo}</span>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{rotuloDaAgencia(l.agencia)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatInstantDateTime(l.createdAt)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.importadas}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.duplicadas}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.rejeitadas}</td>
                  <td className="py-2">
                    {l.canceladaEm ? (
                      <span className="flex flex-col">
                        <Selo tom="neutro">Desfeita</Selo>
                        <span className="text-micro text-fg-muted">{l.motivoCancelamento}</span>
                      </span>
                    ) : l._count.transacoes === 0 ? (
                      <Selo tom="neutro">Sem transações</Selo>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Selo tom="sucesso">{l._count.transacoes} no sistema</Selo>
                        {c.podeGerir && <DesfazerImportacao empresaId={c.empresaId} importacaoId={l.id} nome={l.nomeArquivo} />}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Extrato ──────────────────────────────────────────────────────────────

const ROTULO_STATUS: Record<string, { texto: string; tom: "neutro" | "sucesso" | "atencao" | "perigo" }> = {
  pendente: { texto: "Pendente", tom: "atencao" },
  processada: { texto: "Classificada", tom: "sucesso" },
  erro: { texto: "Erro", tom: "perigo" },
};

export async function AbaExtrato({ c }: { c: ContextoDaAba }) {
  const [{ opcoesDeAgencia, opcoesDeConta }, { itens, total }] = await Promise.all([
    opcoes(c),
    listarExtrato(c.tenantId, c.empresaId, { agenciaId: c.agenciaId, mes: c.mes, busca: c.busca, status: c.status, pagina: c.pagina }),
  ]);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Filtros
          empresaId={c.empresaId}
          aba="extrato"
          mes={c.mes}
          agenciaId={c.agenciaId}
          agencias={opcoesDeAgencia}
          busca={c.busca}
          status={c.status}
        />
        {/* Fase D1: o arquivo traz as MESMAS linhas da tela (os filtros vão junto), sem a paginação. */}
        {c.podeAgir && total > 0 && (
          <ExportarExtrato empresaId={c.empresaId} mes={c.mes} agenciaId={c.agenciaId} busca={c.busca} status={c.status} />
        )}
      </div>
      {itens.length === 0 ? (
        <p className="text-sm text-fg-muted">Nenhuma transação nesta seleção.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className={CABECALHO}>
                <th className={TH}>Data</th>
                <th className={TH}>Conta</th>
                <th className={TH}>Histórico</th>
                <th className={`${TH} text-right`}>Valor</th>
                <th className={TH}>Situação</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((t) => (
                <tr key={t.id} className={LINHA}>
                  <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{formatCalendarDate(t.data)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{rotuloDaAgencia(t.agencia)}</td>
                  <td className="py-2 pr-3">{t.historico}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums whitespace-nowrap ${t.dc === "D" ? "text-danger" : "text-success-fg"}`}>{moedaComSinal(t.valor, t.dc)}</td>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <Selo tom={ROTULO_STATUS[t.status]?.tom ?? "neutro"}>{ROTULO_STATUS[t.status]?.texto ?? t.status}</Selo>
                      {t.status === "processada" && c.podeAgir && (
                        <>
                          <Reclassificar empresaId={c.empresaId} transacaoId={t.id} contas={opcoesDeConta} />
                          <Compor empresaId={c.empresaId} transacaoId={t.id} contas={opcoesDeConta} />
                          <CancelarClassificacao empresaId={c.empresaId} transacaoId={t.id} />
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao c={c} aba="extrato" total={total} />
    </div>
  );
}

// ─── NEO ──────────────────────────────────────────────────────────────────

export async function AbaNeo({ c }: { c: ContextoDaAba }) {
  // "Conflitos e qualidade" (Fase D1) era a terceira aba da página Classificação do original; aqui é a segunda
  // vista da aba NEO, porque mede o que o NEO decidiu (a conta da regra × a da contraparte). Na URL, para voltar.
  const conflitos = c.vista === "conflitos";
  const href = (vista: string | null) => `/contabil-core?${new URLSearchParams({ empresa: c.empresaId, aba: "neo", ...(vista ? { vista } : {}) })}`;
  const vistas = (
    <SegmentedControl
      label="O que ver no NEO"
      tocavel
      active={conflitos ? "conflitos" : "pendencias"}
      items={[
        { key: "pendencias", label: "Pendências", href: href(null) },
        { key: "conflitos", label: "Conflitos e qualidade", href: href("conflitos") },
      ]}
    />
  );
  if (conflitos) {
    const [{ opcoesDeAgencia }, divergencias] = await Promise.all([opcoes(c), consultarDivergencias(c.tenantId, c.empresaId, { mes: c.mes, agenciaId: c.agenciaId })]);
    return (
      <div className="flex flex-col gap-4">
        {vistas}
        <div>
          <Filtros empresaId={c.empresaId} aba="neo" vista="conflitos" mes={c.mes} agenciaId={c.agenciaId} agencias={opcoesDeAgencia} />
          {divergencias.ok ? <ConflitosQualidade d={divergencias.valor} /> : <Aviso tom="atencao">{divergencias.erro}</Aviso>}
        </div>
      </div>
    );
  }
  return <PendenciasDoNeo c={c} vistas={vistas} />;
}

async function PendenciasDoNeo({ c, vistas }: { c: ContextoDaAba; vistas: React.ReactNode }) {
  const [{ opcoesDeAgencia, opcoesDeConta }, { itens: pendencias, total, pagina }, fila] = await Promise.all([
    opcoes(c),
    listarPendencias(c.tenantId, c.empresaId, { agenciaId: c.agenciaId, mes: c.mes, busca: c.busca, pagina: c.pagina }),
    filaAgrupada(c.tenantId, c.empresaId, { agenciaId: c.agenciaId, mes: c.mes }),
  ]);
  // Os grupos marcam só o que está na tela (as pendências da página aberta).
  const naTela = new Set(pendencias.map((p) => p.id));
  return (
    <div className="flex flex-col gap-4">
      {vistas}
      <Filtros empresaId={c.empresaId} aba="neo" mes={c.mes} agenciaId={c.agenciaId} agencias={opcoesDeAgencia} busca={c.busca} />
      {c.podeAgir && <ProcessarNeo empresaId={c.empresaId} agenciaId={c.agenciaId} mes={c.mes} />}
      <FilaDoNeo
        // A chave zera as marcadas ao trocar de página: a marca de uma página não vale na outra.
        key={pagina}
        empresaId={c.empresaId}
        contas={opcoesDeConta}
        agencias={opcoesDeAgencia}
        parcial={fila.parcial}
        grupos={fila.grupos
          .filter((g) => g.quantidade > 1)
          .map((g) => ({
            chave: `${g.padrao}|${g.dc}`,
            rotulo: g.rotulo,
            dc: g.dc,
            quantidade: g.quantidade,
            total: moeda(textoDec(g.valorTotal)),
            contas: g.agenciaIds.length,
            transacaoIds: g.transacaoIds.filter((id) => naTela.has(id)),
          }))
          .filter((g) => g.transacaoIds.length > 0)}
        pendencias={pendencias.map((p) => ({
          id: p.id,
          data: formatCalendarDate(p.data),
          historico: p.historico,
          dc: p.dc,
          valor: moedaComSinal(p.valor, p.dc),
          motivo: p.decisoes[0]?.motivo ?? null,
          estrategia: p.decisoes[0]?.estrategia ?? null,
          recusadaPorPessoa: !!p.autoRecusadoEm,
        }))}
      />
      <Paginacao c={c} aba="neo" total={total} pagina={pagina} porPagina={PENDENCIAS_POR_PAGINA} />
    </div>
  );
}

// ─── Regras ───────────────────────────────────────────────────────────────

export async function AbaRegras({ c }: { c: ContextoDaAba }) {
  const [{ opcoesDeAgencia, opcoesDeConta }, { itens: regras, total, pagina }] = await Promise.all([
    opcoes(c),
    listarRegras(c.tenantId, c.empresaId, { busca: c.busca ?? undefined, agenciaId: c.agenciaId, pagina: c.pagina }),
  ]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <Filtros empresaId={c.empresaId} aba="regras" agenciaId={c.agenciaId} agencias={opcoesDeAgencia} busca={c.busca} />
        {c.podeAgir && (
          <div className="flex flex-wrap gap-2">
            <ImportarCadastro tipo="regras" empresaId={c.empresaId} agencias={opcoesDeAgencia} />
            <FormularioDaRegra empresaId={c.empresaId} contas={opcoesDeConta} agencias={opcoesDeAgencia} />
          </div>
        )}
      </div>
      {regras.length === 0 ? (
        <p className="text-sm text-fg-muted">Nenhuma regra cadastrada.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className={CABECALHO}>
                <th className={TH}>Texto do extrato</th>
                <th className={TH}>Lado</th>
                <th className={TH}>Conta contábil</th>
                <th className={TH}>Histórico do lançamento</th>
                <th className={TH}>Banco</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {regras.map((r) => (
                <tr key={r.id} className={`${LINHA} ${r.ativa ? "" : "opacity-60"}`}>
                  <td className="py-2 pr-3 font-medium">{r.historico}</td>
                  <td className="py-2 pr-3">{r.dc === "D" ? "Débito" : "Crédito"}</td>
                  <td className="py-2 pr-3">{rotuloDaConta(r.conta)}</td>
                  <td className="py-2 pr-3">{r.manterHistorico ? <span className="text-fg-muted">o do banco</span> : r.descricao}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{r.agencia ? rotuloDaAgencia(r.agencia) : "Todos"}</td>
                  <td className="py-2 whitespace-nowrap">
                    {!r.ativa && <Selo tom="neutro">Inativa</Selo>}
                    {c.podeAgir && (
                      <span className="flex items-center gap-1">
                        {r.ativa && <FormularioDaRegra empresaId={c.empresaId} contas={opcoesDeConta} agencias={opcoesDeAgencia} regra={{ ...r }} />}
                        <AlternarRegra empresaId={c.empresaId} regraId={r.id} ativa={r.ativa} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao c={c} aba="regras" total={total} pagina={pagina} />
    </div>
  );
}

// ─── Contrapartes ─────────────────────────────────────────────────────────

const ROTULO_TIPO_CP: Record<string, string> = { fornecedor: "Fornecedor", cliente: "Cliente", ambos: "Fornecedor e cliente" };

export async function AbaContrapartes({ c }: { c: ContextoDaAba }) {
  const [{ opcoesDeConta }, { itens: contrapartes, total, pagina }] = await Promise.all([
    opcoes(c),
    listarContrapartes(c.tenantId, c.empresaId, { busca: c.busca ?? undefined, pagina: c.pagina }),
  ]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <Filtros empresaId={c.empresaId} aba="contrapartes" busca={c.busca} />
        {c.podeAgir && (
          <div className="flex flex-wrap gap-2">
            <ImportarCadastro tipo="contrapartes" empresaId={c.empresaId} />
            <FormularioDaContraparte empresaId={c.empresaId} contas={opcoesDeConta} />
          </div>
        )}
      </div>
      {contrapartes.length === 0 ? (
        <p className="text-sm text-fg-muted">Nenhuma contraparte cadastrada.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className={CABECALHO}>
                <th className={TH}>Razão social</th>
                <th className={TH}>Documento</th>
                <th className={TH}>Tipo</th>
                <th className={TH}>Conta contábil</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {contrapartes.map((p) => (
                <tr key={p.id} className={`${LINHA} ${p.ativa ? "" : "opacity-60"}`}>
                  <td className="py-2 pr-3">
                    {p.razaoSocial}
                    {p.nomeFantasia && <span className="block text-micro text-fg-muted">{p.nomeFantasia}</span>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{p.documento.length === 11 ? formatCpf(p.documento) : formatCnpj(p.documento)}</td>
                  <td className="py-2 pr-3">{ROTULO_TIPO_CP[p.tipo] ?? p.tipo}</td>
                  <td className="py-2 pr-3">{rotuloDaConta(p.contaContabil)}</td>
                  <td className="py-2">
                    {!p.ativa && <Selo tom="neutro">Inativa</Selo>}
                    {c.podeAgir && <FormularioDaContraparte empresaId={c.empresaId} contas={opcoesDeConta} contraparte={{ ...p }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao c={c} aba="contrapartes" total={total} pagina={pagina} />
    </div>
  );
}

// ─── Registros e exportação ───────────────────────────────────────────────

const ORIGEM: Record<string, string> = { automatica: "Regra", contraparte: "Contraparte", manual: "Manual" };

export async function AbaRegistros({ c }: { c: ContextoDaAba }) {
  const [{ opcoesDeAgencia }, { itens, total }, ultimoMes] = await Promise.all([
    opcoes(c),
    listarRegistros(c.tenantId, c.empresaId, { mes: c.mes, agenciaId: c.agenciaId, pagina: c.pagina }),
    ultimoMesComLancamento(c.tenantId, c.empresaId),
  ]);
  return (
    <div className="flex flex-col gap-4">
      {c.podeAgir && <Exportar empresaId={c.empresaId} agencias={opcoesDeAgencia} mes={c.mes ?? ultimoMes ?? c.mesAtual} />}
      <div>
        <Filtros empresaId={c.empresaId} aba="registros" mes={c.mes} agenciaId={c.agenciaId} agencias={opcoesDeAgencia} />
        {itens.length === 0 ? (
          <p className="text-sm text-fg-muted">Nenhum lançamento nesta seleção.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className={CABECALHO}>
                  <th className={TH}>Data</th>
                  <th className={TH}>Conta</th>
                  <th className={TH}>D/C</th>
                  <th className={`${TH} text-right`}>Valor</th>
                  <th className={TH}>Histórico</th>
                  <th className={TH}>Origem</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((r) => (
                  <tr key={r.id} className={LINHA}>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{formatCalendarDate(r.dataLancamento)}</td>
                    <td className="py-2 pr-3">{rotuloDaConta(r.conta)}</td>
                    <td className="py-2 pr-3">{r.dc}</td>
                    <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{moeda(r.valor)}</td>
                    <td className="py-2 pr-3">
                      {r.historico}
                      {r.historicoExtrato !== r.historico && <span className="block text-micro text-fg-muted">{r.historicoExtrato}</span>}
                    </td>
                    <td className="py-2 text-micro text-fg-muted">{ORIGEM[r.tipoRegra] ?? r.tipoRegra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginacao c={c} aba="registros" total={total} />
      </div>
    </div>
  );
}

// ─── Notas fiscais ────────────────────────────────────────────────────────

// Bloco C, Fase C1 (18/11/2026): a aba "Notas" do original. A lista, os filtros e as ações vão pela API
// (`/api/contabil-core/notas`), que confere tenant, empresa e permissão; quem só lê o módulo vê a lista.
export function AbaNotas({ c }: { c: ContextoDaAba }) {
  // A chave zera a tela (filtros, resultado da importação) ao trocar de empresa.
  return <Notas key={c.empresaId} empresaId={c.empresaId} podeAgir={c.podeAgir} />;
}

// ─── Comprovantes de pagamento ────────────────────────────────────────────

// Bloco C, Fase C2 (19/11/2026): a página "Comprovantes" do original. A lista e as ações vão pela API
// (`/api/contabil-core/comprovantes`), que confere tenant, empresa e permissão; quem só lê vê a lista.
export function AbaComprovantes({ c }: { c: ContextoDaAba }) {
  // A chave zera a tela (fila de arquivos, filtro) ao trocar de empresa.
  return <Comprovantes key={c.empresaId} empresaId={c.empresaId} podeAgir={c.podeAgir} />;
}

// ─── Cartões de crédito ──────────────────────────────────────────────────

// Bloco C, Fase C3 (23/11/2026): a página "Cartão de Crédito" do original. Os cartões, as faturas, os gastos,
// o pagamento, os documentos e a distribuição vão pela API (`/api/contabil-core/cartoes`), que confere tenant,
// empresa e permissão; quem só lê vê tudo, sem os botões. As contas analíticas vêm daqui, como no NEO.
export async function AbaCartoes({ c }: { c: ContextoDaAba }) {
  const { opcoesDeConta } = await opcoes(c);
  // A chave zera a tela (o cartão e a fatura abertos) ao trocar de empresa.
  return <Cartoes key={c.empresaId} empresaId={c.empresaId} podeAgir={c.podeAgir} contas={opcoesDeConta} />;
}

// ─── Conciliação ──────────────────────────────────────────────────────────

// Razão × extrato (Bloco B, Fase B2, 12/11/2026) e conferência do financeiro (Fase B4, 12/11/2026). Conciliar só envia arquivo e mostra o relatório, que
// não é gravado. A revisão manual (Fase B3) grava: quem só lê o módulo consulta as revisões salvas e as
// conferências (o `concilpro.read` do original); conciliar e alterar pede "agir" (as rotas recusam igual).
export async function AbaConciliacao({ c }: { c: ContextoDaAba }) {
  const agencias = await listarAgencias(c.tenantId, c.empresaId);
  // Inclui as inativas, como o original: o Razão de uma conta encerrada continua conciliável.
  const opcoesDeConta = agencias.map((a) => ({ value: a.id, label: `${rotuloDaAgencia(a)}${a.ativa ? "" : " (inativa)"}` }));
  if (opcoesDeConta.length === 0) return <Aviso tom="atencao">Cadastre uma conta bancária em Configurações e importe o extrato dela antes de conciliar.</Aviso>;
  // A conferência do financeiro (Fase B4) era a terceira aba da Conciliação Bancária do original, ao
  // lado do Razão × extrato: aqui é a segunda vista da mesma aba, na URL para dar para voltar a ela.
  const financeiro = c.vista === "financeiro";
  const href = (vista: string | null) => `/contabil-core?${new URLSearchParams({ empresa: c.empresaId, aba: "conciliacao", ...(vista ? { vista } : {}) })}`;
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label="O que conciliar"
        tocavel
        active={financeiro ? "financeiro" : "razao"}
        items={[
          { key: "razao", label: "Razão × extrato", href: href(null) },
          { key: "financeiro", label: "Conciliação do financeiro", href: href("financeiro") },
        ]}
      />
      {/* A chave zera a tela ao trocar de empresa, como o `useEffect` do original. */}
      {financeiro ? (
        <ConciliacaoFinanceiro key={c.empresaId} empresaId={c.empresaId} agencias={opcoesDeConta} podeAgir={c.podeAgir} />
      ) : (
        <Conciliacao key={c.empresaId} empresaId={c.empresaId} agencias={opcoesDeConta} podeAgir={c.podeAgir} />
      )}
    </div>
  );
}

// ─── Relatórios ───────────────────────────────────────────────────────────

// Bloco D, Fase D2 (26/11/2026): a página Relatórios do original, com os três relatórios como vistas da aba (a
// DRE abre) e o período em datas, na URL. Só lê: aparece para quem vê o módulo (o `relatorios.read`).
export async function AbaRelatorios({ c }: { c: ContextoDaAba }) {
  const qual: QualRelatorio = c.vista === "balancete" || c.vista === "livro-caixa" ? c.vista : "dre";
  const periodo = { de: c.de, ate: c.ate };
  const href = (vista: QualRelatorio) =>
    `/contabil-core?${new URLSearchParams({ empresa: c.empresaId, aba: "relatorios", ...(vista === "dre" ? {} : { vista }), ...(c.de ? { de: c.de } : {}), ...(c.ate ? { ate: c.ate } : {}) })}`;
  const [empresa, r] = await Promise.all([empresaDoTenant(c.tenantId, c.empresaId), relatorioDaEmpresa(qual, c.tenantId, c.empresaId, periodo)]);
  const planilha = `/api/contabil-core/relatorios/${qual}?${new URLSearchParams({ empresa: c.empresaId, formato: "xlsx", ...(c.de ? { de: c.de } : {}), ...(c.ate ? { ate: c.ate } : {}) })}`;
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label="Qual relatório"
        tocavel
        active={qual}
        items={RELATORIOS.map((k) => ({ key: k, label: TITULO_DO_RELATORIO[k], href: href(k) }))}
      />
      <div>
        <Filtros empresaId={c.empresaId} aba="relatorios" vista={qual === "dre" ? null : qual} periodo={periodo} />
        <p className="mb-3 text-micro text-fg-muted">
          {qual === "livro-caixa"
            ? "As transações do extrato de cada conta bancária, classificadas ou não, com o saldo acumulado. O saldo inicial é o que veio antes do período."
            : "As partidas vivas do razão no período (a classificação desfeita não entra), por conta. A conta sintética mostra só o próprio movimento: não soma as analíticas."}
        </p>
        {!r.ok || !empresa ? (
          <Aviso tom="atencao">{r.ok ? "Empresa não encontrada no Contábil Core." : r.erro}</Aviso>
        ) : (
          <ImprimirRelatorio titulo={TITULO_DO_RELATORIO[qual]} empresa={`${empresa.razaoSocial} · ${formatCnpj(empresa.cnpj)}`} periodo={rotuloDoPeriodo(periodo)} planilha={planilha}>
            {qual === "dre" && <DreDaEmpresa r={r.valor as Dre} />}
            {qual === "balancete" && <BalanceteDaEmpresa r={r.valor as Balancete} />}
            {qual === "livro-caixa" && <LivroCaixaDaEmpresa r={r.valor as LivroCaixa} />}
          </ImprimirRelatorio>
        )}
      </div>
    </div>
  );
}

// ─── Configurações ────────────────────────────────────────────────────────

export async function AbaConfiguracoes({ c }: { c: ContextoDaAba }) {
  const [{ contas, agencias, todasAsContas, opcoesDeConta }, iaLigada] = await Promise.all([opcoes(c), iaLiberadaParaDocumentos(c.tenantId)]);
  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Leitura de documentos por IA</h2>
          {c.podeGerir && <AlternarIaParaDocumentos ligada={iaLigada} />}
        </div>
        <p className="text-sm text-fg-muted">
          {iaLigada
            ? "Ligada para o escritório: a nota fiscal e o comprovante de pagamento em PDF ou imagem vão ao provedor de IA configurado em Integrações › Inteligência artificial."
            : "Desligada: nenhum documento financeiro vai à IA. A nota em PDF ou imagem é recusada na importação (o XML não usa IA), e o comprovante só é lido pelos rótulos do texto do PDF; o resto se preenche à mão."}
        </p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Contas bancárias</h2>
          {c.podeGerir && (
            <div className="flex flex-wrap gap-2">
              {agencias.length > 0 && <CorrigirContaDoRazao empresaId={c.empresaId} />}
              <FormularioDaAgencia empresaId={c.empresaId} contas={opcoesDeConta} />
            </div>
          )}
        </div>
        {agencias.length === 0 ? (
          <p className="text-sm text-fg-muted">Nenhuma conta bancária cadastrada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={CABECALHO}>
                <th className={TH}>Conta</th>
                <th className={TH}>Conta contábil</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {agencias.map((a) => (
                <tr key={a.id} className={`${LINHA} ${a.ativa ? "" : "opacity-60"}`}>
                  <td className="py-2 pr-3 whitespace-nowrap">{rotuloDaAgencia(a)}</td>
                  <td className="py-2 pr-3">
                    {a.contaContabil ? rotuloDaConta(a.contaContabil) : <span className="text-warning-fg">Sem conta: o NEO cria uma sintética, que o Domínio não importa</span>}
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    {!a.ativa && <Selo tom="neutro">Inativa</Selo>}
                    {c.podeGerir && (
                      <span className="flex items-center gap-1">
                        <FormularioDaAgencia empresaId={c.empresaId} contas={opcoesDeConta} agencia={{ ...a }} />
                        <AlternarAgencia empresaId={c.empresaId} agenciaId={a.id} ativa={a.ativa} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Plano de contas</h2>
          {c.podeGerir && (
            <div className="flex flex-wrap gap-2">
              <ImportarCadastro tipo="plano" empresaId={c.empresaId} />
              <FormularioDaConta empresaId={c.empresaId} contas={todasAsContas} />
            </div>
          )}
        </div>
        {contas.length === 0 ? (
          <p className="text-sm text-fg-muted">Plano de contas vazio. Ele chega com a carga dos dados, ou cadastre as contas aqui.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className={CABECALHO}>
                  <th className={TH}>Código</th>
                  <th className={TH}>Reduzido</th>
                  <th className={TH}>Descrição</th>
                  <th className={TH}>Tipo</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {contas.map((x) => (
                  <tr key={x.id} className={LINHA}>
                    <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{x.codigo}</td>
                    <td className="py-2 pr-3 tabular-nums">{x.contaNumero ?? "—"}</td>
                    <td className={`py-2 pr-3 ${x.tipoSa === "S" ? "font-semibold" : ""}`}>{x.descricao}</td>
                    <td className="py-2 pr-3">{ROTULO_DO_TIPO_DE_CONTA[x.tipo] ?? x.tipo}</td>
                    <td className="py-2 whitespace-nowrap">
                      {c.podeGerir && (
                        <span className="flex items-center gap-1">
                          <FormularioDaConta empresaId={c.empresaId} contas={todasAsContas} conta={{ ...x }} />
                          <ExcluirConta empresaId={c.empresaId} contaId={x.id} codigo={x.codigo} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
