import { Building2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SeletorDeEmpresaDaTela, type PropsDoSeletorDeEmpresa } from "./SeletorDeEmpresaDaTela";

/**
 * A fileira da empresa, logo abaixo do cabeçalho (13/10/2026): o seletor
 * primeiro e, na mesma linha, os outros filtros da tela (mês, ano, centro de
 * custo, "Filtros"). É a ordem que a família da DRE já usava — "empresa e
 * período, depois as abas" (padrão aceito pelo Kauan em 08/10/2026) —, agora
 * em todas as telas que mostram uma empresa por vez e nas pesadas.
 */
export function FiltroDaEmpresa({
  children,
  className = "mb-4",
  ...seletor
}: PropsDoSeletorDeEmpresa & { children?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`.trim()}>
      <SeletorDeEmpresaDaTela {...seletor} />
      {children}
    </div>
  );
}

/**
 * O lugar da tela quando ainda não há empresa escolhida: sem URL e sem última
 * empresa aberta, ou com uma empresa na URL que a tela não mostra. Nunca a
 * primeira da lista — escolher por alguém é como se grava na empresa errada.
 */
export function EscolhaAEmpresa({
  motivo,
  porQue = "Esta tela mostra uma empresa por vez.",
  todasHref,
}: {
  motivo: "nenhuma" | "invalida";
  /** A frase que explica por que a tela pede uma empresa. */
  porQue?: string;
  /** Onde a tela oferece "Todas as empresas", o atalho para elas. */
  todasHref?: string;
}) {
  return (
    <Card>
      <EmptyState
        icon={<Building2 />}
        title={motivo === "invalida" ? "Esta empresa não aparece nesta tela" : "Escolha uma empresa"}
        description={
          motivo === "invalida"
            ? "O endereço aponta para uma empresa que não existe mais, é de outro escritório ou não entra nesta tela. Escolha a empresa no campo acima."
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
