import { Building2, Crosshair } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { EmptyState } from "@/components/ui/EmptyState";
import { todasNoFoco, type EscolhaDaEmpresa } from "@/lib/empresas/escolhaDaEmpresa";
import { descricaoDoFoco } from "@/lib/empresas/foco";
import type { FocoNaTela } from "@/lib/empresas/ultimaEmpresa";
import { SeletorDeEmpresaDaTela, type PropsDoSeletorDeEmpresa } from "./SeletorDeEmpresaDaTela";
import { SairDoFocoEAbrir } from "./BotoesDoFoco";

/**
 * A fileira da empresa, logo abaixo do cabeçalho (13/10/2026): o seletor
 * primeiro e, na mesma linha, os outros filtros da tela (mês, ano, centro de
 * custo, "Filtros"). É a ordem que a família da DRE já usava — "empresa e
 * período, depois as abas" (padrão aceito pelo Kauan em 08/10/2026) —, agora
 * em todas as telas que mostram uma empresa por vez e nas pesadas.
 *
 * `foco` (21/10/2026): nas telas do BPO, a empresa em foco que a tela leu
 * (`escolherEmpresaDaTela` com `comFoco`), ou `null` sem foco. Com ela, o
 * "Todas" vira "Todas da base" (a matriz e as filiais) — ou some, numa
 * empresa sem filial —, e o endereço que pedia outra empresa ganha o aviso.
 * Fora das telas do BPO, não vem.
 */
export function FiltroDaEmpresa({
  children,
  className = "mb-4",
  foco,
  ...seletor
}: PropsDoSeletorDeEmpresa & { children?: React.ReactNode; className?: string; foco?: FocoNaTela | null }) {
  const todas = foco && !todasNoFoco(Boolean(seletor.todas), seletor.empresas.length) ? undefined : seletor.todas;
  const fileira = (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`.trim()}>
      <SeletorDeEmpresaDaTela
        {...seletor}
        todas={todas}
        rotuloDeTodas={foco ? "Todas da base (matriz e filiais)" : undefined}
        focoDaTela={foco === undefined ? undefined : (foco?.companyId ?? null)}
      />
      {children}
    </div>
  );
  if (!foco?.pedida) return fileira;
  return (
    <>
      {fileira}
      <AvisoForaDoFoco foco={foco} />
    </>
  );
}

/**
 * O endereço pedia outra empresa (um link de notificação, um favorito), mas a
 * pessoa está trabalhando numa só: a tela fica na empresa em foco e diz isso,
 * com o caminho para abrir a outra — sair do foco, no mesmo endereço.
 */
function AvisoForaDoFoco({ foco }: { foco: FocoNaTela }) {
  return (
    <Aviso tom="atencao" icone={<Crosshair size={14} aria-hidden />} className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="min-w-0 flex-1">
        O endereço pedia {foco.pedida}, mas você está trabalhando só em {descricaoDoFoco(foco)}. A tela ficou nela.
      </span>
      <SairDoFocoEAbrir rotulo={`Sair do foco e abrir ${foco.pedida}`} />
    </Aviso>
  );
}

/**
 * O lugar da tela quando ainda não há empresa escolhida: sem URL e sem última
 * empresa aberta, ou com uma empresa na URL que a tela não mostra. Nunca a
 * primeira da lista — escolher por alguém é como se grava na empresa errada.
 */
export function EscolhaAEmpresa({
  escolha,
  porQue = "Esta tela mostra uma empresa por vez.",
  todasHref,
}: {
  /** A escolha da tela; só "escolher" diz por quê (sem empresa, ou a da URL não vale). */
  escolha: EscolhaDaEmpresa;
  /** A frase que explica por que a tela pede uma empresa. */
  porQue?: string;
  /** Onde a tela oferece "Todas as empresas", o atalho para elas. */
  todasHref?: string;
}) {
  const motivo = escolha.tipo === "escolher" ? escolha.motivo : "nenhuma";
  return (
    <Card>
      <EmptyState
        icon={<Building2 />}
        title={
          motivo === "invalida"
            ? "Esta empresa não aparece nesta tela"
            : motivo === "foco-fora-da-tela"
              ? "A empresa em que você está trabalhando não aparece nesta tela"
              : "Escolha uma empresa"
        }
        description={
          motivo === "invalida"
            ? "O endereço aponta para uma empresa que não existe mais, é de outro escritório ou não entra nesta tela. Escolha a empresa no campo acima."
            : motivo === "foco-fora-da-tela"
              ? "Nem ela nem a matriz e as filiais dela entram nesta tela. Para ver outra empresa, use “Trocar empresa” ou “Sair”, na faixa do topo."
              : `${porQue} Escolha no campo Empresa, acima — da próxima vez, a tela já abre na última empresa que você abriu.`
        }
        action={
          todasHref ? (
            <Button href={todasHref} variant="secondary">
              Ver todas as empresas
            </Button>
          ) : undefined
        }
      />
    </Card>
  );
}
