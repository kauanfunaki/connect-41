import { notFound } from "next/navigation";
import { BookOpenCheck, FileText, FlaskConical, ListChecks, ScrollText } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { Aviso } from "@/components/ui/Aviso";
import { FormularioDoFechamento } from "@/components/revisao-contabil/FormularioDoFechamento";
import { ExcluirFechamento } from "@/components/revisao-contabil/AcoesDaRevisao";
import { AbaDocumentos } from "@/components/revisao-contabil/abas/AbaDocumentos";
import { AbaAnalise } from "@/components/revisao-contabil/abas/AbaAnalise";
import { AbaAchados } from "@/components/revisao-contabil/abas/AbaAchados";
import { AbaManual } from "@/components/revisao-contabil/abas/AbaManual";
import { AbaRelatorio } from "@/components/revisao-contabil/abas/AbaRelatorio";
import { carregarFechamento, rotuloDoFechamento } from "@/lib/revisao-contabil/servidor";
import { comAcompanhamento } from "@/lib/revisao-contabil/fechamento";
import { reportMarkdown } from "@/lib/revisao-contabil/motor/relatorio";
import { formatCalendarDate, formatCnpj, formatInstantDateTime } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";

export const dynamic = "force-dynamic";

const ABAS = ["documentos", "analise", "achados", "manual", "relatorio"] as const;
type Aba = (typeof ABAS)[number];

type Busca = { aba?: string; q?: string; gravidade?: string; natureza?: string };

// Um fechamento em revisão (05/11/2026): as telas Documentos, Inconsistências,
// Relatório e Manual do AudTool viraram abas de um fechamento só. Abre nos
// achados quando já há análise, e nos documentos quando ainda não há.
export default async function FechamentoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Busca> }) {
  const { ctx } = await abrirTelaDoModulo("contabil_revisao");
  const [{ id }, busca] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const dados = await carregarFechamento(ctx.tenantId, id);
  if (!dados) notFound();
  const [podeAgir, podeGerir] = await Promise.all([podeNoModulo(ctx, "contabil_revisao", "agir"), podeNoModulo(ctx, "contabil_revisao", "gerir")]);

  const { fechamento: f, execucao, valida, acompanhamento, autores } = dados;
  const r = execucao?.resultado ?? null;
  const aba: Aba = (ABAS as readonly string[]).includes(busca.aba ?? "") ? (busca.aba as Aba) : r ? "achados" : "documentos";
  const achados = (r?.findings ?? []).map((a) => comAcompanhamento(a, acompanhamento.get(a.id)));
  const abertos = achados.filter((a) => a.status !== "Corrigido aguardando reteste").length;
  const quarentena = new Set((r?.tests ?? []).filter((t) => t.id === "R01" && t.status === "Bloqueado").map((t) => t.source));
  const nome = nomeExibicao(f.company);
  const href = (a: Aba) => `/revisao-contabil/${f.id}?aba=${a}`;

  const abas = [
    { chave: "documentos", rotulo: "Documentos", href: href("documentos"), icone: <FileText size={16} aria-hidden />, contagem: f.documentos.length },
    { chave: "analise", rotulo: "Análise", href: href("analise"), icone: <FlaskConical size={16} aria-hidden /> },
    { chave: "achados", rotulo: "Inconsistências", href: href("achados"), icone: <ListChecks size={16} aria-hidden />, contagem: r ? abertos : undefined },
    { chave: "manual", rotulo: "Manual", href: href("manual"), icone: <BookOpenCheck size={16} aria-hidden /> },
    { chave: "relatorio", rotulo: "Relatório", href: href("relatorio"), icone: <ScrollText size={16} aria-hidden /> },
  ];

  const ultimaPor = f.execucoes[0]?.executadaPorId ? autores.get(f.execucoes[0].executadaPorId) : undefined;

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Revisão do fechamento", href: "/revisao-contabil" }, { label: nome }]} />
      <PageHeader
        title={nome}
        subtitle={`CNPJ ${formatCnpj(f.company.cnpj)} · ${formatCalendarDate(f.inicio)} a ${formatCalendarDate(f.fim)} · ${f.regime} · ${f.enquadramento}`}
        action={
          podeAgir || podeGerir ? (
            <div className="flex flex-wrap gap-2">
              {podeAgir && (
                <FormularioDoFechamento
                  modo="editar"
                  id={f.id}
                  companyId={f.companyId}
                  nomeDaEmpresa={nome}
                  inicio={f.inicio.toISOString().slice(0, 10)}
                  fim={f.fim.toISOString().slice(0, 10)}
                  regime={f.regime}
                  enquadramento={f.enquadramento}
                  finalidade={f.finalidade}
                />
              )}
              {podeGerir && <ExcluirFechamento id={f.id} nome={rotuloDoFechamento(f)} />}
            </div>
          ) : undefined
        }
      />

      {execucao && (
        <Aviso tom={valida ? "info" : "atencao"} className="mb-4">
          {valida
            ? `Análise de ${formatInstantDateTime(execucao.executadaEm)}${ultimaPor ? ` por ${ultimaPor}` : ""}: revisão documental parcial, nenhum ajuste lançado.`
            : "O fechamento, os documentos, as correções ou a tolerância mudaram depois da última análise. Os resultados abaixo são dela: execute a análise de novo."}
        </Aviso>
      )}

      <AbasDeLink abas={abas} ativa={aba} aria-label="Partes do fechamento" />

      {aba === "documentos" && <AbaDocumentos fechamentoId={f.id} documentos={f.documentos} quarentena={quarentena} podeAgir={podeAgir} />}
      {aba === "analise" && (
        <AbaAnalise
          fechamentoId={f.id}
          tolerancia={f.tolerancia}
          documentosAtivos={f.documentos.filter((d) => d.ativo).length}
          execucao={execucao}
          valida={valida}
          historico={f.execucoes}
          autores={autores}
          podeAgir={podeAgir}
        />
      )}
      {aba === "achados" && (
        <AbaAchados
          fechamentoId={f.id}
          execucaoId={execucao?.id ?? null}
          achados={achados}
          filtros={{ q: busca.q, gravidade: busca.gravidade, natureza: busca.natureza }}
          podeAgir={podeAgir}
        />
      )}
      {aba === "manual" && <AbaManual manual={r?.manual} />}
      {aba === "relatorio" && (
        <AbaRelatorio
          execucaoId={execucao?.id ?? null}
          markdown={r ? reportMarkdown(r, achados, Object.fromEntries(achados.map((a) => [a.id, a.nota]))) : null}
          valida={valida}
        />
      )}
    </PageContainer>
  );
}
