import { AlertTriangle } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { DreDoCliente } from "@/components/dre/DreDoCliente";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import type { RegimeDaTela } from "@/lib/dre/visaoDaDre";

/**
 * A "Visão: Cliente" da DRE (21/10/2026, "Ver como o cliente"; nas telas de
 * Caixa e de Competência desde 16/11/2026, melhoria-718): o corpo de
 * `/portal/dre` desta empresa, só de leitura, no regime da aba de cima, com o
 * aviso quando o escritório bloqueou a tela para os clientes.
 *
 * Morava em `app/(app)/dre/page.tsx`, numa moldura "Prévia do portal": a
 * prévia tinha as próprias abas (Caixa | Competência) e o próprio filtro, e a
 * moldura separava as duas navegações. Sem as abas de dentro, o mês entra na
 * fileira dos filtros ao lado de "Visão" (`naFileira`), e o selo ao lado dela
 * diz que é a tela do portal.
 */
export async function ComoOClienteVe({
  tenantId,
  companyId,
  regime,
  params,
  naFileira,
}: {
  tenantId: string;
  companyId: string;
  regime: RegimeDaTela;
  /** `mes` ("AAAA-MM") e `ano` do endereço, no formato do portal. */
  params: { mes?: string; ano?: string };
  /** O seletor "Visão", na fileira do mês. */
  naFileira: React.ReactNode;
}) {
  const bloqueada = await telaBloqueadaNoPortal(tenantId, "/portal/dre");
  return (
    <>
      {bloqueada && (
        <Aviso tom="atencao" icone={<AlertTriangle />} className="mb-4">
          <span className="text-fg">
            Hoje o cliente <strong>não vê</strong> esta tela: a DRE está bloqueada no portal. Abaixo, o que ele veria se ela
            fosse liberada.
          </span>
        </Aviso>
      )}
      <DreDoCliente
        tenantId={tenantId}
        companyId={companyId}
        params={params}
        regimeDaTela={regime}
        acao={regime === "caixa" ? "/dre" : "/dre/economica"}
        manter={{ como: "cliente" }}
        naFileira={naFileira}
      />
    </>
  );
}
