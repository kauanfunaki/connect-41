import { notFound } from "next/navigation";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext } from "@/lib/auth/context";
import { getModuleDef, getModuleRoute } from "@/lib/module-catalog";
import { lerTelasEmManutencao } from "@/lib/manutencao/leitura";
import { quandoNoAviso } from "@/lib/manutencao/regras";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tela em manutenção" };

/**
 * O aviso de manutenção (13/11/2026). Ninguém chega aqui pelo menu: o proxy
 * mostra esta página no lugar da tela em manutenção, sem mudar o endereço
 * (`?tela=` diz qual é). O motivo e a previsão vêm do banco, frescos — a
 * lista do proxy pode estar alguns segundos atrás.
 *
 * Mesma linguagem do "não encontrado" (o disco com o anel tracejado), no tom
 * de atenção: não é erro de quem abriu, e não é vazio.
 */
export default async function TelaEmManutencao({ searchParams }: { searchParams: Promise<{ tela?: string }> }) {
  const { tela } = await searchParams;
  const def = tela ? getModuleDef(tela) : undefined;
  if (!tela || !def) notFound();

  const ctx = await getAuthContext();
  const { telas } = await lerTelasEmManutencao(ctx.tenantId);
  const aviso = telas.find((t) => t.moduleCode === tela);
  const endereco = getModuleRoute(tela) ?? `/setor/${def.sectorCode}/${tela}`;
  const agora = new Date();

  return (
    <PageContainer>
      <Card>
        <div className="py-14 px-6 flex flex-col items-center text-center">
          <span className="relative mb-5 inline-flex size-20 items-center justify-center">
            <span aria-hidden className="absolute inset-0 rounded-full border border-dashed border-warning/40" />
            <span aria-hidden className="absolute inset-3 rounded-full bg-warning-bg" />
            <Wrench aria-hidden className="relative size-6 text-warning-fg" />
          </span>

          {aviso ? (
            <>
              <h1 className="font-display text-fs-6 font-semibold text-fg tracking-[-0.01em] max-w-[36rem]">{def.label} está em manutenção</h1>
              <p className="text-label text-fg-secondary max-w-[30rem] mt-1.5 leading-relaxed">
                A Tech está corrigindo um problema nesta tela. Enquanto isso ela fica fechada, para ninguém trabalhar com informação
                errada. O que já foi lançado continua guardado.
              </p>

              {aviso.motivo && (
                <div className="mt-5 w-full max-w-[30rem] rounded-md border border-border bg-surface-2 px-4 py-3 text-left">
                  <p className="text-fs-1 font-medium text-fg-muted">O que está sendo corrigido</p>
                  <p className="mt-1 text-body text-fg whitespace-pre-line break-words">{aviso.motivo}</p>
                </div>
              )}

              <dl className="mt-5 grid w-full max-w-[30rem] grid-cols-1 gap-3 text-left sm:grid-cols-2">
                <div className="rounded-md border border-border px-4 py-3">
                  <dt className="text-fs-1 text-fg-muted">Em manutenção desde</dt>
                  <dd className="mt-0.5 text-ui font-medium text-fg">{quandoNoAviso(aviso.desde, agora)}</dd>
                </div>
                <div className="rounded-md border border-border px-4 py-3">
                  <dt className="text-fs-1 text-fg-muted">Previsão de volta</dt>
                  <dd className="mt-0.5 text-ui font-medium text-fg">
                    {aviso.previsao ? (
                      <>
                        {quandoNoAviso(aviso.previsao, agora)}
                        {aviso.previsao.getTime() < agora.getTime() && <span className="block text-fs-1 font-normal text-fg-muted">Passou do previsto: a Tech está terminando.</span>}
                      </>
                    ) : (
                      "Sem previsão ainda"
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <Button href="/home">Voltar ao início</Button>
                <Button href={endereco} variant="secondary">
                  Tentar de novo
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display text-fs-6 font-semibold text-fg tracking-[-0.01em] max-w-[36rem]">{def.label} já saiu da manutenção</h1>
              <p className="text-label text-fg-secondary max-w-[30rem] mt-1.5 leading-relaxed">
                A tela foi liberada agora há pouco. Se o aviso aparecer de novo ao abrir, espere alguns segundos e tente outra vez.
              </p>
              <div className="mt-6">
                <Button href={endereco}>Abrir {def.label}</Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </PageContainer>
  );
}
