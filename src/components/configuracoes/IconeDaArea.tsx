import { Building2, CreditCard, Globe, Layers, Repeat, Sparkles, Users } from "lucide-react";
import type { AreaDeConfiguracao } from "@/lib/configuracoes/areas";

const ICONES = {
  predio: Building2,
  pessoas: Users,
  camadas: Layers,
  globo: Globe,
  repetir: Repeat,
  brilho: Sparkles,
  cartao: CreditCard,
} as const;

/** O desenho do ícone de uma área — o catálogo guarda só o nome, para passar do servidor ao menu. */
export function IconeDaArea({ icone, size = 16 }: { icone: AreaDeConfiguracao["icone"]; size?: number }) {
  const Icone = ICONES[icone];
  return <Icone size={size} aria-hidden />;
}
