import { CalendarDays } from "lucide-react";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { Badge } from "@/components/ui/Badge";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { dataBR, hojeIso, lerAnoIso } from "@/lib/datas/calendario";
import { feriadosNacionais, juntarFeriados } from "@/lib/datas/feriadosNacionais";
import { AcoesDoItem } from "@/components/admin/AcoesDoItem";
import { NovoFeriado } from "@/components/admin/AddFeriadoForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { criarFeriado, excluirFeriado } from "./actions";

// Só as exceções se cadastram aqui (21/10/2026, pedido do Kauan de 15/10): os
// nacionais entram sozinhos, todo ano, calculados — a importação da BrasilAPI,
// que o admin fazia na virada do ano, saiu. A lista do ano mostra os dois, e
// só a exceção tem o "⋯".
export default async function FeriadosPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const anoAtual = Number(hojeIso().slice(0, 4));
  const pedido = lerAnoIso((await searchParams).ano);
  const ano = pedido && pedido >= 2000 && pedido <= 2100 ? pedido : anoAtual;

  const cadastrados = await getPrisma().holiday.findMany({
    where: { tenantId: ctx.tenantId, date: { gte: new Date(`${ano}-01-01`), lt: new Date(`${ano + 1}-01-01`) } },
    orderBy: { date: "asc" },
    select: { id: true, date: true, name: true },
  });
  const feriados = juntarFeriados(
    feriadosNacionais(ano),
    cadastrados.map((h) => ({ id: h.id, data: h.date.toISOString().slice(0, 10), nome: h.name }))
  );
  const excecoes = feriados.filter((f) => !f.automatico).length;

  return (
    <PageContainer>
      <PageHeader
        title="Feriados"
        subtitle={
          <>
            Os nacionais entram sozinhos todo ano. Cadastre aqui os estaduais, municipais, pontes e recessos do
            escritório.
          </>
        }
        action={<NovoFeriado action={criarFeriado} />}
      />

      <AbasDeLink
        ativa={String(ano)}
        abas={[anoAtual - 1, anoAtual, anoAtual + 1].map((a) => ({
          chave: String(a),
          rotulo: String(a),
          href: `/admin/feriados?ano=${a}`,
          icone: <CalendarDays />,
        }))}
      />

      <Card className="p-0 overflow-hidden">
        <p className="px-4 py-2.5 border-b border-border text-helper text-fg-muted">
          {feriados.length - excecoes} nacionais e {excecoes} exceç{excecoes === 1 ? "ão" : "ões"} do escritório em {ano}.
        </p>
        <div className="divide-y divide-border">
          {feriados.map((f) => (
            <div key={f.data} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <p className="min-w-0 text-fs-3 text-fg">{f.nome}</p>
              <div className="flex items-center gap-3 flex-shrink-0">
                <Badge variant={f.automatico ? "neutral" : "info"}>{f.automatico ? "Nacional · automático" : "Do escritório"}</Badge>
                <span className="text-fs-2 text-fg-muted tnum">{dataBR(f.data)}</span>
                {/* Excluir no "⋯" (polimento de 30/09); o nacional não tem o que editar,
                    e o espaço fica para a data alinhar com a das exceções. */}
                {f.id ? (
                  <AcoesDoItem
                    excluir={{
                      action: excluirFeriado.bind(null, f.id),
                      titulo: `Excluir o feriado "${f.nome}"?`,
                    }}
                  />
                ) : (
                  <span className="w-7" aria-hidden />
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </PageContainer>
  );
}
