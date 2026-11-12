import Link from "next/link";
import { Selo } from "@/components/ui/Selo";
import { Aviso } from "@/components/ui/Aviso";
import { formatCalendarDate, formatCnpj, formatCpf, formatInstantDateTime } from "@/lib/format";
import { listarAgencias, listarContas, listarContrapartes, listarRegras } from "@/lib/contabil-core/servidor/cadastros";
import { listarImportacoes } from "@/lib/contabil-core/servidor/importacao";
import { listarPendencias } from "@/lib/contabil-core/servidor/neo";
import { filaAgrupada } from "@/lib/contabil-core/servidor/neoAvancado";
import { texto as textoDec } from "@/lib/contabil-core/motor/decimal";
import { listarExtrato, listarRegistros, POR_PAGINA, ultimoMesComLancamento } from "@/lib/contabil-core/servidor/consultas";
import { moeda, moedaComSinal, ROTULO_DO_TIPO_DE_CONTA, rotuloDaAgencia, rotuloDaConta } from "@/lib/contabil-core/tela";
import { AlternarAgencia, AlternarRegra, CancelarClassificacao, DesfazerImportacao, ExcluirConta } from "./Botoes";
import { EnvioDeExtrato } from "./EnvioDeExtrato";
import { ImportarCadastro } from "./ImportarCadastro";
import { Exportar } from "./Exportar";
import { Conciliacao } from "./Conciliacao";
import { Filtros } from "./Filtros";
import { FormularioDaAgencia, FormularioDaConta, FormularioDaContraparte, FormularioDaRegra } from "./Formularios";
import { FilaDoNeo, ProcessarNeo } from "./Neo";
import { Compor, Reclassificar } from "./Lancamento";

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

function Paginacao({ c, aba, total }: { c: ContextoDaAba; aba: string; total: number }) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
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
      {c.pagina > 1 && <Link href={href(c.pagina - 1)} className="text-brand hover:underline">Anterior</Link>}
      <span className="text-fg-muted">
        Página {c.pagina} de {paginas} · {total} itens
      </span>
      {c.pagina < paginas && <Link href={href(c.pagina + 1)} className="text-brand hover:underline">Próxima</Link>}
    </nav>
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
      <Filtros
        empresaId={c.empresaId}
        aba="extrato"
        mes={c.mes}
        agenciaId={c.agenciaId}
        agencias={opcoesDeAgencia}
        busca={c.busca}
        status={c.status}
      />
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
  const [{ opcoesDeAgencia, opcoesDeConta }, pendencias, fila] = await Promise.all([
    opcoes(c),
    listarPendencias(c.tenantId, c.empresaId, { agenciaId: c.agenciaId, mes: c.mes, busca: c.busca }),
    filaAgrupada(c.tenantId, c.empresaId, { agenciaId: c.agenciaId, mes: c.mes }),
  ]);
  // Os grupos marcam só o que está na tela (as 500 primeiras pendências da seleção).
  const naTela = new Set(pendencias.map((p) => p.id));
  return (
    <div className="flex flex-col gap-4">
      <Filtros empresaId={c.empresaId} aba="neo" mes={c.mes} agenciaId={c.agenciaId} agencias={opcoesDeAgencia} busca={c.busca} />
      {c.podeAgir && <ProcessarNeo empresaId={c.empresaId} agenciaId={c.agenciaId} mes={c.mes} />}
      <FilaDoNeo
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
      {pendencias.length >= 500 && <p className="text-micro text-fg-muted">Mostrando as 500 primeiras. Filtre por mês ou conta para ver o resto.</p>}
    </div>
  );
}

// ─── Regras ───────────────────────────────────────────────────────────────

export async function AbaRegras({ c }: { c: ContextoDaAba }) {
  const [{ opcoesDeAgencia, opcoesDeConta }, regras] = await Promise.all([opcoes(c), listarRegras(c.tenantId, c.empresaId, { busca: c.busca ?? undefined, agenciaId: c.agenciaId })]);
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
    </div>
  );
}

// ─── Contrapartes ─────────────────────────────────────────────────────────

const ROTULO_TIPO_CP: Record<string, string> = { fornecedor: "Fornecedor", cliente: "Cliente", ambos: "Fornecedor e cliente" };

export async function AbaContrapartes({ c }: { c: ContextoDaAba }) {
  const [{ opcoesDeConta }, contrapartes] = await Promise.all([opcoes(c), listarContrapartes(c.tenantId, c.empresaId, c.busca ?? undefined)]);
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

// ─── Conciliação ──────────────────────────────────────────────────────────

// Razão × extrato (Bloco B, Fase B2, 12/11/2026). Conciliar só envia arquivo e mostra o relatório, que
// não é gravado. A revisão manual (Fase B3) grava: quem só lê o módulo consulta as revisões salvas e as
// conferências (o `concilpro.read` do original); conciliar e alterar pede "agir" (as rotas recusam igual).
export async function AbaConciliacao({ c }: { c: ContextoDaAba }) {
  const agencias = await listarAgencias(c.tenantId, c.empresaId);
  // Inclui as inativas, como o original: o Razão de uma conta encerrada continua conciliável.
  const opcoesDeConta = agencias.map((a) => ({ value: a.id, label: `${rotuloDaAgencia(a)}${a.ativa ? "" : " (inativa)"}` }));
  if (opcoesDeConta.length === 0) return <Aviso tom="atencao">Cadastre uma conta bancária em Configurações e importe o extrato dela antes de conciliar.</Aviso>;
  // A chave zera a tela ao trocar de empresa, como o `useEffect` do original.
  return <Conciliacao key={c.empresaId} empresaId={c.empresaId} agencias={opcoesDeConta} podeAgir={c.podeAgir} />;
}

// ─── Configurações ────────────────────────────────────────────────────────

export async function AbaConfiguracoes({ c }: { c: ContextoDaAba }) {
  const { contas, agencias, todasAsContas, opcoesDeConta } = await opcoes(c);
  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Contas bancárias</h2>
          {c.podeGerir && <FormularioDaAgencia empresaId={c.empresaId} contas={opcoesDeConta} />}
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
