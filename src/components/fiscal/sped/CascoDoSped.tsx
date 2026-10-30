import type { ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { EmpresaDaTela } from "@/components/empresas/EmpresaDaTela";
import { ETAPAS_DO_SPED, caminhoDaEtapa, hrefDoSped, type EtapaDoSped } from "@/lib/fiscal/sped/etapas";
import type { TelaDoSped } from "@/lib/fiscal/sped/tela";
import { SeletorDeCompetencia } from "./SeletorDeCompetencia";

/**
 * O casco das quatro etapas do SPED ICMS/IPI (29/10/2026): o título, a
 * fileira da empresa e da competência (o mesmo seletor do BPO) e as etapas
 * numeradas, na ordem do trabalho do mês. Trocar de etapa leva a empresa e a
 * competência junto; trocar de empresa ou de mês volta a etapa ao começo.
 *
 * Sem empresa escolhida, o conteúdo dá lugar ao "Escolha uma empresa" do BPO.
 */
export function CascoDoSped({ tela, acao, children }: { tela: TelaDoSped; acao?: ReactNode; children: ReactNode }) {
  const { estabelecimento, competencia, etapa } = tela;
  const recorte = { empresa: estabelecimento?.companyId, competencia };
  const corpo = <>
    <PageHeader
      title="SPED"
      subtitle={estabelecimento ? `EFD ICMS/IPI de ${estabelecimento.companyNome} · ${estabelecimento.uf}${estabelecimento.matriz ? " · matriz" : ""}` : "EFD ICMS/IPI: classificar, apurar, fechar e gerar o arquivo do mês."}
      action={acao}
    />
    <FiltroDaEmpresa acao={caminhoDaEtapa(etapa)} empresas={tela.empresas} valor={estabelecimento?.companyId ?? null} foco={tela.foco} manter={{ competencia }}>
      <SeletorDeCompetencia competencia={competencia} />
    </FiltroDaEmpresa>
    <EtapasDoSped etapas={tela.etapas} atual={etapa} recorte={recorte} />
    {tela.erro && <div role="alert" className="mb-5"><Aviso tom="atencao">{tela.erro}</Aviso></div>}
    {!estabelecimento
      ? <EscolhaAEmpresa escolha={tela.escolha} porQue={tela.empresas.length ? "O SPED é de uma empresa por vez." : "Nenhuma empresa do escritório está cadastrada no motor SPED para a EFD ICMS/IPI. O cadastro é pelo CNPJ, em Fiscal › Configurações."} />
      : children}
  </>;
  return estabelecimento ? <EmpresaDaTela empresa={{ nome: estabelecimento.companyNome, cnpj: estabelecimento.cnpj }}>{corpo}</EmpresaDaTela> : corpo;
}

/**
 * As etapas como links numerados. As anteriores à atual aparecem como
 * percorridas (o ✓ só diz a ordem do trabalho, não que a etapa foi aceita).
 */
function EtapasDoSped({ etapas, atual, recorte }: { etapas: EtapaDoSped[]; atual: EtapaDoSped; recorte: { empresa?: string | null; competencia: string } }) {
  const lista = ETAPAS_DO_SPED.filter((e) => etapas.includes(e.chave));
  const indiceAtual = lista.findIndex((e) => e.chave === atual);
  return (
    <nav aria-label="Etapas do SPED" className="mb-6">
      <ol className="flex flex-wrap items-center gap-y-2">
        {lista.map((e, i) => {
          const esta = e.chave === atual;
          const antes = i < indiceAtual;
          return (
            <li key={e.chave} className="flex items-center">
              {i > 0 && <span aria-hidden className={`mx-2 h-px w-6 sm:w-10 ${antes || esta ? "bg-brand" : "bg-border-strong"}`} />}
              <Link
                href={hrefDoSped(e.chave, recorte)}
                aria-current={esta ? "step" : undefined}
                title={e.resumo}
                className={`group flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors focus-visible:outline-2 focus-visible:outline-brand ${esta ? "bg-brand-subtle" : "hover:bg-surface-hover"}`}
              >
                <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] text-helper font-semibold ${
                  esta ? "border-brand-solid bg-brand-solid text-on-brand" : antes ? "border-brand text-brand" : "border-border-strong text-fg-secondary"
                }`}>
                  {antes ? <Check size={14} aria-hidden /> : i + 1}
                </span>
                <span className={`text-ui font-semibold whitespace-nowrap ${esta ? "text-fg" : "text-fg-secondary group-hover:text-fg"}`}>{e.rotulo}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
