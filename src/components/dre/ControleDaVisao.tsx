import { Eye, Users } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Selo } from "@/components/ui/Selo";
import type { VisaoDaDre } from "@/lib/dre/visaoDaDre";

/**
 * "Visão: Equipe | Cliente" na fileira dos filtros da DRE de caixa e da de
 * competência (16/11/2026, melhoria-718, alternativa A do Kauan). Eram as abas
 * "DRE da equipe" e "Como o cliente vê", uma segunda fileira embaixo das
 * quatro DREs — o BPO achou poluído.
 *
 * Por link, como o "Período do relatório" ao lado: a troca navega sem
 * recarregar e o endereço continua copiável.
 *
 * Na visão do cliente, o selo diz o que o subtítulo dizia ("como aparece no
 * portal do cliente, só leitura"). Sem `equipe` — quem vê a competência do
 * cliente mas não abre a DRE econômica da equipe — fica só o selo.
 */
export function ControleDaVisao({
  ativa,
  equipe,
  cliente,
}: {
  ativa: VisaoDaDre;
  /** O endereço da visão da equipe; `null` quando a pessoa não a abre. */
  equipe: string | null;
  cliente: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {equipe && (
        <>
          {/* O nome à vista; para o leitor de tela, ele é o rótulo do grupo. */}
          <span aria-hidden className="text-ui font-medium text-fg-secondary">
            Visão
          </span>
          <SegmentedControl
            label="Visão"
            active={ativa}
            items={[
              { key: "equipe", label: "Equipe", href: equipe, icon: <Users size={14} aria-hidden /> },
              {
                key: "cliente",
                label: "Cliente",
                href: cliente,
                icon: <Eye size={14} aria-hidden />,
                title: "A DRE como aparece no portal do cliente",
              },
            ]}
          />
        </>
      )}
      {ativa === "cliente" && <Selo tom="marca">Como aparece no portal · só leitura</Selo>}
    </div>
  );
}
