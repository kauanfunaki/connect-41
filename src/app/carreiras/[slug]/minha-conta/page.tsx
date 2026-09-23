import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CalendarClock, ClipboardList, Video } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatCalendarDate, formatInstantDate, formatInstantDateTime } from "@/lib/format";
import { cookieDaSessao, dadosDaConta, emailDaSessao } from "@/lib/carreiras/conta";
import { situacaoParaCandidato, type Tom } from "@/lib/carreiras/situacaoDoCandidato";
import { AtualizarDados, Desistir, PedirAcesso, PedirExclusao } from "@/components/carreiras/ContaDoCandidato";
import { sair } from "./actions";

export const dynamic = "force-dynamic";

// Página pessoal: fora do Google.
export const metadata: Metadata = { title: "Minhas candidaturas", robots: { index: false, follow: false } };

const COR_DO_TOM: Record<Tom, string> = {
  andamento: "bg-brand/10 text-brand border-brand/25",
  aprovada: "bg-success/10 text-success border-success/25",
  encerrada: "bg-surface-2 text-fg-secondary border-border",
  desistiu: "bg-surface-2 text-fg-muted border-border",
};

export default async function MinhaContaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getPrisma().tenant.findUnique({ where: { slug }, select: { id: true, name: true, logoUrl: true, active: true } });
  if (!tenant || !tenant.active) notFound();

  const agora = new Date();
  const email = await emailDaSessao(tenant.id, (await cookies()).get(cookieDaSessao(slug).nome)?.value);
  const conta = email ? await dadosDaConta(tenant.id, email, agora) : null;

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href={`/carreiras/${slug}`} className="text-[12px] text-fg-muted hover:text-fg transition-colors">
          ← Vagas abertas
        </Link>

        {!conta ? (
          <div className="mt-4 max-w-md mx-auto">
            <header className="mb-6 text-center">
              <h1 className="text-[22px] font-semibold text-fg tracking-[-0.01em]">Minhas candidaturas</h1>
              <p className="text-[13px] text-fg-muted mt-1">
                Acompanhe suas inscrições em {tenant.name}. Enviamos um link de acesso para o e-mail da inscrição — sem senha.
              </p>
            </header>
            <Card className="p-5">
              <PedirAcesso slug={slug} />
            </Card>
          </div>
        ) : (
          <>
            <header className="mt-4 mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-[22px] font-semibold text-fg tracking-[-0.01em]">Olá, {conta.nome.split(" ")[0]}</h1>
                <p className="text-[13px] text-fg-muted mt-1">Suas candidaturas em {tenant.name}.</p>
              </div>
              <form action={sair.bind(null, slug)}>
                <Button type="submit" variant="linkMuted" size="sm">Sair</Button>
              </form>
            </header>

            {conta.testes.length > 0 && (
              <Card className="p-5 mb-4">
                <h2 className="text-[14px] font-semibold text-fg mb-3 flex items-center gap-2">
                  <ClipboardList size={15} className="text-brand" /> Testes para responder
                </h2>
                <ul className="space-y-2">
                  {conta.testes.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[13px] text-fg">
                        {t.template?.name ?? (t.type === "DISC" ? "Perfil comportamental (DISC)" : "Teste")}
                        <span className="text-fg-muted text-[12px]"> · até {formatInstantDate(t.expiresAt)}</span>
                      </span>
                      <Link href={`/teste/${t.token}`} className="text-[13px] text-brand hover:underline">
                        Responder →
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <div className="space-y-3">
              {conta.candidaturas.map((c) => {
                const s = situacaoParaCandidato(c);
                const empresa = c.vaga.company.tradeName || c.vaga.company.name;
                return (
                  <Card key={c.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-[15px] font-semibold text-fg">{c.vaga.title}</h2>
                        <p className="text-[12px] text-fg-muted mt-0.5">
                          {empresa} · inscrição em {formatCalendarDate(c.createdAt)}
                        </p>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${COR_DO_TOM[s.tom]}`}>
                        {s.titulo}
                      </span>
                    </div>

                    {s.linhaDoTempo && (
                      <ol className="mt-4 grid grid-cols-4 gap-1" aria-label="Etapas do processo">
                        {s.linhaDoTempo.map((e) => (
                          <li key={e.rotulo} className="flex flex-col gap-1.5">
                            <span
                              className={`h-1.5 rounded-full ${e.estado === "futura" ? "bg-border" : "bg-brand"} ${e.estado === "atual" ? "animate-pulse" : ""}`}
                            />
                            <span className={`text-[11px] ${e.estado === "atual" ? "text-brand font-medium" : e.estado === "feita" ? "text-fg-secondary" : "text-fg-muted"}`}>
                              {e.rotulo}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}

                    {c.meetings.length > 0 && s.tom === "andamento" && (
                      <ul className="mt-4 space-y-2">
                        {c.meetings.map((m) => (
                          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                            <span className="text-[13px] text-fg flex items-center gap-2">
                              <CalendarClock size={14} className="text-brand" />
                              Entrevista em {formatInstantDateTime(m.startAt, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <a href={m.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] text-brand hover:underline inline-flex items-center gap-1">
                              <Video size={13} /> Entrar na reunião
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}

                    {s.podeDesistir && (
                      <div className="mt-3">
                        <Desistir slug={slug} candidaturaId={c.id} vaga={c.vaga.title} />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            <Card className="p-5 mt-6">
              <h2 className="text-[14px] font-semibold text-fg mb-3">Meus dados</h2>
              <AtualizarDados slug={slug} telefone={conta.telefone} />
            </Card>

            <div className="mt-6 text-center">
              <PedirExclusao slug={slug} pedidoEm={conta.exclusaoPedidaEm ? formatInstantDate(conta.exclusaoPedidaEm) : null} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
