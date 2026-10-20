import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { OpcoesDoDre } from "@/lib/dre/estrutura";

/**
 * As duas visões dos impostos sobre a receita (20/10/2026, pedido do Kauan):
 * no EBITDA, como a DRE da CARGO fecha — o padrão —, ou fora do resultado,
 * como a da Irriga. A escolha mora no endereço (`impostos=fora`), então vai
 * junto para a exportação e para quem recebe o link.
 */
export function SeletorDosImpostos({
  opcoes,
  base,
  params,
}: {
  opcoes: OpcoesDoDre;
  /** A tela ("/dre", "/dre/economica"). */
  base: string;
  /** O que o endereço já tem — empresa, mês, ano, visão —, para a troca não perder. */
  params: Record<string, string | undefined>;
}) {
  const href = (fora: boolean) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "impostos") q.set(k, v);
    if (fora) q.set("impostos", "fora");
    return q.size ? `${base}?${q}` : base;
  };
  return (
    <SegmentedControl
      label="Impostos sobre a receita"
      active={opcoes.impostosNoEbitda ? "dentro" : "fora"}
      items={[
        { key: "dentro", label: "Impostos no EBITDA", href: href(false), title: "O EBITDA e o resultado descontam os impostos sobre a receita." },
        { key: "fora", label: "Impostos fora do resultado", href: href(true), title: "Os impostos ficam só na receita líquida; o EBITDA parte da margem de contribuição." },
      ]}
    />
  );
}

/** O sufixo do endereço para a visão escolhida — o que os links da tela acrescentam. */
export function sufixoDosImpostos(opcoes: OpcoesDoDre): string {
  return opcoes.impostosNoEbitda ? "" : "&impostos=fora";
}
