import Link from "next/link";
import { UserPlus, UserMinus, Stethoscope, HeartPulse } from "lucide-react";
import type { AuthContext } from "@/lib/auth/context";
import { formatCalendarDate } from "@/lib/format";
import { moeda } from "@/lib/financeiro/formato";
import { SITUACAO_LABEL } from "@/components/societario/ProcessosFila";
import { contarTarefas, totalDaCarteira, AVISO_DAS_FERIAS_DIAS, type FaixaDeVencimento, type Soma } from "@/lib/home/paineis";
import { tendenciasDaHome } from "@/lib/home/historico";
import {
  dadosDaCarteira,
  dadosDasPendencias,
  dadosDoDP,
  dadosDoRecrutamento,
  dadosDosCertificados,
  dadosDosProcessos,
} from "@/lib/home/dadosDosPaineis";
import type { AcessoDoPainel } from "@/lib/home/acessoDosPaineis";
import {
  BarraDeSituacao,
  Colunas,
  Funil,
  LinhasDeSituacao,
  Painel,
  Rosca,
  numero,
  numeroCurto,
  type LinhaDeSituacao,
  type Segmento,
  type Tom,
} from "@/components/shared/Graficos";

// Os painéis da Home (30/09). Cada um é um server component assíncrono com a
// própria consulta, montado dentro de um <Suspense> na Home: a página não
// espera o mais lento para aparecer, e cada painel entra quando o dado chega.
// As consultas moram em `dadosDosPaineis.ts` (06/10), com `cache()`: a faixa
// de destaques lê os mesmos números sem consultar de novo.
//
// Tendência (06/10, opção A): cada painel passa os números dele para
// `tendenciasDaHome`, que devolve o selo e a linha do número principal e
// agenda a foto de hoje — por isso o painel entrega também os números que só
// a faixa de destaques mostra (o histórico deles nasce aqui).

/** Nome e cor do setor, já resolvidos pela Home. */
export type SetorDoPainel = { rotulo: string; cor: string };

type Base = { ctx: AuthContext; acesso: AcessoDoPainel; setor: SetorDoPainel };

/**
 * "12,3 mil" — o rótulo em cima da coluna, sem o "R$" (06/10): seis colunas
 * com "R$ 12,3 mil" não cabem no celular. O título diz que é dinheiro, e o
 * valor exato fica na dica.
 */
function reaisCurtos(centavos: number): string {
  return numeroCurto(centavos / 100);
}

function plural(n: number, um: string, varios: string): string {
  return `${numero(n)} ${n === 1 ? um : varios}`;
}

/**
 * O painel cuja consulta falhou (07/10): o cabeçalho de sempre, para a pessoa
 * saber o que faltou, e um aviso discreto no lugar do gráfico — o resto da
 * Home segue. A consulta devolve `null` em vez de lançar (`dadosDosPaineis`).
 */
function PainelIndisponivel({ setor, titulo, href }: { setor: SetorDoPainel; titulo: string; href: string }) {
  return (
    <Painel setor={setor.rotulo} cor={setor.cor} titulo={titulo} href={href}>
      <p className="text-[length:var(--fs-helper)] text-fg-muted py-1.5">Não deu para carregar agora. Atualize a página em instantes.</p>
    </Painel>
  );
}

// ─── Você ──────────────────────────────────────────────────────────────────

/**
 * As tarefas abertas nos kanbans que o usuário enxerga — o mesmo conjunto do
 * cartão "Atrasadas / hoje" — e, no rodapé, quantas são dele. Era só das
 * atribuídas, e quem coordena (sem tarefa no próprio nome) via um painel vazio.
 */
export async function PainelDeTarefas({
  ctx,
  itens,
  atribuidas,
  escopo,
  inicioDeHoje,
  fimDeHoje,
}: {
  ctx: AuthContext;
  itens: { dueDate: Date | null }[];
  atribuidas: number;
  /** "Seus setores", ou o nome do setor ativo. */
  escopo: string;
  inicioDeHoje: Date;
  fimDeHoje: Date;
}) {
  const c = contarTarefas(itens, inicioDeHoje, fimDeHoje);
  const t = await tendenciasDaHome(ctx, { tarefas_atrasadas: c.atrasada, tarefas_hoje: c.hoje });
  return (
    <Painel
      setor={escopo}
      titulo="Tarefas por prazo"
      href="/tarefas"
      rodape={itens.length > 0 ? <>{plural(atribuidas, "atribuída a você", "atribuídas a você")}</> : undefined}
      destaque={
        c.atrasada > 0
          ? {
              valor: numero(c.atrasada),
              legenda: c.atrasada === 1 ? "atrasada" : "atrasadas",
              tom: "critico",
              tendencia: t.tarefas_atrasadas,
            }
          : { valor: numero(c.hoje), legenda: "para hoje", tendencia: t.tarefas_hoje }
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
  const carteira = await dadosDaCarteira(ctx.tenantId);
  const verPagar = acesso.modulos.has("bpo_contas_pagar");
  const verReceber = acesso.modulos.has("bpo_contas_receber");
  const titulo = "Contas a pagar e a receber";
  const href = verPagar ? "/pagar" : "/receber";
  if (!carteira) return <PainelIndisponivel setor={setor} titulo={titulo} href={href} />;
  const { pagar, receber } = carteira;
  const principal = verPagar ? pagar : receber;
  const t = await tendenciasDaHome(ctx, {
    ...(verPagar ? { pagar_vencido: pagar.vencida.centavos, pagar_aberto: totalDaCarteira(pagar).centavos } : {}),
    ...(verReceber ? { receber_vencido: receber.vencida.centavos, receber_aberto: totalDaCarteira(receber).centavos } : {}),
  });

  return (
    <Painel
      setor={setor.rotulo}
      cor={setor.cor}
      titulo={titulo}
      href={href}
      destaque={{
        valor: moeda(principal.vencida.centavos),
        legenda: verPagar ? "a pagar vencido" : "a receber vencido",
        tom: principal.vencida.n > 0 ? "critico" : undefined,
        tendencia: verPagar ? t.pagar_vencido : t.receber_vencido,
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
  const carteira = await dadosDaCarteira(ctx.tenantId);
  if (!carteira) return <PainelIndisponivel setor={setor} titulo="A pagar nas próximas semanas" href="/pagar" />;
  const { semanas } = carteira;
  const total = semanas.reduce((s, x) => s + x.centavos, 0);
  const dia = (key: string) => formatCalendarDate(new Date(`${key}T12:00:00Z`), { day: "2-digit", month: "2-digit" });
  const t = await tendenciasDaHome(ctx, { pagar_seis_semanas: total, pagar_esta_semana: semanas[0]?.centavos ?? 0 });

  return (
    <Painel
      setor={setor.rotulo}
      cor={setor.cor}
      titulo="A pagar nas próximas semanas"
      href="/pagar"
      destaque={{ valor: moeda(total), legenda: "em seis semanas", tendencia: t.pagar_seis_semanas }}
    >
      <Colunas
        titulo="Por semana, de segunda a domingo"
        formatar={moeda}
        formatarCurto={reaisCurtos}
        vazio="Nada a pagar nas próximas seis semanas."
        colunas={semanas.map((s, i) => ({
          chave: s.inicioKey,
          rotulo: i === 0 ? "Esta semana" : dia(s.inicioKey),
          valor: s.centavos,
          destaque: i === 0,
          dica: `${plural(s.n, "conta", "contas")}${i === 0 ? " (de hoje em diante)" : ""}`,
        }))}
      />
    </Painel>
  );
}

export async function PainelDePendencias({ ctx, acesso, setor }: Base) {
  const verPendencias = acesso.modulos.has("bpo_pendencias");
  const verAprovacoes = acesso.modulos.has("bpo_aprovacoes");
  const titulo = "Pendências e aprovações";
  const href = verPendencias ? "/pendencias" : "/aprovacoes";
  const dados = await dadosDasPendencias(ctx.tenantId, verPendencias, verAprovacoes);
  if (!dados) return <PainelIndisponivel setor={setor} titulo={titulo} href={href} />;
  const { pendencias: p, aprovacoes } = dados;
  const aguardando = aprovacoes?.aguardando ?? { n: 0, centavos: 0 };
  const reprovadas = aprovacoes?.reprovadas ?? { n: 0, centavos: 0 };
  const t = await tendenciasDaHome(ctx, {
    ...(p ? { pendencias_vencidas: p.vencidas, pendencias_abertas: p.respondidas + p.aguardando } : {}),
    ...(aprovacoes ? { aprovacoes_aguardando: aguardando.n } : {}),
  });

  return (
    <Painel
      setor={setor.rotulo}
      cor={setor.cor}
      titulo={titulo}
      href={href}
      destaque={
        p
          ? {
              valor: numero(p.vencidas),
              legenda: p.vencidas === 1 ? "pendência vencida" : "pendências vencidas",
              tom: p.vencidas > 0 ? "critico" : undefined,
              tendencia: t.pendencias_vencidas,
            }
          : { valor: numero(aguardando.n), legenda: "aguardando aprovação", tom: "atencao", tendencia: t.aprovacoes_aguardando }
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
                valor: reprovadas.n,
                tom: "critico",
                href: "/aprovacoes?situacao=reprovadas",
                detalhe: moeda(reprovadas.centavos),
              },
              {
                chave: "aguardando",
                rotulo: "Aguardando",
                valor: aguardando.n,
                tom: "atencao",
                href: "/aprovacoes?situacao=aguardando",
                detalhe: moeda(aguardando.centavos),
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
  const dados = await dadosDosProcessos(ctx.tenantId);
  if (!dados) return <PainelIndisponivel setor={setor} titulo="Processos em aberto" href="/processos" />;
  const { fila, estourados } = dados;
  const t = await tendenciasDaHome(ctx, { processos_estourados: estourados, processos_abertos: fila.length });

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
        tendencia: t.processos_estourados,
      }}
    >
      <LinhasDeSituacao titulo="Processos por situação e prazo" linhas={linhas} vazio="Nenhum processo em aberto." />
    </Painel>
  );
}

// ─── DP ────────────────────────────────────────────────────────────────────

export async function PainelDoDP({ ctx, setor }: Base) {
  // O que o painel mostra, como os outros ("Tarefas por prazo"): o setor já
  // vem no rótulo de cima, e "DP · Departamento Pessoal" só o repetia (07/10).
  const titulo = "Férias e movimentações";
  const dados = await dadosDoDP(ctx.tenantId);
  if (!dados) return <PainelIndisponivel setor={setor} titulo={titulo} href="/colaboradores" />;
  const { ferias: f, admissoes, rescisoes, exames, afastados } = dados;
  const t = await tendenciasDaHome(ctx, { ferias_vencidas: f.vencidas, ferias_a_vencer: f.aVencer });

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
      titulo={titulo}
      href="/colaboradores"
      destaque={{
        valor: numero(f.vencidas),
        legenda: f.vencidas === 1 ? "férias vencida" : "férias vencidas",
        tom: f.vencidas > 0 ? "critico" : undefined,
        tendencia: t.ferias_vencidas,
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
                <span className="block font-display text-[length:var(--fs-body)] font-semibold text-fg leading-tight tnum">{numero(a.valor)}</span>
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
  // O escopo de /vagas (setor ativo e regra do recrutador).
  const dados = await dadosDoRecrutamento(ctx);
  if (!dados) return <PainelIndisponivel setor={setor} titulo="Funil das vagas abertas" href="/vagas" />;
  const { vagas, funil } = dados;
  const t = await tendenciasDaHome(ctx, { vagas_abertas: vagas });

  return (
    <Painel
      setor={setor.rotulo}
      cor={setor.cor}
      titulo="Funil das vagas abertas"
      href="/vagas"
      destaque={{ valor: numero(vagas), legenda: vagas === 1 ? "vaga aberta" : "vagas abertas", tendencia: t.vagas_abertas }}
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
  const c = await dadosDosCertificados(ctx.tenantId);
  if (!c) return <PainelIndisponivel setor={setor} titulo="Certificados digitais" href="/certificados" />;
  const t = await tendenciasDaHome(ctx, { certificados_vencidos: c.vencido, certificados_a_renovar: c.a_renovar });

  return (
    <Painel
      setor={setor.rotulo}
      cor={setor.cor}
      titulo="Certificados digitais"
      href="/certificados"
      // Sem certificado importado, sem número (07/10): "0 vencidos" em
      // destaque lia como "tudo em dia". O portal faz o mesmo no Início.
      destaque={
        c.vencido + c.a_renovar + c.vigente > 0
          ? {
              valor: numero(c.vencido),
              legenda: c.vencido === 1 ? "vencido" : "vencidos",
              tom: c.vencido > 0 ? "critico" : undefined,
              tendencia: t.certificados_vencidos,
            }
          : undefined
      }
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
    <div className="min-w-0 bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-md)] p-5 min-h-[280px]" aria-hidden>
      <div className="h-2.5 w-20 rounded-full bg-surface-hover animate-pulse" />
      <div className="h-4 w-44 rounded-full bg-surface-hover animate-pulse mt-2.5" />
      <div className="h-7 w-32 rounded-md bg-surface-hover animate-pulse mt-4" />
      <div className="h-2.5 w-full rounded-full bg-surface-hover animate-pulse mt-7" />
      <div className="h-2.5 w-4/5 rounded-full bg-surface-hover animate-pulse mt-3" />
    </div>
  );
}
