import { CalendarCheck, GitMerge, Target, Wallet } from "lucide-react";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { getAuthContext } from "@/lib/auth/context";
import { ABAS_DA_DRE, abasVisiveis, hrefDaAbaDaDre, type AbaDaDre } from "@/lib/dre/abasDaDre";
import { abasDaDreLiberadas } from "@/lib/dre/abasDaDreServidor";

const ICONES: Record<AbaDaDre, React.ReactNode> = {
  caixa: <Wallet />,
  competencia: <CalendarCheck />,
  analises: <GitMerge />,
  orcamento: <Target />,
};

/**
 * A fileira das quatro DREs (05/11/2026, escolha 6A do Kauan), logo abaixo do
 * cabeçalho "DRE" de cada uma. Leva a empresa e o mês da tela aberta; a aba
 * que a pessoa não abre (módulo desligado, setor de fora) não aparece, e com
 * uma aba só a fileira some.
 *
 * É a única fileira de abas da DRE (16/11/2026, melhoria-718). Na "Visão:
 * Cliente" (`visaoDoCliente`), Caixa e Competência seguem na visão do cliente:
 * é esta fileira que troca o regime, no lugar das abas que a prévia do portal
 * tinha dentro dela.
 */
export async function AbasDaDre({
  ativa,
  companyId,
  mes,
  visaoDoCliente,
}: {
  ativa: AbaDaDre;
  companyId: string;
  mes?: string | null;
  /** A tela está na visão do cliente; `ano` quando ela mostra o ano inteiro. */
  visaoDoCliente?: { ano?: string | null } | null;
}) {
  const liberadas = await abasDaDreLiberadas(await getAuthContext(), { visaoDoCliente: Boolean(visaoDoCliente) });
  const visiveis = abasVisiveis(liberadas, ativa);
  if (visiveis.length === 0) return null;
  return (
    <AbasDeLink
      aria-label="DREs"
      ativa={ativa}
      abas={ABAS_DA_DRE.filter((a) => visiveis.includes(a.chave)).map((a) => ({
        chave: a.chave,
        rotulo: a.rotulo,
        href: hrefDaAbaDaDre(a.chave, companyId, mes, visaoDoCliente),
        icone: ICONES[a.chave],
      }))}
    />
  );
}
