import { Building2, Crosshair } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { EmptyState } from "@/components/ui/EmptyState";
import type { EscolhaDaEmpresa } from "@/lib/empresas/escolhaDaEmpresa";
import { descricaoDoFoco } from "@/lib/empresas/foco";
import type { FocoNaTela } from "@/lib/empresas/ultimaEmpresa";
import { AbrirOQueOLinkPedia } from "./BotoesDoFoco";
import { BotaoEscolherEmpresa, ConferirFoco } from "./FaixaDoFoco";

/**
 * A fileira dos filtros da tela, logo abaixo do cabeçalho: mês, ano, busca,
 * "Filtros". Até 05/11/2026 começava pelo seletor de empresa; agora a empresa
 * se escolhe só na faixa "Trabalhando em", acima da tela (pedido do Victor), e
 * a fileira fica com o resto — ou some, numa tela sem outro filtro.
 *
 * `foco`: a empresa em foco que a tela leu (`escolherEmpresaDaTela` com
 * `comFoco`), ou `null` sem foco. Com ela, o endereço que pedia outra empresa
 * ganha o aviso, e a tela confere com a faixa (o foco trocado em outra aba).
 */
export function FiltroDaEmpresa({
  children,
  className = "mb-4",
  foco,
}: {
  children?: React.ReactNode;
  className?: string;
  foco?: FocoNaTela | null;
}) {
  return (
    <>
      {foco !== undefined && <ConferirFoco companyId={foco?.companyId ?? null} />}
      {children && <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`.trim()}>{children}</div>}
      {foco?.pedida && <AvisoForaDoFoco foco={foco} />}
    </>
  );
}

/**
 * O endereço pedia outra empresa (um link de notificação, um favorito), mas a
 * pessoa está trabalhando em outra: a tela fica na empresa em foco e diz isso,
 * com o botão de passar a trabalhar na que o link pedia.
 */
function AvisoForaDoFoco({ foco }: { foco: FocoNaTela }) {
  const pedida = foco.pedida!;
  return (
    <Aviso tom="atencao" icone={<Crosshair size={14} aria-hidden />} className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="min-w-0 flex-1">
        O endereço pedia {pedida.nome}, mas você está trabalhando em {descricaoDoFoco(foco)}. A tela ficou nela.
      </span>
      <AbrirOQueOLinkPedia companyId={pedida.id} rotulo={pedida.id ? `Trabalhar em ${pedida.nome}` : "Sair e ver todas"} />
    </Aviso>
  );
}

/**
 * O lugar da tela quando ainda não há empresa: a faixa está sem empresa
 * escolhida e a tela mostra uma por vez. Nunca a primeira da lista — escolher
 * por alguém é como se grava na empresa errada.
 */
export function EscolhaAEmpresa({
  escolha,
  porQue = "Esta tela mostra uma empresa por vez.",
}: {
  /** A escolha da tela; só "escolher" diz por quê. */
  escolha: EscolhaDaEmpresa;
  /** A frase que explica por que a tela pede uma empresa. */
  porQue?: string;
}) {
  const motivo = escolha.tipo === "escolher" ? escolha.motivo : "nenhuma";
  const pedida = escolha.tipo === "escolher" ? escolha.pedida : undefined;
  const titulo =
    motivo === "invalida"
      ? "Esta empresa não aparece nesta tela"
      : motivo === "foco-fora-da-tela"
        ? "A empresa em que você está trabalhando não aparece nesta tela"
        : "Escolha uma empresa";
  const descricao =
    motivo === "sem-foco"
      ? pedida
        ? `${porQue} O endereço pedia ${pedida.nome ?? "uma empresa"}: escolha-a na faixa acima, em “Escolher empresa”, ou use o botão.`
        : `${porQue} Escolha a empresa na faixa acima, em “Escolher empresa”.`
      : motivo === "foco-fora-da-tela"
        ? "Nem ela nem a matriz e as filiais dela entram nesta tela. Para ver outra empresa, use “Trocar empresa” ou “Sair”, na faixa acima."
        : motivo === "invalida"
          ? "O endereço aponta para uma empresa que não existe mais, é de outro escritório ou não entra nesta tela."
          : `${porQue} A escolha da empresa está desligada para o seu setor (Configurações › Setores): abra a tela pelo link da empresa, ou peça para ligar.`;
  return (
    <Card>
      <EmptyState
        icon={<Building2 />}
        title={titulo}
        description={descricao}
        action={
          motivo === "sem-foco" ? (
            <div className="flex flex-wrap justify-center gap-2">
              {pedida && <AbrirOQueOLinkPedia companyId={pedida.id} rotulo={`Trabalhar em ${pedida.nome ?? "a empresa do link"}`} />}
              <BotaoEscolherEmpresa />
            </div>
          ) : undefined
        }
      />
    </Card>
  );
}
