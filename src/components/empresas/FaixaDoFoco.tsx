"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Crosshair, LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { opcoesDeEmpresa, type EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import { telaDoFoco } from "@/lib/empresas/foco";
import { empresasParaOFoco, pararDeTrabalharNaEmpresa, trabalharNaEmpresa } from "@/app/(app)/foco-actions";

/** O que a faixa mostra da empresa em foco — montado no layout. */
export type FocoDaFaixa = {
  companyId: string;
  nome: string;
  logoUrl: string | null;
  /** "com 21 filiais", "com a matriz e 20 filiais", ou `null` (empresa sozinha). */
  alcance: string | null;
};

// O foco que o layout leu, para a tela conferir (`ConferirFoco`) e abrir a
// escolha da faixa (`BotaoEscolherEmpresa`). `undefined` fora do casco do app.
//
// Envolve o casco inteiro, não só a tela (05/11/2026): a faixa é desenhada
// pelo casco, e o vazio "Escolha a empresa" de uma tela abre a janela dela.
type FocoDoLayout = {
  companyId: string | null;
  /** A pessoa pode trabalhar numa empresa por vez (a faixa aparece). */
  disponivel: boolean;
  escolhendo: boolean;
  abrirEscolha: () => void;
  fecharEscolha: () => void;
};
const FocoDoLayout = createContext<FocoDoLayout | undefined>(undefined);

export function ProvedorDoFoco({ companyId, disponivel, children }: { companyId: string | null; disponivel: boolean; children: React.ReactNode }) {
  const [escolhendo, setEscolhendo] = useState(false);
  // Trocada a empresa (aqui ou em outra aba), a janela de escolher fecha sozinha.
  const [deQual, setDeQual] = useState(companyId);
  if (deQual !== companyId) {
    setDeQual(companyId);
    setEscolhendo(false);
  }
  const valor = useMemo(
    () => ({ companyId, disponivel, escolhendo, abrirEscolha: () => setEscolhendo(true), fecharEscolha: () => setEscolhendo(false) }),
    [companyId, disponivel, escolhendo]
  );
  return <FocoDoLayout.Provider value={valor}>{children}</FocoDoLayout.Provider>;
}

/**
 * Confere a faixa com a tela (15/10/2026). O layout não é desenhado de novo a
 * cada navegação, e o foco trocado em outra aba deixaria a faixa dizendo uma
 * empresa e a tela mostrando outra — o erro que o foco existe para evitar.
 * Quando as duas discordam, pede ao servidor a tela inteira de novo, uma vez.
 */
export function ConferirFoco({ companyId }: { companyId: string | null }) {
  const doLayout = useContext(FocoDoLayout)?.companyId;
  const router = useRouter();
  const pediu = useRef(false);
  useEffect(() => {
    if (doLayout === undefined || doLayout === companyId || pediu.current) return;
    pediu.current = true;
    router.refresh();
  }, [doLayout, companyId, router]);
  return null;
}

/** O botão do vazio "Escolha a empresa" de uma tela: abre a janela da faixa. */
export function BotaoEscolherEmpresa() {
  const foco = useContext(FocoDoLayout);
  if (!foco?.disponivel) return null;
  return (
    <Button onClick={foco.abrirEscolha}>
      <Crosshair size={14} aria-hidden />
      Escolher empresa
    </Button>
  );
}

/**
 * A faixa da empresa (15/10/2026), logo abaixo do topo, nas telas que mostram
 * uma empresa por vez (`TELAS_DO_FOCO`). Desde 05/11/2026 é o único lugar de
 * escolher a empresa (pedido do Victor), e aparece também sem empresa
 * escolhida: "Nenhuma empresa escolhida" e o botão de escolher. Com empresa:
 * quem trabalha, em qual, e os dois caminhos — trocar ou sair (as telas voltam
 * a mostrar todas).
 *
 * Fora da rolagem, como a faixa da assinatura em modo de leitura: fica parada
 * no topo, e a tela de altura cheia só perde a altura dela (40px).
 */
export function FaixaDoFoco({ foco }: { foco: FocoDaFaixa | null }) {
  const caminho = usePathname();
  const tela = telaDoFoco(caminho);
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const doLayout = useContext(FocoDoLayout);
  if (!tela) return null;

  function sair() {
    iniciar(async () => {
      await pararDeTrabalharNaEmpresa();
      toast.success("As telas por empresa voltaram a mostrar todas as empresas.");
    });
  }

  return (
    <div
      role="region"
      aria-label="Empresa em que você está trabalhando"
      aria-busy={pendente || undefined}
      className={`flex-shrink-0 h-10 flex items-center gap-2 border-b border-brand/20 bg-brand/8 px-4 lg:px-6 transition-opacity ${pendente ? "opacity-60" : ""}`}
    >
      <Crosshair size={14} aria-hidden className="flex-shrink-0 text-brand" />
      {foco ? (
        <>
          <span className="hidden sm:inline flex-shrink-0 text-helper text-fg-secondary">Trabalhando em</span>
          <AvatarImage src={foco.logoUrl} name={foco.nome} size={20} shape="lg" fontSize={9} />
          <span className="min-w-0 truncate text-ui font-semibold text-fg" data-dica={foco.nome}>{foco.nome}</span>
          {foco.alcance && <span className="hidden md:inline flex-shrink-0 text-helper text-fg-muted whitespace-nowrap">· {foco.alcance}</span>}
        </>
      ) : (
        <>
          <span className="min-w-0 truncate text-ui font-semibold text-fg">Nenhuma empresa escolhida</span>
          <span className="hidden md:inline min-w-0 truncate text-helper text-fg-muted">· as telas mostram todas as empresas, onde podem</span>
        </>
      )}
      <div className="ml-auto flex flex-shrink-0 items-center gap-1">
        <Button
          variant={foco ? "ghost" : "secondary"}
          size="xs"
          onClick={() => doLayout?.abrirEscolha()}
          disabled={pendente}
          data-dica={foco ? "Trabalhar em outra empresa" : "Escolher a empresa em que você vai trabalhar"}
        >
          <ArrowLeftRight size={13} aria-hidden />
          {foco ? (
            <>
              Trocar<span className="hidden sm:inline"> empresa</span>
            </>
          ) : (
            "Escolher empresa"
          )}
        </Button>
        {foco && (
          <Button
            variant="ghost"
            size="xs"
            onClick={sair}
            disabled={pendente}
            data-dica="Parar de trabalhar nesta empresa: as telas por empresa voltam a mostrar todas"
          >
            <LogOut size={13} aria-hidden />
            Sair
          </Button>
        )}
      </div>
      {doLayout?.escolhendo && <TrocarEmpresa atual={foco?.companyId ?? null} onClose={doLayout.fecharEscolha} />}
    </div>
  );
}

type EmpresaDaLista = EmpresaParaEscolher & { nome: string };

/**
 * O que segue no endereço ao trocar de empresa (05/11/2026): o período e a aba
 * valem para qualquer empresa; o resto (a conta bancária, o centro de custo, a
 * busca, a página, o `?empresa=`) é da anterior e fica para trás.
 */
const PARAMETROS_QUE_SEGUEM = ["mes", "ano", "competencia", "aba", "secao", "visao", "vista", "tipo", "destino", "situacao"];

function enderecoParaOutraEmpresa(tela: string, atuais: URLSearchParams): string {
  const q = new URLSearchParams();
  for (const chave of PARAMETROS_QUE_SEGUEM) {
    const valor = atuais.get(chave);
    if (valor) q.set(chave, valor);
  }
  const s = q.toString();
  return s ? `${tela}?${s}` : tela;
}

/** A janela de escolher a empresa: a busca de sempre (nome ou CNPJ, logo, filial recuada). */
function TrocarEmpresa({ atual, onClose }: { atual: string | null; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={atual ? "Trabalhar em outra empresa" : "Escolher a empresa"}>
      <p className="text-ui text-fg-secondary mb-3">
        As telas por empresa passam a mostrar e gravar só a empresa escolhida, com a matriz e as filiais dela.
      </p>
      <EscolherEmpresaDoFoco atual={atual} onPronto={onClose} />
    </Modal>
  );
}

/**
 * A busca da empresa do foco, na janela da faixa (e, até 05/11/2026, no
 * seletor do topo). Escolhida a empresa, uma tela do foco volta só com o
 * período e a aba (`enderecoParaOutraEmpresa`); fora delas, a tela só é
 * desenhada de novo.
 */
export function EscolherEmpresaDoFoco({ atual, onPronto }: { atual: string | null; onPronto: () => void }) {
  const router = useRouter();
  const caminho = usePathname();
  const parametros = useSearchParams();
  const toast = useToast();
  const [empresas, setEmpresas] = useState<EmpresaDaLista[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const pediu = useRef(false);

  // A lista vem quando a janela abre — a faixa está em toda tela do foco.
  useEffect(() => {
    if (pediu.current) return;
    pediu.current = true;
    empresasParaOFoco()
      .then((r) => (r.ok ? setEmpresas(r.empresas) : setErro(r.erro)))
      .catch(() => setErro("Não deu para carregar as empresas. Feche e tente de novo."));
  }, []);

  function escolher(companyId: string) {
    if (!companyId) return;
    if (companyId === atual) return onPronto();
    setErro(null);
    iniciar(async () => {
      const r = await trabalharNaEmpresa(companyId);
      if (!r.ok) return setErro(r.erro);
      const tela = telaDoFoco(caminho);
      if (tela) router.replace(enderecoParaOutraEmpresa(tela, new URLSearchParams(parametros.toString())));
      else router.refresh();
      onPronto();
      toast.success(`Pronto: as telas por empresa agora mostram e gravam só ${r.descricao}.`);
    });
  }

  return (
    <>
      {erro && <Aviso className="mb-3">{erro}</Aviso>}
      {empresas === null ? (
        !erro && <p className="text-ui text-fg-muted">Carregando as empresas…</p>
      ) : (
        <div className={`transition-opacity ${pendente ? "opacity-60" : ""}`} aria-busy={pendente || undefined}>
          <SearchableSelect
            name="empresa"
            aria-label="Empresa"
            options={opcoesDeEmpresa(empresas)}
            avatar
            lembrarRecentes="empresas"
            defaultValue={atual ?? undefined}
            placeholder="Buscar empresa por nome ou CNPJ…"
            onChange={escolher}
          />
        </div>
      )}
    </>
  );
}
