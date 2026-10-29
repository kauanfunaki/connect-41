import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { iconeDaAbaFiscal } from "@/components/fiscal/iconeDaAbaFiscal";
import { Aviso } from "@/components/ui/Aviso";
import { EmptyState } from "@/components/ui/EmptyState";
import { menuSped } from "@/lib/fiscal/menu-sped";
import { PAGINAS_FISCAIS } from "@/lib/fiscal/previa/cenario";
import { hrefDoMotor } from "@/lib/fiscal/motor/url";
import type { TelaDoMotor } from "@/lib/fiscal/motor/tela";
import { FiltroDoMotor } from "./FiltroDoMotor";

/**
 * O casco das telas fiscais com o motor real (22/10/2026): a mesma ordem da
 * prévia — menu contextual, abas internas, cabeçalho, recorte, avisos e
 * conteúdo —, com o recorte na URL e os avisos do motor no lugar dos da prévia.
 */
export function CascoDoMotor({ tela, caminho, abas, aba, titulo, descricao, acao, semEstabelecimento, children }: {
  tela: TelaDoMotor;
  caminho: string;
  abas?: { chave: string; rotulo: string }[];
  aba?: string;
  titulo: string;
  descricao: string;
  acao?: ReactNode;
  semEstabelecimento?: boolean;
  children: ReactNode;
}) {
  const { contexto, motor, mapa } = tela;
  const telas = menuSped(PAGINAS_FISCAIS.filter((p) => tela.modulos.includes(p.modulo)).map((p) => ({ code: p.modulo, href: p.caminho })), { motor: true }).telas;
  // A troca entre ICMS/IPI e PIS e COFINS, que na prévia é o campo "Obrigação da apuração" (26/10/2026).
  const obrigacoes = ([["fiscal_icms_ipi", "/fiscal/icms-ipi", "ICMS/IPI"], ["fiscal_contribuicoes", "/fiscal/contribuicoes", "PIS e COFINS"]] as const).filter(([modulo]) => tela.modulos.includes(modulo));
  const trocaDeObrigacao = (caminho === "/fiscal/icms-ipi" || caminho === "/fiscal/contribuicoes") && obrigacoes.length > 1;
  const menuPrincipal = ["/fiscal/classificacao", "/fiscal/icms-ipi", "/fiscal/contribuicoes", "/fiscal/configuracoes"].includes(caminho) && telas.length > 0;
  const ativa = telas.find((t) => t.href === `${caminho}?aba=${aba}`) ?? telas.find((t) => t.href === caminho);
  return <>
    {menuPrincipal && <AbasDeLink className="mb-5" aria-label="Telas do SPED" ativa={caminho === "/fiscal/contribuicoes" ? "Apuração" : ativa?.label ?? ""} abas={telas.map((t) => {
      const [base, query] = t.href.split("?");
      const extra = Object.fromEntries(new URLSearchParams(query ?? ""));
      return { chave: t.label, rotulo: t.label, href: hrefDoMotor(base, contexto, extra), icone: iconeDaAbaFiscal(t.label) };
    })} />}
    {trocaDeObrigacao && <AbasDeLink className="mb-5" aria-label="Obrigação da apuração" ativa={caminho} abas={obrigacoes.map(([, href, rotulo]) => ({ chave: href, rotulo, href: hrefDoMotor(href, contexto), icone: iconeDaAbaFiscal(rotulo) }))} />}
    {abas && abas.length > 1 && <AbasDeLink className="mb-5" aria-label={`Seções de ${titulo}`} ativa={aba ?? ""} abas={abas.map((a) => ({ chave: a.chave, rotulo: a.rotulo, href: hrefDoMotor(caminho, contexto, { aba: a.chave }), icone: iconeDaAbaFiscal(a.chave, a.rotulo) }))} />}
    <PageHeader title={titulo} subtitle={descricao} action={acao} />
    {contexto && <FiltroDoMotor raizes={motor.raizes} raiz={contexto.raiz} estabelecimentos={mapa.visiveis.map((e) => ({ id: e.id, rotulo: `${e.companyNome} · ${e.uf}${e.matriz ? " · matriz" : ""}${e.ativo ? "" : " · inativo"}` }))} estabelecimentoId={contexto.estabelecimentoId} competencia={contexto.competencia} semEstabelecimento={semEstabelecimento} />}
    <div className="mb-5 flex flex-col gap-3">
      {tela.erro && <div role="alert"><Aviso tom="atencao">{tela.erro}</Aviso></div>}
      {!motor.escrita && <Aviso tom="info">Escrita do SPED não habilitada: o Connect só consulta o motor. As ações ficam desabilitadas até o token de escrita ser configurado na integração.</Aviso>}
    </div>
    {!contexto
      ? <EmptyState title="Nenhuma raiz de CNPJ liberada" description="Este escritório ainda não tem raiz de CNPJ sincronizada com o SPED. Peça ao responsável pela integração para liberar a raiz do cliente piloto." />
      : children}
  </>;
}

/** Área que o motor ainda não expõe: escondida, nunca preenchida com dado fictício (§8.3). */
export function SemFonteNoMotor({ area }: { area: string }) {
  return <EmptyState title={`${area}: ainda não disponível no Connect`} description="O motor SPED ainda não expõe estes dados pela API. Continue usando o painel do motor para esta área; nada aqui é fictício." />;
}
