import Link from "next/link";
import { AlertTriangle, Bot, CalendarClock, FileWarning, PauseCircle, ShieldCheck, Timer, ListChecks } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RegistrarCobranca } from "@/components/societario/RegistrarCobranca";
import { painelDoSocietario } from "@/lib/societario/painelDoSetorServidor";
import type { TipoDoItem } from "@/lib/societario/painelDoSetor";
import { formatarNumero, formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const ICONE: Record<TipoDoItem, React.ReactNode> = {
  parado: <PauseCircle size={16} aria-hidden />,
  exigencia: <FileWarning size={16} aria-hidden />,
  estourado: <Timer size={16} aria-hidden />,
  licenca: <CalendarClock size={16} aria-hidden />,
  certidao: <ShieldCheck size={16} aria-hidden />,
};

/**
 * O painel do Societário (04/11/2026, lote D dos ajustes de 03/11 — escolha A
 * da página de opções): seis números, cada um levando à lista dele, e a fila
 * "O que fazer hoje", da mais urgente para a menos, com a ação na linha. Era
 * preciso abrir cinco telas para saber o que fazer no dia.
 */
export default async function PainelDoSocietarioPage() {
  const { ctx } = await abrirTelaDoModulo("societario_painel");
  const agora = new Date();
  const [{ numeros: n, fila }, podeAgir] = await Promise.all([painelDoSocietario(ctx, agora), podeNoModulo(ctx, "societario_prazos", "agir")]);

  return (
    <PageContainer>
      <PageHeader
        title="Painel do Societário"
        subtitle={`O dia do setor numa tela: o que está parado, o que vence e o que pede alguém. ${formatInstantDate(agora, { weekday: "long", day: "2-digit", month: "2-digit" })}.`}
      />

      <FaixaDeTotais
        className="mb-6"
        itens={[
          { rotulo: "Protocolos parados", valor: formatarNumero(n.parados, 0), tom: n.parados > 0 ? "text-danger" : undefined, icone: <PauseCircle />, href: "/exigencias?aba=parados" },
          { rotulo: "Exigências em 7 dias", valor: formatarNumero(n.exigencias7, 0), tom: n.exigencias7 > 0 ? "text-warning-fg" : undefined, icone: <AlertTriangle />, href: "/exigencias" },
          { rotulo: "Processos estourados", valor: formatarNumero(n.estourados, 0), tom: n.estourados > 0 ? "text-danger" : undefined, icone: <Timer />, href: "/processos" },
          { rotulo: "Licenças a renovar", valor: formatarNumero(n.licencas, 0), tom: n.licencas > 0 ? "text-warning-fg" : undefined, icone: <CalendarClock />, href: "/licencas" },
          ...(n.positivas !== null
            ? [{ rotulo: "Certidões positivas", valor: formatarNumero(n.positivas, 0), tom: n.positivas > 0 ? "text-danger" : undefined, icone: <ShieldCheck />, href: "/certidoes?recorte=positivas" }]
            : []),
          ...(n.robo !== null
            ? [
                {
                  // Uma palavra curta no valor (04/11/2026): "respondendo" não cabia no cartão e virava "responden…".
                  rotulo: "Robô",
                  valor: n.robo === "ok" ? "OK" : "Parado",
                  detalhe: n.robo === "ok" ? "respondendo" : "sem sinal da máquina",
                  tom: n.robo === "ok" ? "text-success-fg" : "text-danger",
                  icone: <Bot />,
                  href: "/robo",
                },
              ]
            : []),
        ]}
      />

      <Card as="section" aria-labelledby="fila-do-dia" className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="fila-do-dia" className="text-section font-semibold text-fg">
            O que fazer hoje
          </h2>
          <span className="text-fs-2 text-fg-muted">da mais urgente para a menos</span>
        </div>
        {fila.length === 0 ? (
          <EmptyState icon={<ListChecks />} title="Nada pedindo atenção hoje" description="Nenhum protocolo parado, exigência na semana, processo estourado, licença a renovar ou certidão positiva." />
        ) : (
          <ul className="flex flex-col divide-y divide-border-soft">
            {fila.map((i) => (
              <li key={i.chave} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <span className={`shrink-0 ${i.tom === "perigo" ? "text-danger" : "text-warning-fg"}`}>{ICONE[i.tipo]}</span>
                <span className="min-w-0 flex-1">
                  <Link href={i.href} className="block truncate font-semibold text-fg transition-colors hover:text-brand">
                    {i.titulo}
                  </Link>
                  <span className="block text-fs-2 text-fg-muted break-words">{i.detalhe}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Selo tom={i.tom}>{i.selo}</Selo>
                  {i.protocoloId && podeAgir ? (
                    <RegistrarCobranca protocoloId={i.protocoloId} />
                  ) : (
                    <Button href={i.href} variant="secondary" size="sm">
                      Abrir
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-micro text-fg-muted">
          A ordem: protocolo parado e exigência vencendo primeiro; depois processo estourado, exigência da semana, licença vencida, certidão positiva e licença a
          renovar. A fila mostra até 40 itens; os números do alto contam todos.
        </p>
      </Card>
    </PageContainer>
  );
}
