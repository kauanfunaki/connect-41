import {
  Award, CalendarCheck, Crown, Flame, Footprints, Gauge, Keyboard, Lock, Medal, PartyPopper, Puzzle, TrendingUp, Zap,
  type LucideIcon,
} from "lucide-react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
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
 *
 * Desde a melhoria-823 (25/11/2026), num bloco recolhível que começa fechado,
 * com "4 de 12" na linha: as doze medalhas abertas empurravam o resto do
 * Início para baixo.
 */
export function ConquistasDaPessoa({
  conquistas,
  parabensNoMes,
  mes,
  className = "",
}: {
  conquistas: ConquistaNaTela[];
  parabensNoMes: number;
  mes: string;
  className?: string;
}) {
  const tem = conquistas.filter((c) => c.tem).length;
  return (
    <BlocoRecolhivel
      className={`bg-surface shadow-xs ${className}`.trim()}
      classeDoConteudo="flex flex-col gap-3 px-4 pb-4"
      titulo={
        <span className="flex items-center gap-2 text-body">
          <Medal size={16} aria-hidden className="text-warning-fg" /> Conquistas
        </span>
      }
      resumo={`${tem} de ${conquistas.length}`}
    >
      {parabensNoMes > 0 && (
        <p className="flex items-center gap-1.5 text-ui text-fg-secondary">
          <PartyPopper size={14} aria-hidden className="text-brand" />
          {parabensNoMes === 1 ? "1 colega deu" : `${parabensNoMes} colegas deram`} parabéns para você em {nomeDoMes(mes)}.
        </p>
      )}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
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
    </BlocoRecolhivel>
  );
}
