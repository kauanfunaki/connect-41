import { cache } from "react";
import Link from "next/link";
import { UserPlus, UserMinus, Stethoscope, HeartPulse } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { saoPauloParts } from "@/lib/agenda";
import { formatCalendarDate } from "@/lib/format";
import { moeda } from "@/lib/financeiro/formato";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { titulosEmAberto } from "@/lib/financeiro/consultas";
import { resumoDasPendencias } from "@/lib/financeiro/pendencias/consultas";
import { listarFila, feriadosDoTenant } from "@/lib/societario/fila";
import { SITUACAO_LABEL } from "@/components/societario/ProcessosFila";
import { computeFunnelConversion } from "@/lib/recruitmentFunnel";
import { listarCertificados } from "@/lib/certificados/servidor";
import { atuaisPorDocumento, situacaoDoCertificado } from "@/lib/certificados/certificados";
import {
  aPagarPorSemana,
  carteiraPorFaixa,
  contarFerias,
  contarTarefas,
  faixasDasPendencias,
  AVISO_DAS_FERIAS_DIAS,
  type FaixaDeVencimento,
  type Soma,
} from "@/lib/home/paineis";
import type { AcessoDoPainel } from "@/lib/home/acessoDosPaineis";
import {
  BarraDeSituacao,
  Colunas,
  Funil,
  LinhasDeSituacao,
  Painel,
  Rosca,
  numero,
  type LinhaDeSituacao,
  type Segmento,
  type Tom,
} from "@/components/shared/Graficos";

// Os painéis da Home (30/09). Cada um é um server component assíncrono com a
// própria consulta, montado dentro de um <Suspense> na Home: a página não
// espera o mais lento para aparecer, e cada painel entra quando o dado chega.

/** Nome e cor do setor, já resolvidos pela Home. */
export type SetorDoPainel = { rotulo: string; cor: string };

type Base = { ctx: AuthContext; acesso: AcessoDoPainel; setor: SetorDoPainel };

const MOEDA_CURTA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "R$ 12,3 mil" — rótulo de coluna; o valor exato fica na dica. */
function moedaCurta(centavos: number): string {
  return MOEDA_CURTA.format(centavos / 100);
}

function plural(n: number, um: string, varios: string): string {
  return `${numero(n)} ${n === 1 ? um : varios}`;
}

// Painel de contas e o de semanas leem os mesmos títulos: uma consulta por
// requisição, não duas.
const titulosDoTenant = cache((tenantId: string) => titulosEmAberto({ tenantId, companyIds: null }));

// ─── Você ──────────────────────────────────────────────────────────────────

/**
 * As tarefas abertas nos kanbans que o usuário enxerga — o mesmo conjunto do
 * cartão "Vencidos / hoje" — e, no rodapé, quantas são dele. Era só das
 * atribuídas, e quem coordena (sem tarefa no próprio nome) via um painel vazio.
 */
export function PainelDeTarefas({
  itens,
  atribuidas,
  escopo,
  inicioDeHoje,
  fimDeHoje,
}: {
  itens: { dueDate: Date | null }[];
  atribuidas: number;
  /** "Seus setores", ou o nome do setor ativo. */
  escopo: string;
  inicioDeHoje: Date;
  fimDeHoje: Date;
}) {
  const c = contarTarefas(itens, inicioDeHoje, fimDeHoje);
  return (
    <Painel
      setor={escopo}
      titulo="Tarefas por prazo"
      href="/tarefas"
      rodape={itens.length > 0 ? <>{plural(atribuidas, "atribuída a você", "atribuídas a você")}</> : undefined}
      destaque={
        c.atrasada > 0
          ? { valor: numero(c.atrasada), legenda: c.atrasada === 1 ? "atrasada" : "atrasadas", tom: "critico" }
          : { valor: numero(c.hoje), legenda: "para hoje" }
      }
    >
      <Rosca
        titulo="Tarefas abertas por prazo"
        legendaDoTotal={itens.length === 1 ? "aberta" : "abertas"}
        vazio="Nenhuma tarefa aberta nos seus kanbans."
        segmentos={[
          { chave: "atrasada", rotulo: "Atrasadas", valor: c.atrasada, tom: "critico" },
          { chave: "hoje", rotulo: "Para hoje", valor: c.hoje, tom: "atencao" },
          { chave: "adiante", rotulo: "Com prazo adiante", valor: c.adiante, tom: "proximo" },
          { chave: "sem_prazo", rotulo: "Sem prazo", valor: c.sem_prazo, tom: "neutro" },
        ]}
      />
    </Painel>
  );
}

// ─── BPO ───────────────────────────────────────────────────────────────────

const FAIXAS_DAS_CONTAS: { chave: FaixaDeVencimento; rotulo: string; tom: Tom }[] = [
  { chave: "vencida", rotulo: "Vencidas", tom: "critico" },
  { chave: "hoje", rotulo: "Vencem hoje", tom: "atencao" },
  { chave: "semana", rotulo: "Próximos 7 dias", tom: "proximo" },
  { chave: "depois", rotulo: "Depois", tom: "neutro" },
];

function segmentosDaCarteira(faixas: Record<FaixaDeVencimento, Soma>, tela: "/pagar" | "/receber"): Segmento[] {
  return FAIXAS_DAS_CONTAS.map((f) => ({
    chave: f.chave,
    rotulo: f.rotulo,
    tom: f.tom,
    valor: faixas[f.chave].n,
    detalhe: moeda(faixas[f.chave].centavos),
    href: f.chave === "vencida" ? `${tela}?recorte=vencidas` : tela,
  }));
}

export async function PainelDeContas({ ctx, acesso, setor }: Base) {
  const hojeKey = saoPauloParts(new Date()).dateKey;
  const titulos = await titulosDoTenant(ctx.tenantId);
  const verPagar = acesso.modulos.has("bpo_contas_pagar");
  const verReceber = acesso.modulos.has("bpo_contas_receber");
  const pagar = carteiraPorFaixa(titulos, "PAGAR", hojeKey);
  const receber = carteiraPorFaixa(titulos, "RECEBER", hojeKey);
  const principal = verPagar ? pagar : receber;

  return (
    <Painel
      setor={setor.rotulo}
      cor={setor.cor}
      titulo="Contas a pagar e a receber"
      href={verPagar ? "/pagar" : "/receber"}
      destaque={{
        valor: moeda(principal.vencida.centavos),
        legenda: verPagar ? "a pagar vencido" : "a receber vencido",
        tom: principal.vencida.n > 0 ? "critico" : undefined,
      }}
    >
      <div className="space-y-4">
        {verPagar && (
          <BarraDeSituacao titulo="A pagar" segmentos={segmentosDaCarteira(pagar, "/pagar")} vazio="Nenhuma conta a pagar em aberto." />
        )}
        {verReceber && (
          <BarraDeSituacao
            titulo="A receber"
            segmentos={segmentosDaCarteira(receber, "/receber")}
            vazio="Nenhuma conta a receber em aberto."
          />
        )}
      </div>
    </Painel>
  );
}

export async function PainelDeSemanas({ ctx, setor }: Base) {
  const hojeKey = saoPauloParts(new Date()).dateKey;
  const semanas = aPagarPorSemana(await titulosDoTenant(ctx.tenantId), hojeKey);
  const total = semanas.reduce((s, x) => s + x.centavos, 0);
  const dia = (key: string) => formatCalendarDate(new Date(`${key}T12:00:00Z`), { day: "2-digit", month: "2-digit" });

  return (
    <Painel
      setor={setor.rotulo}
      cor={setor.cor}
      titulo="A pagar nas próximas semanas"
      href="/pagar"
      destaque={{ valor: moeda(total), legenda: "em seis semanas" }}
    >
      <Colunas
        titulo="Por semana, de segunda a domingo"
        formatar={moedaCurta}
        vazio="Nada a pagar nas próximas seis semanas."
        colunas={semanas.map((s, i) => ({
          chave: s.inicioKey,
          rotulo: i === 0 ? "Esta semana" : dia(s.inicioKey),
          valor: s.centavos,
          destaque: i === 0,
          dica: `${moeda(s.centavos)} · ${plural(s.n, "conta", "contas")}${i === 0 ? " (de hoje em diante)" : ""}`,
        }))}
      />
    </Painel>
  );
}

export async function PainelDePendencias({ ctx, acesso, setor }: Base) {
  const agora = new Date();
  const prisma = getPrisma();
  const verPendencias = acesso.modulos.has("bpo_pendencias");
  const verAprovacoes = acesso.modulos.has("bpo_aprovacoes");
  const [resumo, aprovacoes] = await Promise.all([
    verPendencias ? resumoDasPendencias({ tenantId: ctx.tenantId, companyIds: null }, agora) : null,
    // A contagem da fila de /aprovacoes (aguardando e reprovadas travam a baixa).
    verAprovacoes
      ? prisma.financeEntry.groupBy({
          by: ["approvalStatus"],
          where: { tenantId: ctx.tenantId, kind: "PAGAR", status: { not: "CANCELADO" }, approvalStatus: { in: ["AGUARDANDO", "REPROVADO"] } },
          _count: { _all: true },
          _sum: { amount: true },
        })
      : null,
  ]);

  const p = resumo ? faixasDasPendencias(resumo) : null;
  const daAprovacao = (s: "AGUARDANDO" | "REPROVADO") => aprovacoes?.find((a) => a.approvalStatus === s);
  const aguardando = daAprovacao("AGUARDANDO");
  const reprovadas = daAprovacao("REPROVADO");
  const valor = (g: typeof aguardando) => moeda(g?._sum.amount ? centavosDeDecimal(g._sum.amount) : 0);

  return (
    <Painel
      setor={setor.rotulo}
      cor={setor.cor}
      titulo="Pendências e aprovações"
      href={verPendencias ? "/pendencias" : "/aprovacoes"}
      destaque={
        p
          ? { valor: numero(p.vencidas), legenda: p.vencidas === 1 ? "pendência vencida" : "pendências vencidas", tom: p.vencidas > 0 ? "critico" : undefined }
          : { valor: numero(aguardando?._count._all ?? 0), legenda: "aguardando aprovação", tom: "atencao" }
      }
    >
      <div className="space-y-4">
        {p && (
          <BarraDeSituacao
            titulo="Pendências com o cliente"
            vazio="Nenhuma pendência em andamento."
            segmentos={[
              { chave: "vencidas", rotulo: "Vencidas", valor: p.vencidas, tom: "critico", href: "/pendencias?vencidas=1" },
              { chave: "respondidas", rotulo: "Respondidas, a revisar", valor: p.respondidas, tom: "atencao", href: "/pendencias?recorte=respondidas" },
              { chave: "aguardando", rotulo: "Com o cliente", valor: p.aguardando, tom: "proximo", href: "/pendencias?recorte=aguardando" },
            ]}
          />
        )}
        {verAprovacoes && (
          <BarraDeSituacao
            titulo="Aprovações de pagamento"
            vazio="Nada esperando aprovação."
            segmentos={[
              {
                chave: "reprovadas",
                rotulo: "Reprovadas",
                valor: reprovadas?._count._all ?? 0,
                tom: "critico",
                href: "/aprovacoes?situacao=reprovadas",
                detalhe: valor(reprovadas),
              },
              {
                chave: "aguardando",
                rotulo: "Aguardando",
                valor: aguardando?._count._all ?? 0,
                tom: "atencao",
                href: "/aprovacoes?situacao=aguardando",
                detalhe: valor(aguardando),
              },
            ]}
          />
        )}
      </div>
    </Painel>
  );
}

// ─── Societário ────────────────────────────────────────────────────────────

/** A ordem de /processos, e a chave do recorte de cada situação lá. */
const SITUACOES_DA_FILA = [
  { situacao: "EM_EXIGENCIA", recorte: "exigencia" },
  { situacao: "AGUARDANDO_CLIENTE", recorte: "cliente" },
  { situacao: "AGUARDANDO_ORGAO", recorte: "orgao" },
  { situacao: "EM_ANDAMENTO", recorte: "andamento" },
  { situacao: "SUSPENSO", recorte: "suspensos" },
] as const;

const FAIXAS_DO_PRAZO = [
  { chave: "estourado", rotulo: "Prazo estourado", tom: "critico" },
  { chave: "no_limite", rotulo: "No limite", tom: "atencao" },
  { chave: "dentro", rotulo: "Dentro do prazo", tom: "ok" },
  { chave: "sem_previsao", rotulo: "Sem previsão", tom: "neutro" },
] as const;

export async function PainelDeProcessos({ ctx, setor }: Base) {
  const agora = new Date();
  const feriados = await feriadosDoTenant(ctx.tenantId);
  const fila = await listarFila(ctx.tenantId, {}, feriados, agora);
  const estourados = fila.filter((l) => l.prazo.situacao === "estourado").length;

  const linhas: LinhaDeSituacao[] = SITUACOES_DA_FILA.map((s) => {
    const daSituacao = fila.filter((l) => l.situacao === s.situacao);
    return {
      chave: s.situacao,
      rotulo: SITUACAO_LABEL[s.situacao],
      href: `/processos?situacao=${s.recorte}`,
      segmentos: FAIXAS_DO_PRAZO.map((f) => ({
        chave: f.chave,
        rotulo: f.rotulo,
        tom: f.tom,
        valor: daSituacao.filter((l) => l.prazo.situacao === f.chave).length,
      })),
    };
  }).filter((l) => l.segmentos.some((x) => x.valor > 0));

  return (
    <Painel
      setor={setor.rotulo}
      cor={setor.cor}
      titulo="Processos em aberto"
      href="/processos"
      destaque={{
        valor: numero(estourados),
        legenda: `de ${plural(fila.length, "processo", "processos")} com prazo estourado`,
        tom: estourados > 0 ? "critico" : undefined,
      }}
    >
      <LinhasDeSituacao titulo="Processos por situação e prazo" linhas={linhas} vazio="Nenhum processo em aberto." />
    </Painel>
  );
}

// ─── DP ────────────────────────────────────────────────────────────────────

/** Os mesmos recortes das telas: /ferias, /colaboradores, /admissoes e /afastamentos. */
const FERIAS_EM_ABERTO = ["PLANEJADA", "SOLICITADA", "EM_ANALISE", "APROVADA", "PROGRAMADA", "EM_GOZO"] as const;
const EXAMES_PENDENTES = ["SOLICITADO", "AGENDADO", "REALIZADO", "ASO_PENDENTE"] as const;
const AFASTAMENTOS_ATIVOS = ["AFASTADO", "RETORNO_PREVISTO", "EM_ANALISE"] as const;

export async function PainelDoDP({ ctx, setor }: Base) {
  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  const [ferias, admissoes, rescisoes, exames, afastados] = await Promise.all([
    prisma.vacation.findMany({ where: { tenantId, status: { in: [...FERIAS_EM_ABERTO] } }, select: { concessivePeriodEnd: true } }),
    prisma.person.count({ where: { tenantId, type: "COLABORADOR", employmentStatus: "ADMISSAO_EM_ANDAMENTO" } }),
    prisma.termination.count({ where: { tenantId, status: { notIn: ["FINALIZADO", "CANCELADO"] } } }),
    prisma.exameAdmissional.count({ where: { tenantId, status: { in: [...EXAMES_PENDENTES] } } }),
    prisma.absence.count({ where: { tenantId, status: { in: [...AFASTAMENTOS_ATIVOS] } } }),
  ]);
  const f = contarFerias(ferias, new Date());

  const andamento = [
    { rotulo: "Admissões", detalhe: "em andamento", valor: admissoes, href: "/admissoes", icone: <UserPlus /> },
    { rotulo: "Rescisões", detalhe: "em processo", valor: rescisoes, href: "/desligamentos", icone: <UserMinus /> },
    { rotulo: "Exames", detalhe: "admissionais pendentes", valor: exames, href: "/admissoes", icone: <Stethoscope /> },
    { rotulo: "Afastados", detalhe: "agora", valor: afastados, href: "/afastamentos", icone: <HeartPulse /> },
  ];

  return (
    <Painel
      setor={setor.rotulo}
      cor={setor.cor}
      titulo="Departamento Pessoal"
      href="/colaboradores"
      destaque={{
        valor: numero(f.vencidas),
        legenda: f.vencidas === 1 ? "férias vencida" : "férias vencidas",
        tom: f.vencidas > 0 ? "critico" : undefined,
      }}
    >
      <BarraDeSituacao
        titulo="Férias em aberto"
        vazio="Nenhuma férias em aberto."
        segmentos={[
          { chave: "vencidas", rotulo: "Vencidas", valor: f.vencidas, tom: "critico", href: "/ferias" },
          { chave: "a_vencer", rotulo: `Vencem em até ${AVISO_DAS_FERIAS_DIAS} dias`, valor: f.aVencer, tom: "atencao", href: "/ferias" },
          { chave: "no_prazo", rotulo: "No prazo", valor: f.noPrazo, tom: "ok", href: "/ferias" },
        ]}
      />
      <ul className="grid grid-cols-2 gap-2 mt-4">
        {andamento.map((a) => (
          <li key={a.rotulo}>
            <Link
              href={a.href}
              className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2 hover:border-border-strong hover:bg-surface-hover transition-colors"
            >
              <span className="text-fg-muted [&>svg]:size-4 flex-shrink-0">{a.icone}</span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-fg leading-tight">{numero(a.valor)}</span>
                <span className="block text-[length:var(--fs-micro)] text-fg-muted truncate">
                  {a.rotulo} {a.detalhe}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Painel>
  );
}

// ─── Recrutamento ──────────────────────────────────────────────────────────

export async function PainelDeRecrutamento({ ctx, setor }: Base) {
  const prisma = getPrisma();
  // O escopo de /vagas (setor ativo e regra do recrutador); candidatura não
  // tem setor, então vem pela vaga.
  const vagasAbertas = { AND: [scopedVagaWhere(ctx), { status: { in: ["ABERTA" as const, "EM_ANDAMENTO" as const] } }] };
  const [vagas, candidaturas] = await Promise.all([
    prisma.vaga.count({ where: vagasAbertas }),
    prisma.candidatura.findMany({ where: { tenantId: ctx.tenantId, vaga: vagasAbertas }, select: { stage: true, status: true } }),
  ]);
  const funil = computeFunnelConversion(candidaturas);

  return (
    <Painel
      setor={setor.rotulo}
      cor={setor.cor}
      titulo="Funil das vagas abertas"
      href="/vagas"
      destaque={{ valor: numero(vagas), legenda: vagas === 1 ? "vaga aberta" : "vagas abertas" }}
      rodape={
        funil.total > 0 ? (
          <>
            {plural(funil.total, "candidatura", "candidaturas")} · {numero(funil.reprovados)} reprovada
            {funil.reprovados === 1 ? "" : "s"} · {numero(funil.desistentes)} desistente{funil.desistentes === 1 ? "" : "s"}
          </>
        ) : undefined
      }
    >
      <Funil
        titulo="Candidaturas que chegaram a cada etapa"
        vazio="Nenhuma candidatura nas vagas abertas."
        etapas={funil.stages.map((s) => ({ chave: s.stage, rotulo: s.label, valor: s.reached }))}
      />
    </Painel>
  );
}

// ─── Certificados ──────────────────────────────────────────────────────────

export async function PainelDeCertificados({ ctx, setor }: Base) {
  const hoje = new Date();
  const certs = await listarCertificados(ctx.tenantId);
  const atuais = atuaisPorDocumento(certs);
  const c = { vencido: 0, a_renovar: 0, vigente: 0 };
  for (const cert of certs) {
    const s = situacaoDoCertificado(cert, atuais.get(cert.documento), hoje);
    if (s !== "substituido") c[s] += 1;
  }

  return (
    <Painel
      setor={setor.rotulo}
      cor={setor.cor}
      titulo="Certificados digitais"
      href="/certificados"
      destaque={{
        valor: numero(c.vencido),
        legenda: c.vencido === 1 ? "vencido" : "vencidos",
        tom: c.vencido > 0 ? "critico" : undefined,
      }}
    >
      <Rosca
        titulo="Certificados em uso por situação"
        legendaDoTotal="em uso"
        vazio="Nenhum certificado importado ainda."
        segmentos={[
          { chave: "vencido", rotulo: "Vencidos", valor: c.vencido, tom: "critico", href: "/certificados" },
          { chave: "a_renovar", rotulo: "A renovar (60 dias)", valor: c.a_renovar, tom: "atencao", href: "/certificados" },
          { chave: "vigente", rotulo: "Vigentes", valor: c.vigente, tom: "ok", href: "/certificados?aba=todos" },
        ]}
      />
    </Painel>
  );
}

/** O lugar do painel enquanto a consulta dele roda. */
export function PainelCarregando() {
  return (
    <div className="min-w-0 bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5 min-h-[260px]" aria-hidden>
      <div className="h-2.5 w-20 rounded-full bg-surface-hover animate-pulse" />
      <div className="h-4 w-44 rounded-full bg-surface-hover animate-pulse mt-2.5" />
      <div className="h-7 w-32 rounded-md bg-surface-hover animate-pulse mt-4" />
      <div className="h-2.5 w-full rounded-full bg-surface-hover animate-pulse mt-7" />
      <div className="h-2.5 w-4/5 rounded-full bg-surface-hover animate-pulse mt-3" />
    </div>
  );
}
