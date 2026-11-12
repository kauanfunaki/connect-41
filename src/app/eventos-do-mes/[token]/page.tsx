import { headers } from "next/headers";
import { CheckCircle2, Clock, Link2Off } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { hit, clientIp } from "@/lib/rateLimit";
import { nomeExibicao } from "@/lib/companyName";
import { nomeDaCompetencia } from "@/lib/dp2/tela";
import { CabecalhoPublico } from "@/components/publico/CabecalhoPublico";
import { TelaDeAvisoPublica } from "@/components/publico/TelaDeAvisoPublica";
import { FormularioDoDp2 } from "@/components/dp2/Formulario";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { enviarEventosDoMesAction } from "./actions";
import { pedidoValido, rubricasDoLink } from "./dados";

export const metadata = { title: "Eventos do mês" };
export const dynamic = "force-dynamic";

const UNIDADE: Record<string, string> = { HORAS: "horas", DIAS: "dias", VALOR: "R$" };

/**
 * Eventos do mês pelo cliente (12/11/2026, DP 2 fase 2): a empresa informa
 * horas extras, faltas, atrasos e comissões de cada colaborador, ou que não
 * houve nada, sem login. A maioria dos clientes não tem ponto eletrônico: é
 * por aqui que o mês chega ao DP.
 */
export default async function EventosDoMesPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ enviado?: string }> }) {
  const { token } = await params;
  const { enviado } = await searchParams;
  const ip = clientIp({ headers: await headers() });

  const r = await pedidoValido(token);
  if (!r.ok) {
    if (r.tipo === "invalido") hit(`eventos-do-mes-view-miss:${ip}`, 20, 10 * 60_000);
    return <TelaDeAvisoPublica icone={r.tipo === "vencido" ? <Clock /> : <Link2Off />} titulo={r.tipo === "fechada" ? "Folha já fechada" : "Link indisponível"} texto={r.motivo} />;
  }
  const { p } = r;
  const empresa = nomeExibicao(p.competencia.company);
  const mes = nomeDaCompetencia(p.competencia.ano, p.competencia.mes);
  if (enviado === "1") {
    return (
      <TelaDeAvisoPublica
        icone={<CheckCircle2 />}
        tom="sucesso"
        titulo="Recebido"
        texto={`Os eventos de ${mes} de ${empresa} chegaram ao escritório. Se precisar corrigir, abra o link de novo e envie outra vez: vale o último envio.`}
      />
    );
  }

  const prisma = getPrisma();
  const [tenant, pessoas, rubricas] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: p.tenantId }, select: { name: true, logoUrl: true } }),
    prisma.person.findMany({
      where: { tenantId: p.tenantId, currentCompanyId: p.competencia.companyId, isInternal: false, dp2Vinculo: { isNot: null } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    rubricasDoLink(p.tenantId),
  ]);

  return (
    <main className="c41-toque min-h-dvh py-10 px-4">
      <div className="max-w-5xl mx-auto">
        <CabecalhoPublico
          logo={tenant?.logoUrl ? { src: tenant.logoUrl, alt: tenant.name } : null}
          titulo={<>Eventos de {mes}</>}
          subtitulo={
            <>
              {empresa}: informe o que muda na folha deste mês. Horas em 10:30 ou 10,5; valores em reais. Deixe em branco o que não houve.
            </>
          }
        />

        {p.respondidoEm && (
          <p className="mt-6 rounded-md bg-success/10 text-success-fg text-fs-2 px-4 py-3">
            O escritório já recebeu um envio deste mês. Enviar de novo substitui o anterior.
          </p>
        )}
        <div className="bg-surface border border-border rounded-lg p-5 mt-6">
          <FormularioDoDp2 acao={enviarEventosDoMesAction} rotulo="Enviar ao escritório" rotuloEnviando="Enviando…">
            <input type="hidden" name="token" value={token} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-fs-3">
                <thead>
                  <tr>
                    <th className="py-2 pr-3 text-left font-medium text-fs-2 text-fg-muted">Colaborador</th>
                    {rubricas.map((r) => (
                      <th key={r.id} className="py-2 pr-3 text-left font-medium text-fs-2 text-fg-muted">
                        {r.nome}
                        <span className="block font-normal">{UNIDADE[r.lancamento] ?? ""}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pessoas.map((pessoa) => (
                    <tr key={pessoa.id} className="border-t border-border">
                      <td className="py-2 pr-3 font-medium whitespace-nowrap">{pessoa.name}</td>
                      {rubricas.map((r) => (
                        <td key={r.id} className="py-2 pr-3">
                          <Input
                            name={`q:${pessoa.id}:${r.id}`}
                            inputMode="decimal"
                            aria-label={`${r.nome} de ${pessoa.name}`}
                            placeholder={r.lancamento === "HORAS" ? "00:00" : r.lancamento === "DIAS" ? "0" : "0,00"}
                            className="w-24"
                            compact
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="block mt-4 text-fs-2 text-fg-muted" htmlFor="observacao">
              Algo mais que o escritório precisa saber (férias, afastamento, desligamento)?
            </label>
            <Textarea id="observacao" name="observacao" rows={3} className="mt-1" />
          </FormularioDoDp2>

          <FormularioDoDp2 acao={enviarEventosDoMesAction} rotulo="Não houve eventos neste mês" rotuloEnviando="Enviando…" variante="secondary" className="mt-4 pt-4 border-t border-border">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="semEventos" value="1" />
          </FormularioDoDp2>
        </div>
        {pessoas.length === 0 && (
          <p className="text-fs-2 text-fg-muted mt-4">
            Nenhum colaborador desta empresa está na folha do escritório ainda. Fale com o escritório.
          </p>
        )}
      </div>
    </main>
  );
}
