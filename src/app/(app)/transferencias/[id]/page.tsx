import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { getSectorUsers } from "@/lib/sectorUsers";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { scopedHandoffWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { TextoComLinks } from "@/components/shared/TextoComLinks";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { AndamentoDosSetores, type ColunaDoAndamento } from "@/components/transferencias/AndamentoDosSetores";
import { AtividadeDaTransferencia, type ItemNaTela } from "@/components/transferencias/AtividadeDaTransferencia";
import { ComentarNaTransferencia } from "@/components/transferencias/ComentarNaTransferencia";
import { DevolvidaAoPedido } from "@/components/transferencias/DevolvidaAoPedido";
import { EditarTransferencia } from "@/components/transferencias/EditarTransferencia";
import { ParteDoSetor } from "@/components/transferencias/ParteDoSetor";
import { formatCpf, formatDocumento, formatInstantDate, formatInstantDateTime } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";
import { tempoRelativo } from "@/lib/notificacoes/tempo";
import { registrarVisualizacao } from "../actions";
import { abrirPeloEndereco } from "@/lib/enderecoCurtoServidor";
import { enderecoDe, idCurto } from "@/lib/enderecoCurto";
import {
  aggregateHandoffStatus,
  canReadSectorInstruction,
  HANDOFF_PRIORITY_LABEL,
  HANDOFF_PRIORITY_TOM,
  HANDOFF_STATUS_BADGE,
  HANDOFF_STATUS_LABEL,
  HANDOFF_STATUS_TOM,
  tituloDaTransferencia,
} from "@/lib/handoffs";
import { acoesDaParte, aoSetor, podeComentar, podeEditarATransferencia, podeMudarResponsaveis } from "@/lib/handoffTransicoes";
import {
  fraseDoItem,
  itensDaAtividade,
  resumoDaParte,
  rotuloDoTexto,
  setorDeQuemAgiu,
  trechosComMencao,
  ultimaDevolucao,
} from "@/lib/handoffAtividade";

const DATA_E_HORA: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };

/**
 * A transferência aberta (10/11/2026, pedido do Kauan — Controle interno
 * melhoria-591, escolha "B · Andamento no topo e a conversa ao lado"):
 * - no topo, a faixa com o andamento de cada setor de destino;
 * - à esquerda, a descrição e a Atividade (comentários com @ e o histórico);
 * - à direita, a parte de cada setor em que quem olha pode agir (instrução,
 *   responsáveis, Começar / Finalizar / Devolver), o cartão "Devolvida" para
 *   quem pediu responder e reenviar, e os detalhes.
 * No celular, uma coluna na ordem de leitura: faixa, a minha parte, descrição,
 * Atividade, detalhes. As regras estão em src/lib/handoffTransicoes.ts e o
 * texto da Atividade em src/lib/handoffAtividade.ts.
 */
export default async function HandoffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  // O endereço curto (10/11/2026, pedido do Kauan): /transferencias/transferencia-8.
  // O do uuid passa para ele; quem confere se a pessoa vê é o escopo abaixo.
  const { id } = await abrirPeloEndereco("transferencia", ctx.tenantId, (await params).id, await searchParams);
  const prisma = getPrisma();

  const handoff = await prisma.handoff.findFirst({
    where: { id, ...scopedHandoffWhere(ctx) },
    include: {
      requester: { select: { id: true, name: true, photoUrl: true } },
      sectors: {
        orderBy: { createdAt: "asc" },
        include: {
          assignees: { orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, name: true, photoUrl: true } } } },
        },
      },
      events: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          userId: true,
          handoffSectorId: true,
          body: true,
          createdAt: true,
          user: { select: { sectors: { select: { sectorCode: true } } } },
        },
      },
    },
  });
  if (!handoff) notFound();

  if (ctx.userId) await registrarVisualizacao(handoff.id);

  const [entidade, { labels: sectorLabels }, pessoasDoEscritorio, views] = await Promise.all([
    handoff.entityType === "COMPANY"
      ? prisma.company
          .findFirst({ where: { id: handoff.entityId, tenantId: ctx.tenantId }, select: { number: true, name: true, displayName: true, kind: true, cnpj: true, cpf: true } })
          .then((c) => (c ? { numero: c.number, nome: nomeExibicao(c), documento: formatDocumento(c.kind, c.cnpj, c.cpf), rotuloDoDocumento: c.kind === "PESSOA_FISICA" ? "CPF" : "CNPJ" } : null))
      : prisma.person
          .findFirst({ where: { id: handoff.entityId, tenantId: ctx.tenantId }, select: { number: true, name: true, cpf: true } })
          .then((p) => (p ? { numero: p.number, nome: p.name, documento: formatCpf(p.cpf), rotuloDoDocumento: "CPF" } : null)),
    getSectorMaps(ctx.tenantId),
    // Os nomes e as fotos de quem aparece na Atividade e na faixa, e a lista do
    // "@" (só os ativos). Os inativos ficam para pintar a menção antiga.
    prisma.user.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, photoUrl: true, active: true },
    }),
    prisma.handoffView.findMany({
      where: { handoffId: handoff.id },
      include: { user: { select: { name: true, photoUrl: true } } },
      orderBy: { viewedAt: "desc" },
    }),
  ]);

  const agora = new Date();
  const rotulo = (codigo: string) => sectorLabel(sectorLabels, codigo);
  const pessoaPorId = new Map(pessoasDoEscritorio.map((u) => [u.id, u]));
  const nome = (userId: string) => pessoaPorId.get(userId)?.name ?? "Usuário removido";
  const titulo = tituloDaTransferencia(handoff);
  const origem = rotulo(handoff.fromSector);
  const aggregate = aggregateHandoffStatus(handoff.sectors.map((s) => s.status));
  const pedido = { requestedBy: handoff.requestedBy, fromSector: handoff.fromSector };
  const entityHref = enderecoDe(handoff.entityType === "COMPANY" ? "empresa" : "pessoa", { id: handoff.entityId, number: entidade?.numero });
  const eventos = handoff.events.map((e) => ({
    id: e.id,
    type: e.type,
    userId: e.userId,
    handoffSectorId: e.handoffSectorId,
    body: e.body,
    createdAt: e.createdAt,
  }));
  const mencionaveis = pessoasDoEscritorio.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }));

  // ─── Cada parte, com o que quem olha pode fazer nela ──────────────────────
  const partes = handoff.sectors.map((s) => {
    const responsaveis = s.assignees.map((a) => a.user.id);
    const acoes = acoesDaParte(ctx, { sectorCode: s.sectorCode, status: s.status, responsaveis }, pedido);
    return {
      s,
      responsaveis,
      doLadoDoSetor: acoes.filter((a) => a !== "reenviar"),
      podeReenviar: acoes.includes("reenviar"),
      mudaResponsaveis: podeMudarResponsaveis(ctx, s),
      doMeuSetor: ctx.sectors.includes(s.sectorCode) || responsaveis.includes(ctx.userId),
      resumo: resumoDaParte({ ...s, responsaveis }, eventos, nome, agora),
    };
  });

  const colunas: ColunaDoAndamento[] = partes.map((p) => ({
    id: p.s.id,
    setor: rotulo(p.s.sectorCode),
    status: p.s.status,
    resumo: p.resumo,
    doMeuSetor: p.doMeuSetor,
  }));

  // As partes em que a pessoa age, a do setor dela primeiro.
  const minhasPartes = partes
    .filter((p) => p.doLadoDoSetor.length > 0 || p.mudaResponsaveis)
    .sort((a, b) => Number(b.doMeuSetor) - Number(a.doMeuSetor));
  const opcoesPorSetor = Object.fromEntries(
    await Promise.all(
      minhasPartes.filter((p) => p.mudaResponsaveis).map(async (p) => [p.s.sectorCode, await getSectorUsers(ctx.tenantId, p.s.sectorCode)] as const)
    )
  );
  const devolvidasParaMim = partes.filter((p) => p.podeReenviar);

  // ─── A Atividade ──────────────────────────────────────────────────────────
  const setoresDe = new Map(handoff.events.map((e) => [e.userId, e.user.sectors.map((x) => x.sectorCode)]));
  const contextoDoSetor = {
    requestedBy: handoff.requestedBy,
    fromSector: handoff.fromSector,
    partes: partes.map((p) => ({ sectorCode: p.s.sectorCode, responsaveis: p.responsaveis })),
  };
  const nomesParaMencao = pessoasDoEscritorio.map((u) => u.name);
  const itens: ItemNaTela[] = itensDaAtividade(handoff, handoff.sectors, eventos).map((item) => {
    const pessoa = item.autorId ? pessoaPorId.get(item.autorId) : undefined;
    const setorDoAutor = item.autorId
      ? setorDeQuemAgiu(item.autorId, item.setorDaParte, { ...contextoDoSetor, setoresDaPessoa: setoresDe.get(item.autorId) ?? [] })
      : null;
    return {
      chave: item.chave,
      tipo: item.tipo,
      autor: item.autorId ? { nome: pessoa?.name ?? "Usuário removido", foto: pessoa?.photoUrl ?? null } : null,
      setorDoAutor: setorDoAutor ? rotulo(setorDoAutor) : null,
      frase: fraseDoItem(item, rotulo),
      trechos: item.texto ? (item.tipo === "COMMENT" ? trechosComMencao(item.texto, nomesParaMencao) : [{ texto: item.texto, mencao: false }]) : null,
      rotuloDoTexto: rotuloDoTexto(item.tipo),
      relativo: tempoRelativo(item.quando, agora),
      exato: formatInstantDateTime(item.quando, DATA_E_HORA),
      iso: item.quando.toISOString(),
      deduzido: item.deduzido,
    };
  });

  const eu = pessoaPorId.get(ctx.userId);
  const comenta = podeComentar(ctx);
  const edita = podeEditarATransferencia(ctx, pedido);
  const temCartaoAoLado = minhasPartes.length > 0 || devolvidasParaMim.length > 0;

  const detalhes = (className: string) => (
    <Card as="section" aria-label="Detalhes" className={`p-5 ${className}`}>
      <h2 className="text-section font-semibold text-fg mb-3">Detalhes</h2>
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-ui">
        <dt className="text-fg-muted">{handoff.entityType === "COMPANY" ? "Empresa" : "Pessoa"}</dt>
        <dd className="min-w-0 break-words">
          {entidade ? (
            <Link href={entityHref} className="font-medium text-fg hover:text-brand transition-colors">
              {entidade.nome}
            </Link>
          ) : (
            <span className="text-fg-muted">(removido)</span>
          )}
        </dd>
        <dt className="text-fg-muted">{entidade?.rotuloDoDocumento ?? (handoff.entityType === "COMPANY" ? "CNPJ" : "CPF")}</dt>
        <dd className="tabular-nums text-fg-secondary">{entidade?.documento ?? "—"}</dd>
        <dt className="text-fg-muted">Pedida por</dt>
        <dd className="min-w-0 break-words text-fg-secondary">
          {handoff.requester.name} · {origem}
        </dd>
        <dt className="text-fg-muted">Aberta em</dt>
        <dd className="text-fg-secondary">{formatInstantDateTime(handoff.createdAt, DATA_E_HORA)}</dd>
        <dt className="text-fg-muted">Viram</dt>
        <dd>
          {views.length === 0 ? (
            <span className="text-fg-muted">Ninguém ainda.</span>
          ) : (
            <>
              <ul className="flex flex-wrap gap-1" aria-hidden>
                {views.map((v) => (
                  <li key={v.id} title={`${v.user.name}, em ${formatInstantDateTime(v.viewedAt, DATA_E_HORA)}`} className="inline-flex">
                    <AvatarImage src={v.user.photoUrl} name={v.user.name} size={26} fontSize={10} />
                  </li>
                ))}
              </ul>
              <span className="sr-only">{views.map((v) => `${v.user.name}, em ${formatInstantDateTime(v.viewedAt, DATA_E_HORA)}`).join("; ")}</span>
            </>
          )}
        </dd>
      </dl>
    </Card>
  );

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Transferências", href: "/transferencias" },
          { label: titulo, truncate: true },
        ]}
      />

      <PageHeader
        title={titulo}
        subtitle={
          <>
            {/* O id curto, discreto, como no Controle interno (10/11/2026, pedido do Kauan). */}
            {idCurto("transferencia", handoff.number)}
            {" · "}
            {entidade ? (
              <Link href={entityHref} className="font-medium text-fg hover:text-brand transition-colors">
                {entidade.nome}
              </Link>
            ) : (
              <span className="text-fg-muted">(removido)</span>
            )}
            {" · "}pedida por {handoff.requester.name} ({origem}) em{" "}
            {formatInstantDate(handoff.createdAt, { day: "2-digit", month: "long", year: "numeric" })}
          </>
        }
        meta={
          <>
            <Selo tom={tomDaVariante(HANDOFF_STATUS_BADGE[aggregate])}>{HANDOFF_STATUS_LABEL[aggregate]}</Selo>
            <Selo tom={HANDOFF_PRIORITY_TOM[handoff.priority]}>Prioridade {HANDOFF_PRIORITY_LABEL[handoff.priority].toLowerCase()}</Selo>
          </>
        }
        // Sem o "⋯": não há, por ora, ação secundária para pôr nele.
        action={
          edita ? (
            <EditarTransferencia
              handoffId={handoff.id}
              inicial={{ subject: handoff.subject ?? "", description: handoff.description ?? "", priority: handoff.priority }}
              pessoas={mencionaveis}
            />
          ) : undefined
        }
      />

      <AndamentoDosSetores colunas={colunas} />

      {/* Na mesa, duas colunas; no celular, uma, na ordem de leitura. O lado
          vem antes no código para "a minha parte" aparecer logo depois da faixa
          no celular; os detalhes aparecem duas vezes (um de cada lado) e cada
          um some numa largura. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)] lg:items-start">
        <div className={`${temCartaoAoLado ? "flex" : "hidden lg:flex"} min-w-0 flex-col gap-5 lg:col-start-2 lg:row-start-1`}>
          {devolvidasParaMim.map((p) => {
            const devolucao = ultimaDevolucao(eventos, p.s.id);
            return (
              <DevolvidaAoPedido
                key={`devolvida-${p.s.id}`}
                parteId={p.s.id}
                setor={rotulo(p.s.sectorCode)}
                origem={origem}
                motivo={devolucao?.body ?? null}
                quem={devolucao ? nome(devolucao.userId) : null}
                quando={devolucao ? formatInstantDateTime(devolucao.createdAt, DATA_E_HORA) : null}
              />
            );
          })}
          {minhasPartes.map((p) => {
            const isAssignee = p.responsaveis.includes(ctx.userId);
            return (
              <ParteDoSetor
                key={p.s.id}
                parteId={p.s.id}
                setor={rotulo(p.s.sectorCode)}
                origem={origem}
                status={p.s.status}
                situacao={{ rotulo: HANDOFF_STATUS_LABEL[p.s.status], tom: HANDOFF_STATUS_TOM[p.s.status] }}
                instrucao={p.s.instruction}
                // A instrução é dirigida a UM setor — ver a transferência não dá
                // direito de ler o que foi dito a outro (achado de 24/08/2026).
                podeLerInstrucao={canReadSectorInstruction({
                  fullAccess: isFullAccess(ctx.role),
                  userId: ctx.userId,
                  requestedBy: handoff.requestedBy,
                  userSectors: ctx.sectors,
                  sectorCode: p.s.sectorCode,
                  isAssignee,
                })}
                acoes={p.doLadoDoSetor}
                responsaveis={p.s.assignees.map((a) => ({ id: a.user.id, nome: a.user.name, foto: a.user.photoUrl }))}
                opcoesDeResponsavel={p.mudaResponsaveis ? (opcoesPorSetor[p.s.sectorCode] ?? []) : null}
                doMeuSetor={p.doMeuSetor}
                nota={
                  p.s.status === "RETURNED"
                    ? `Devolvida ${aoSetor(origem)}. A parte volta para cá quando quem pediu responder e reenviar.`
                    : null
                }
              />
            );
          })}
          {detalhes("hidden lg:block")}
        </div>

        <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
          <Card as="section" aria-labelledby="titulo-descricao" className="p-5 space-y-3">
            <h2 id="titulo-descricao" className="text-section font-semibold text-fg">
              Descrição
            </h2>
            {handoff.description ? (
              <p className="text-ui text-fg-secondary whitespace-pre-wrap break-words">
                <TextoComLinks texto={handoff.description} />
              </p>
            ) : (
              <p className="text-ui text-fg-muted italic">Sem descrição.</p>
            )}
            {/* "Informações adicionais" só nas transferências que a têm: o campo
                saiu do formulário em 10/11/2026, e a nova não escreve nele. */}
            {handoff.message && (
              <>
                <h3 className="text-label font-semibold text-fg pt-2">Informações adicionais</h3>
                <p className="text-ui text-fg-secondary whitespace-pre-wrap break-words">
                  <TextoComLinks texto={handoff.message} />
                </p>
              </>
            )}
          </Card>

          <Card as="section" aria-labelledby="titulo-atividade" className="p-5 space-y-4">
            <h2 id="titulo-atividade" className="text-section font-semibold text-fg">
              Atividade
            </h2>
            {comenta && eu && (
              <ComentarNaTransferencia handoffId={handoff.id} eu={{ nome: eu.name, foto: eu.photoUrl }} pessoas={mencionaveis} />
            )}
            <AtividadeDaTransferencia itens={itens} />
          </Card>

          {detalhes("lg:hidden")}
        </div>
      </div>
    </PageContainer>
  );
}
