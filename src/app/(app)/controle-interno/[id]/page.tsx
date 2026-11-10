import Link from "next/link";
import { notFound } from "next/navigation";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { ArrowLeft, ExternalLink, History, MessageSquare, Paperclip, PencilLine, Plus } from "lucide-react";
import {
  MODULO_TECH_INTERNO, ROTA_TECH_INTERNO, TIPOS, PRIORIDADES, TAMANHOS, EM_ABERTO,
  destinoDeVolta, comVolta, chaveDoSistema, nomeDoSistema, hojeEmSaoPaulo, type Alteracao,
} from "@/lib/tech-interno/regras";
import { CORES_DO_TIPO } from "@/lib/tech-interno/cores";
import { lerCriterioDeAceite, marcasQueValem } from "@/lib/tech-interno/criterioDeAceite";
import { detalheItem, opcoesTech } from "@/lib/tech-interno/servidor";
import { FormularioItem, FormularioComentario } from "@/components/tech-interno/FormularioItem";
import { CriterioDeAceite, type MarcaDoPonto } from "@/components/tech-interno/CriterioDeAceite";
import { SituacaoTech } from "@/components/tech-interno/SituacaoTech";
import { MudancasDoRegistro } from "@/components/tech-interno/MudancasDoRegistro";
import { AnexosDoItem } from "@/components/tech-interno/AnexosDoItem";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCalendarDate, formatInstantDateTime } from "@/lib/format";

type Item = NonNullable<Awaited<ReturnType<typeof detalheItem>>>;

/**
 * O item do Controle interno.
 *
 * Abre em visualização (pedido do Kauan, 10/11/2026): quem abre o item quase
 * sempre vem conferir o critério de aceite e testar, não editar. O critério
 * fica no alto e aberto; os detalhes ao lado, com a situação, que muda ali
 * mesmo (o seletor da lista); a descrição e os anexos embaixo. "Editar"
 * (`?editar=1`) leva ao formulário de antes. Quem só vê o módulo não tem o
 * "Editar" e fica sempre na visualização.
 *
 * Os comentários ficam à vista; o histórico das alterações é recolhível e
 * começa fechado, com o resumo na linha.
 *
 * No celular, uma coluna na ordem de leitura: critério, detalhes (com a
 * situação), comentários, histórico e, por fim, a descrição e os anexos.
 */
export default async function DetalheTechPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO), { id } = await params, busca = await searchParams;
  const voltar = destinoDeVolta(busca.voltar), querEditar = busca.editar === "1";
  const [item, opcoes, podeEditar, podeDefinirTamanho] = await Promise.all([
    detalheItem(ctx, id), querEditar ? opcoesTech(ctx) : null, podeNoModulo(ctx, MODULO_TECH_INTERNO, "agir"), podeNoModulo(ctx, MODULO_TECH_INTERNO, "gerir"),
  ]);
  if (!item) notFound();
  const editando = podeEditar && !!opcoes;
  const verHref = comVolta(`${ROTA_TECH_INTERNO}/${item.id}`, voltar), editarHref = comVolta(`${ROTA_TECH_INTERNO}/${item.id}?editar=1`, voltar);

  const voltarParaLista = <Button variant="secondary" href={voltar}><ArrowLeft size={14} aria-hidden />Voltar para a lista</Button>;
  const comentariosEHistorico = <>
    <Card as="section" aria-labelledby="tech-comentarios" className="min-w-0 p-5 flex flex-col gap-4">
      <h2 id="tech-comentarios" className="text-card-title font-semibold text-fg">Comentários{item.comments.length ? ` (${item.comments.length})` : ""}</h2>
      {podeEditar && <FormularioComentario id={item.id} />}
      {item.comments.length
        ? <ol className="flex flex-col gap-4" aria-label="Comentários do item">{item.comments.map(c => <li key={c.id} className="flex min-w-0 gap-3">
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-secondary"><MessageSquare size={14} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-ui text-fg break-words"><span className="font-medium">{c.authorName}</span> <time dateTime={c.createdAt.toISOString()} className="text-helper text-fg-muted">{formatInstantDateTime(c.createdAt)}</time></p>
            <p className="mt-1.5 rounded-md bg-surface-2 p-3 text-ui whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{c.body}</p>
          </div>
        </li>)}</ol>
        : <p className="text-helper text-fg-muted">Nenhum comentário ainda.</p>}
    </Card>
    <HistoricoDoItem item={item} />
  </>;

  if (editando) return <PageContainer>
    <PageHeader title={<span className="break-words [overflow-wrap:anywhere]">{item.title}</span>} subtitle={`Editando o item criado em ${formatInstantDateTime(item.createdAt)}.`} action={voltarParaLista} />
    <Colunas
      principal={<Card as="section" aria-label="Dados do item" className="min-w-0 p-5">
        <FormularioItem key={`${item.id}:${item.version}`} disposicao="compacta" {...opcoes} podeEditar podeDefinirTamanho={podeDefinirTamanho} voltar={voltar} aoTerminar={verHref} item={{
          id: item.id, version: item.version, title: item.title, description: item.description, acceptanceCriteria: item.acceptanceCriteria, type: item.type, priority: item.priority,
          status: item.status, systemMode: item.systemMode, systemKey: chaveDoSistema(item), assigneeId: item.assigneeId,
          assigneeName: item.assignee?.name ?? null, dueDate: item.dueDate?.toISOString().slice(0, 10) ?? null,
          size: item.size, originItemId: item.originItemId, prUrl: item.prUrl, commitSha: item.commitSha,
        }} />
        <div className="mt-6 border-t border-border pt-5"><Anexos item={item} podeEditar /></div>
      </Card>}
      lateral={comentariosEHistorico} />
  </PageContainer>;

  // As marcas do "Aprovado quando" que ainda valem: as do ponto que não foi reescrito.
  const marcas: Record<number, MarcaDoPonto> = Object.fromEntries([...marcasQueValem(lerCriterioDeAceite(item.acceptanceCriteria)?.pontos ?? [], item.acceptanceChecks)]
    .map(([posicao, m]) => [posicao, { por: m.checkedByName, quando: formatInstantDateTime(m.createdAt) }]));
  return <PageContainer>
    <PageHeader title={<span className="break-words [overflow-wrap:anywhere]">{item.title}</span>} subtitle={`Criado em ${formatInstantDateTime(item.createdAt)}`}
      action={<div className="flex flex-wrap gap-2">{voltarParaLista}{podeEditar && <Button variant="secondary" href={editarHref}><PencilLine size={14} aria-hidden />Editar</Button>}</div>} />
    <Colunas
      principal={<Card className="min-w-0 p-5">
        <CriterioDeAceite itemId={item.id} texto={item.acceptanceCriteria} marcas={marcas} podeEditar={podeEditar} editarHref={editarHref} concluido={item.status === "DONE"} />
      </Card>}
      abaixo={<Card className="min-w-0 p-5 flex flex-col gap-6">
        <section aria-labelledby="tech-descricao" className="flex flex-col gap-2">
          <h2 id="tech-descricao" className="text-card-title font-semibold text-fg">Descrição</h2>
          {item.description
            ? <p className="text-body text-fg whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{item.description}</p>
            : <p className="text-helper text-fg-muted">Sem descrição.</p>}
        </section>
        <div className="border-t border-border pt-5"><Anexos item={item} podeEditar={podeEditar} /></div>
      </Card>}
      lateral={<>
        <Card as="section" aria-labelledby="tech-detalhes" className="min-w-0 p-5 flex flex-col gap-4">
          <h2 id="tech-detalhes" className="text-card-title font-semibold text-fg">Detalhes</h2>
          <DadosDoItem item={item} podeEditar={podeEditar} voltar={voltar} />
        </Card>
        {comentariosEHistorico}
      </>} />
  </PageContainer>;
}

/**
 * Duas colunas a partir de 1280px: `principal` no alto à esquerda, `abaixo`
 * logo embaixo dele e a `lateral` à direita, da altura das duas. Abaixo de
 * 1280px, uma coluna só, na ordem do HTML — que é a mesma do Tab: principal,
 * lateral (a situação, para concluir, logo depois do critério) e o de baixo.
 */
function Colunas({ principal, lateral, abaixo }: { principal: React.ReactNode; lateral: React.ReactNode; abaixo?: React.ReactNode }) {
  return <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:grid-rows-[auto_1fr]">
    <div className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-start-1">{principal}</div>
    <div className="flex min-w-0 flex-col gap-6 xl:col-start-2 xl:row-span-2 xl:row-start-1">{lateral}</div>
    {abaixo && <div className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-start-2">{abaixo}</div>}
  </div>;
}

function Anexos({ item, podeEditar }: { item: Item; podeEditar: boolean }) {
  return <AnexosDoItem itemId={item.id} podeEditar={podeEditar} anexos={item.attachments.map(a => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, uploadedByName: a.uploadedByName, createdAt: a.createdAt.toISOString() }))} />;
}

const vazio = (texto: string) => <span className="text-fg-muted">{texto}</span>;
const LINK = "text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand rounded-sm";
/** "connect-41 #365" para um PR do GitHub; o endereço sem o protocolo nos outros. */
function rotuloDoPr(url: string) {
  const m = /github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/i.exec(url);
  return m ? `${m[1]} #${m[2]}` : url.replace(/^https?:\/\//i, "");
}
/** O commit no mesmo repositório do PR, quando o PR é do GitHub. */
function linkDoCommit(prUrl: string | null, sha: string) {
  const repo = prUrl ? /^(https:\/\/github\.com\/[^/]+\/[^/]+)\/pull\/\d+/i.exec(prUrl)?.[1] : undefined;
  return repo ? `${repo}/commit/${sha}` : null;
}

/** Os campos do item, para ler: a situação muda aqui mesmo; o resto, no "Editar". */
function DadosDoItem({ item, podeEditar, voltar }: { item: Item; podeEditar: boolean; voltar: string }) {
  const prazo = item.dueDate?.toISOString().slice(0, 10) ?? null;
  const atrasado = !!prazo && prazo < hojeEmSaoPaulo() && (EM_ABERTO as readonly string[]).includes(item.status);
  const commit = item.commitSha ? linkDoCommit(item.prUrl, item.commitSha) : null;
  const linhas: [string, React.ReactNode][] = [
    ["Situação", <SituacaoTech key={item.version} id={item.id} titulo={item.title} status={item.status} version={item.version} podeEditar={podeEditar} forma="selo" />],
    ["Tipo", <span key="t" className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: CORES_DO_TIPO[item.type] }} />{TIPOS[item.type]}</span>],
    ["Prioridade", <span key="p" className={item.priority >= 2 ? "font-semibold" : undefined}>{PRIORIDADES[item.priority] ?? "—"}</span>],
    ["Sistema", nomeDoSistema(item, true)],
    ["Responsável", item.assignee ? `${item.assignee.name}${item.assignee.active ? "" : " (inativo)"}` : vazio("Sem responsável")],
    ["Prazo", prazo ? <span key="z" className={atrasado ? "font-medium text-danger" : undefined}>{formatCalendarDate(item.dueDate!)}{atrasado ? " · Atrasado" : ""}</span> : vazio("Sem prazo")],
    ["Tamanho", item.size ? `${item.size} · ${TAMANHOS[item.size]}` : vazio("Sem tamanho")],
    ["Veio de", item.originItemId
      ? <Link key="o" href={comVolta(`${ROTA_TECH_INTERNO}/${item.originItemId}`, voltar)} className={`${LINK} break-words [overflow-wrap:anywhere]`}>{item.originItem?.title ?? "Entrega de origem"}</Link>
      : vazio("Não veio de uma entrega")],
    ["PR", item.prUrl
      ? <a key="r" href={item.prUrl} target="_blank" rel="noopener noreferrer" title={item.prUrl} className={`${LINK} inline-flex max-w-full items-center gap-1`}><span className="truncate">{rotuloDoPr(item.prUrl)}</span><ExternalLink size={12} aria-hidden className="shrink-0" /><span className="sr-only"> (abre em outra aba)</span></a>
      : vazio("Não informado")],
    ["Commit", item.commitSha
      ? commit
        ? <a key="c" href={commit} target="_blank" rel="noopener noreferrer" title={item.commitSha} className={`${LINK} inline-flex items-center gap-1 font-mono`}>{item.commitSha.slice(0, 7)}<ExternalLink size={12} aria-hidden className="shrink-0" /><span className="sr-only"> (abre em outra aba)</span></a>
        : <span key="c" title={item.commitSha} className="font-mono">{item.commitSha.slice(0, 7)}</span>
      : vazio("Não informado")],
  ];
  return <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 text-ui">
    {linhas.map(([rotulo, valor]) => <div key={rotulo} className="contents">
      <dt className="font-medium text-fg-secondary">{rotulo}</dt>
      <dd className="min-w-0 break-words text-fg">{valor}</dd>
    </div>)}
  </dl>;
}

/**
 * O histórico do item (26/10/2026): criação, cada campo alterado, situação e
 * anexos, com autor e horário. Recolhível e fechado ao abrir (regra do Kauan,
 * 08/10/2026), com o resumo na linha.
 */
function HistoricoDoItem({ item }: { item: Item }) {
  const eventos = [
    ...item.changes.map(c => ({ id: c.id, createdAt: c.createdAt, authorName: c.authorName, changes: c.changes as unknown as Alteracao[], version: c.version as number | null, arquivo: null as string | null })),
    ...item.attachments.map(a => ({ id: a.id, createdAt: a.createdAt, authorName: a.uploadedByName, changes: null, version: null, arquivo: a.fileName })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (b.version ?? -1) - (a.version ?? -1));
  const ultimo = eventos[0];
  return <BlocoRecolhivel className="min-w-0 bg-surface shadow-xs" classeDoConteudo="px-4 pb-4 pt-1 flex flex-col gap-4"
    titulo={<span className="inline-flex items-center gap-2"><History size={14} aria-hidden className="shrink-0 text-fg-muted" />Histórico do item</span>}
    resumo={ultimo ? `${eventos.length} ${eventos.length === 1 ? "registro" : "registros"} · último em ${formatInstantDateTime(ultimo.createdAt)}` : "Sem registros"}>
    <ol className="flex flex-col" aria-label="Histórico do item">{eventos.map(e => {
      const Icone = e.arquivo ? Paperclip : e.version === 0 ? Plus : PencilLine;
      return <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0 min-w-0 before:absolute before:left-[13px] before:top-8 before:bottom-1 before:w-px before:bg-border last:before:hidden">
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-secondary"><Icone size={14} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-ui text-fg break-words"><span className="font-medium">{e.authorName}</span> <span className="text-fg-secondary">{e.arquivo ? <>anexou <span className="font-medium text-fg">{e.arquivo}</span></> : e.version === 0 ? "criou o item" : e.changes!.length === 1 ? "alterou 1 campo" : `alterou ${e.changes!.length} campos`}</span></p>
          <time dateTime={e.createdAt.toISOString()} className="text-helper text-fg-muted">{formatInstantDateTime(e.createdAt)}</time>
          {e.changes && <MudancasDoRegistro changes={e.changes} criacao={e.version === 0} />}
        </div>
      </li>;
    })}</ol>
    <Button variant="ghost" size="sm" className="self-start" href={`${ROTA_TECH_INTERNO}/historico`}><History size={14} aria-hidden />Histórico do módulo</Button>
  </BlocoRecolhivel>;
}
