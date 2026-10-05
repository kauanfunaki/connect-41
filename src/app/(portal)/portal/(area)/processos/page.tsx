import Link from "next/link";
import { notFound } from "next/navigation";
import { FileStack, Loader, TriangleAlert, Hourglass, CheckCircle2 } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { feriadosDoTenant } from "@/lib/societario/fila";
import { processosDoPortal, type ProcessoNoPortal } from "@/lib/societario/portal-data";
import { SITUACAO_PARA_CLIENTE, VARIANTE_PARA_CLIENTE } from "@/lib/societario/portal";
import { formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// "Aguardando você" desde 05/10: o Início leva direto aos processos parados
// esperando o cliente.
const RECORTES = [
  { chave: "abertos", rotulo: "Em andamento" },
  { chave: "aguardando", rotulo: "Aguardando você" },
  { chave: "encerrados", rotulo: "Encerrados" },
] as const;

const encerrado = (p: ProcessoNoPortal) => ["CONCLUIDO", "CANCELADO", "INDEFERIDO"].includes(p.situacao);

/**
 * Os processos societários das empresas do cliente: abertura, alteração,
 * baixa, alvará. O que ele quer saber é "em que pé está", então a situação e a
 * previsão vêm na linha; o resto fica no detalhe.
 */
export default async function PortalProcessosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { sessao, escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("societario_processos")) notFound();

  const params = await searchParams;
  const recorte = RECORTES.find((r) => r.chave === params.recorte)?.chave ?? "abertos";
  const feriados = await feriadosDoTenant(sessao.tenantId);
  const todos = await processosDoPortal(sessao.tenantId, escopo.companyIds ?? [], new Date(), feriados);

  const abertos = todos.filter((p) => !encerrado(p));
  const linhas =
    recorte === "abertos"
      ? abertos
      : recorte === "aguardando"
        ? abertos.filter((p) => p.situacao === "AGUARDANDO_CLIENTE")
        : todos.filter(encerrado);
  const variasEmpresas = new Set(todos.map((p) => p.empresaNome)).size > 1;
  const emExigencia = abertos.filter((p) => p.situacao === "EM_EXIGENCIA").length;
  const aguardandoVoce = abertos.filter((p) => p.situacao === "AGUARDANDO_CLIENTE").length;

  return (
    <PageContainer>
      <PortalCabecalho titulo="Processos" descricao="Abertura, alterações, baixa e licenças das suas empresas." />

      {/* Números que levam ao recorte, e o recorte no "Filtros" — eram abas
          (regra da conferência de 30/09). */}
      <FaixaDeTotais
        itens={[
          {
            rotulo: "Em andamento",
            valor: String(abertos.length),
            icone: <Loader />,
            detalhe: recorte === "abertos" ? "mostrando agora" : undefined,
            href: "/portal/processos",
          },
          {
            rotulo: "Com exigência do órgão",
            valor: String(emExigencia),
            tom: emExigencia > 0 ? "text-warning" : "",
            icone: <TriangleAlert />,
            href: "/portal/processos",
          },
          {
            rotulo: "Aguardando você",
            valor: String(aguardandoVoce),
            tom: aguardandoVoce > 0 ? "text-warning" : "",
            icone: <Hourglass />,
            detalhe: recorte === "aguardando" ? "mostrando agora" : undefined,
            href: "/portal/processos?recorte=aguardando",
          },
          {
            rotulo: "Encerrados",
            valor: String(todos.length - abertos.length),
            tom: "text-fg-muted",
            icone: <CheckCircle2 />,
            detalhe: recorte === "encerrados" ? "mostrando agora" : undefined,
            href: "/portal/processos?recorte=encerrados",
          },
        ]}
      />
      <FiltrosDaTela
        className="mb-4"
        campos={[
          {
            chave: "recorte",
            rotulo: "Situação",
            vazioLabel: "Em andamento",
            opcoes: [
              { value: "aguardando", label: "Aguardando você" },
              { value: "encerrados", label: "Encerrados" },
            ],
          },
        ]}
      />

      {linhas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileStack />}
            title={
              recorte === "abertos"
                ? "Nenhum processo em andamento"
                : recorte === "aguardando"
                  ? "Nenhum processo esperando você"
                  : "Nenhum processo encerrado"
            }
            description="Quando a equipe abrir um processo para a sua empresa, ele aparece aqui com cada etapa."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {linhas.map((p) => (
            <li key={p.id}>
              <Card className="p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex flex-col gap-0.5">
                  <Link href={`/portal/processos/${p.id}`} className="font-medium text-brand hover:underline break-words">
                    {p.titulo || p.tipoNome}
                  </Link>
                  <span className="text-[12px] text-fg-muted">
                    {p.titulo ? `${p.tipoNome} · ` : ""}
                    {variasEmpresas ? `${p.empresaNome} · ` : ""}
                    aberto em {formatInstantDate(p.iniciadoEm)}
                    {p.concluidoEm ? ` · concluído em ${formatInstantDate(p.concluidoEm)}` : ""}
                  </span>
                  {p.motivo && <span className="text-[12px] text-fg break-words">{p.motivo}</span>}
                  <span className="text-[12px] text-fg-muted">{p.previsao}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end shrink-0">
                  {p.progresso.total > 0 && (
                    <span className="text-[12px] text-fg-muted tabular-nums">
                      {p.progresso.feitas} de {p.progresso.total} etapas
                    </span>
                  )}
                  <Badge variant={VARIANTE_PARA_CLIENTE[p.situacao]}>{SITUACAO_PARA_CLIENTE[p.situacao].rotulo}</Badge>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
