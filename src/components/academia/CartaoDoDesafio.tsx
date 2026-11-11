import { CalendarCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatarPrecisao } from "@/lib/academia/ranking";
import { diasEmTexto } from "@/lib/academia/sequencia";
import type { DesafioDeHoje } from "@/lib/academia/tipos";
import { ChamaDaSequencia } from "./ChamaDaSequencia";

/**
 * O desafio do dia no Início da Academia (Fase 2, 11/11/2026): se já foi
 * feito, a sequência e o caminho para fazer.
 */
export function CartaoDoDesafio({ desafio, podeFazer }: { desafio: DesafioDeHoje; podeFazer: boolean }) {
  const { sequencia } = desafio;
  return (
    <Card as="section" aria-labelledby="desafio-do-dia-titulo" className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span aria-hidden className="flex size-10 flex-shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning-fg">
        <CalendarCheck size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="desafio-do-dia-titulo" className="flex flex-wrap items-center gap-2 text-body font-semibold text-fg">
          Desafio do dia {sequencia.atual > 0 && <ChamaDaSequencia dias={sequencia.atual} />}
        </h2>
        <p className="text-ui text-fg-secondary">
          {desafio.feitoHoje
            ? `Feito hoje${desafio.resultado ? `: ${desafio.resultado.ppm} PPM com ${formatarPrecisao(desafio.resultado.precisao)}% de precisão` : ""}. Amanhã tem outro.`
            : desafio.usadoHoje
              ? "Você começou o de hoje e não terminou. Amanhã tem outro."
              : "1 minuto de digitação, o mesmo texto para toda a equipe hoje. Fazer conta a sua sequência."}
        </p>
        {sequencia.maior > 1 && <p className="text-helper text-fg-muted">Sua maior sequência: {diasEmTexto(sequencia.maior)}.</p>}
      </div>
      {desafio.feitoHoje ? (
        <span className="inline-flex items-center gap-1 text-ui font-medium text-success-fg">
          <Check size={15} aria-hidden /> Feito
        </span>
      ) : (
        podeFazer &&
        !desafio.usadoHoje &&
        desafio.disponivel && (
          <Button href="/academia/desafio" className="min-h-11 self-start sm:min-h-0 sm:self-center">
            Fazer o desafio
          </Button>
        )
      )}
    </Card>
  );
}
