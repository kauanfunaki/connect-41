import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/shared/StatusDot";
import { PlanModulesEditor } from "@/components/admin/PlanModulesEditor";
import { TogglePlanoButton } from "@/components/admin/TogglePlanoButton";
import { EditarPlano, type PlanoParaEditar } from "./EditarPlano";
import { formatarReais } from "@/lib/format";
import { linhasDosSetores, modulosPorSetor, totalDeModulos } from "@/lib/planos/modulosPorSetor";
import type { CamposDoSite } from "@/lib/planos/site-regras";

export type PlanoDoCartao = PlanoParaEditar & {
  ativo: boolean;
  clientes: number;
  /** Em reais: o valor mensal, ou o valor por usuário. */
  valorEmReais: number;
  implantacaoEmReais: number;
  /** `null` = o plano libera o catálogo inteiro. */
  modulos: string[] | null;
};

type Props = {
  plano: PlanoDoCartao;
  /** `null` quando a tabela do site ainda não existe. */
  site: CamposDoSite | null;
  alternar: () => Promise<void>;
  atualizarModulos: (planId: string, moduleCodes: string[] | null) => Promise<void>;
};

/**
 * Um plano do catálogo como cartão (escolha A do Kauan para Planos,
 * 14/10/2026): modo, quantos clientes usam, nome, valor e implantação, e os
 * módulos que ele libera em cada setor, com uma barrinha ("BPO 8/17"). Era uma
 * linha de texto com os módulos escondidos atrás de um botão. A escolha módulo a
 * módulo continua na janela de antes ("Escolher módulos").
 *
 * Plano inativo fica apagado e tracejado: não aparece para novas assinaturas
 * nem no site.
 */
export function CartaoDoPlano({ plano, site, alternar, atualizarModulos }: Props) {
  const setores = modulosPorSetor(plano.modulos);
  const total = totalDeModulos(setores);
  const porUsuario = plano.cobranca === "PER_USER_MONTHLY";
  const noSite = plano.ativo && site?.mostrarNoSite ? site : null;

  return (
    <article
      aria-label={`Plano ${plano.nome}`}
      className={`flex min-w-0 flex-col gap-4 rounded-lg border bg-surface p-5 shadow-xs ${
        plano.ativo ? "border-border" : "border-dashed border-border-strong opacity-75"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={plano.modo === "MANAGED" ? "info" : "neutral"}>
            {plano.modo === "MANAGED" ? "Gerenciado pela 41 Tech" : "Autoatendimento"}
          </Badge>
          {!plano.ativo && <StatusDot color="var(--c41-fg-muted)" label="Inativo" />}
        </div>
        <span className="text-fs-2 text-fg-muted tnum">
          {plano.clientes} {plano.clientes === 1 ? "cliente" : "clientes"}
        </span>
      </div>

      <div className="min-w-0">
        <h2 className="font-display text-fs-8 font-semibold leading-tight tracking-[-0.01em] text-fg break-words">{plano.nome}</h2>
        {noSite && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-fs-2 font-medium text-brand">
            <Globe size={12} aria-hidden />
            No site · {noSite.ordem}º{noSite.destacar ? " · em destaque" : ""}
          </p>
        )}
      </div>

      <div>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-fs-8 font-semibold tnum text-fg">{formatarReais(plano.valorEmReais)}</span>
          <span className="text-ui text-fg-secondary">{porUsuario ? "por usuário/mês" : "por mês · valor fixo"}</span>
        </p>
        <p className="mt-0.5 text-fs-2 text-fg-muted">+ implantação {formatarReais(plano.implantacaoEmReais)}</p>
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="c41-rotulo">Módulos</span>
          <span className="text-ui font-semibold text-fg tnum">
            {total.liberados} de {total.total}
          </span>
        </div>
        <ul className="mt-2.5 space-y-1.5">
          {linhasDosSetores(setores).map((s) => {
            const pct = s.total ? Math.round((s.liberados / s.total) * 100) : 0;
            return (
              <li
                key={s.code}
                className={`grid grid-cols-[8px_minmax(0,1fr)_64px_40px] items-center gap-2 text-ui ${s.liberados === 0 ? "text-fg-muted" : "text-fg"}`}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: s.cor }} />
                <span className="truncate" title={s.rotulo}>
                  {s.rotulo}
                </span>
                <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: s.cor }} />
                </span>
                <span className="text-right tnum text-fg-secondary">
                  {s.liberados}/{s.total}
                </span>
              </li>
            );
          })}
        </ul>
        <PlanModulesEditor planId={plano.id} nomeDoPlano={plano.nome} allowedModuleCodes={plano.modulos} action={atualizarModulos} />
      </div>

      {!plano.ativo && <p className="text-fs-2 text-fg-muted">Não aparece para escolha nas assinaturas nem no site.</p>}

      <div className="mt-auto flex flex-wrap justify-end gap-2 pt-1">
        <TogglePlanoButton action={alternar} active={plano.ativo} nome={plano.nome} />
        <EditarPlano plano={plano} site={site} />
      </div>
    </article>
  );
}
