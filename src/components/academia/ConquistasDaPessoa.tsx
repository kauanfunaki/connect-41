import {
  Award, CalendarCheck, Crown, Flame, Footprints, Gauge, Keyboard, Lock, Medal, PartyPopper, Puzzle, TrendingUp, Zap,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { nomeDoMes } from "@/lib/academia/regras";
import type { CodigoDaConquista, ConquistaNaTela } from "@/lib/academia/conquistas";

const ICONE: Record<CodigoDaConquista, LucideIcon> = {
  "primeiro-teste": Footprints,
  "primeiro-desafio": CalendarCheck,
  "sequencia-7": Flame,
  "sequencia-30": Zap,
  "ppm-40": Keyboard,
  "ppm-60": Gauge,
  "ppm-80": Gauge,
  "logica-perfeita": Puzzle,
  "atalhos-20": Award,
  podio: Medal,
  "primeiro-lugar": Crown,
  "maior-evolucao": TrendingUp,
};

/**
 * As conquistas (Fase 2, 11/11/2026): as medalhas por marcos, só para a
 * própria pessoa. As que faltam aparecem apagadas, com o que pedem.
 */
export function ConquistasDaPessoa({ conquistas, parabensNoMes, mes }: { conquistas: ConquistaNaTela[]; parabensNoMes: number; mes: string }) {
  const tem = conquistas.filter((c) => c.tem).length;
  return (
    <Card as="section" aria-labelledby="conquistas-titulo" className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="conquistas-titulo" className="flex items-center gap-2 text-body font-semibold text-fg">
          <Medal size={16} aria-hidden className="text-warning-fg" /> Conquistas
        </h2>
        <span className="text-helper text-fg-muted tabular-nums">
          {tem} de {conquistas.length}
        </span>
      </div>
      {parabensNoMes > 0 && (
        <p className="flex items-center gap-1.5 text-ui text-fg-secondary">
          <PartyPopper size={14} aria-hidden className="text-brand" />
          {parabensNoMes === 1 ? "1 colega deu" : `${parabensNoMes} colegas deram`} parabéns para você em {nomeDoMes(mes)}.
        </p>
      )}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {conquistas.map((c) => {
          const Icone = c.tem ? ICONE[c.codigo] : Lock;
          return (
            <li
              key={c.codigo}
              className={`flex items-start gap-2 rounded-md border p-2 ${c.tem ? "border-warning/30 bg-warning/8" : "border-border-soft bg-surface-2/60"}`}
            >
              <span aria-hidden className={`mt-0.5 flex-shrink-0 [&>svg]:size-4 ${c.tem ? "text-warning-fg" : "text-fg-muted"}`}>
                <Icone />
              </span>
              <span className="min-w-0">
                <span className={`block text-ui font-medium ${c.tem ? "text-fg" : "text-fg-muted"}`}>
                  {c.titulo}
                  <span className="sr-only">{c.tem ? " (conquistada)" : " (ainda não)"}</span>
                </span>
                <span className="block text-helper text-fg-muted">{c.descricao}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
