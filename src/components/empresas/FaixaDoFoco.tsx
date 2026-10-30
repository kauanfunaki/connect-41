"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
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

// A empresa em foco que o layout leu, para a tela conferir (`ConferirFoco`).
// `undefined` fora do casco do app.
const FocoDoLayout = createContext<string | null | undefined>(undefined);

export function ProvedorDoFoco({ companyId, children }: { companyId: string | null; children: React.ReactNode }) {
  return <FocoDoLayout.Provider value={companyId}>{children}</FocoDoLayout.Provider>;
}

/**
 * Confere a faixa com a tela (15/10/2026). O layout não é desenhado de novo a
 * cada navegação, e o foco trocado em outra aba deixaria a faixa dizendo uma
 * empresa e a tela mostrando outra — o erro que o foco existe para evitar.
 * Quando as duas discordam, pede ao servidor a tela inteira de novo, uma vez.
 */
export function ConferirFoco({ companyId }: { companyId: string | null }) {
  const doLayout = useContext(FocoDoLayout);
  const router = useRouter();
  const pediu = useRef(false);
  useEffect(() => {
    if (doLayout === undefined || doLayout === companyId || pediu.current) return;
    pediu.current = true;
    router.refresh();
  }, [doLayout, companyId, router]);
  return null;
}

/**
 * A faixa da empresa em foco (15/10/2026), logo abaixo do topo, nas telas que
 * seguem o foco (`TELAS_DO_FOCO`): quem trabalha, em que empresa, e os dois
 * caminhos — trocar de empresa ou sair (as telas voltam a mostrar todas).
 *
 * Fora da rolagem, como a faixa da assinatura em modo de leitura: fica parada
 * no topo, e a tela de altura cheia só perde a altura dela (40px).
 */
export function FaixaDoFoco({ foco }: { foco: FocoDaFaixa }) {
  const caminho = usePathname();
  const tela = telaDoFoco(caminho);
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  // A janela de trocar é da empresa em que abriu: trocada a empresa (aqui ou
  // em outra aba), ela fecha sozinha.
  const [trocandoDe, setTrocandoDe] = useState<string | null>(null);
  if (!tela) return null;

  function sair() {
    iniciar(async () => {
      await pararDeTrabalharNaEmpresa();
      toast.success("As telas do BPO voltaram a mostrar todas as empresas.");
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
      <span className="hidden sm:inline flex-shrink-0 text-helper text-fg-secondary">Trabalhando em</span>
      <AvatarImage src={foco.logoUrl} name={foco.nome} size={20} shape="lg" fontSize={9} />
      <span className="min-w-0 truncate text-ui font-semibold text-fg" data-dica={foco.nome}>{foco.nome}</span>
      {foco.alcance && <span className="hidden md:inline flex-shrink-0 text-helper text-fg-muted whitespace-nowrap">· {foco.alcance}</span>}
      <div className="ml-auto flex flex-shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setTrocandoDe(foco.companyId)}
          disabled={pendente}
          data-dica="Trabalhar em outra empresa"
        >
          <ArrowLeftRight size={13} aria-hidden />
          Trocar<span className="hidden sm:inline"> empresa</span>
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={sair}
          disabled={pendente}
          data-dica="Parar de trabalhar nesta empresa: as telas do BPO voltam a mostrar todas"
        >
          <LogOut size={13} aria-hidden />
          Sair
        </Button>
      </div>
      {trocandoDe === foco.companyId && <TrocarEmpresa atual={foco.companyId} onClose={() => setTrocandoDe(null)} />}
    </div>
  );
}

type EmpresaDaLista = EmpresaParaEscolher & { nome: string };

/** A janela do "Trocar empresa": a busca de sempre (nome ou CNPJ, logo, filial recuada). */
function TrocarEmpresa({ atual, onClose }: { atual: string; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Trabalhar em outra empresa">
      <p className="text-ui text-fg-secondary mb-3">
        As telas do BPO passam a mostrar e gravar só a empresa escolhida, com a matriz e as filiais dela.
      </p>
      <EscolherEmpresaDoFoco atual={atual} onPronto={onClose} />
    </Modal>
  );
}

/**
 * A busca da empresa do foco, dividida entre o "Trocar empresa" da faixa e a
 * janela do seletor do topo (29/10/2026). Escolhida a empresa, uma tela do
 * foco volta limpa (o endereço da anterior ainda falaria da outra empresa:
 * `?empresa=`, a conta bancária, o centro de custo); fora delas, a tela só é
 * desenhada de novo, para o topo mostrar a empresa.
 */
export function EscolherEmpresaDoFoco({ atual, onPronto }: { atual: string | null; onPronto: () => void }) {
  const router = useRouter();
  const caminho = usePathname();
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
      if (tela) router.replace(tela);
      else router.refresh();
      onPronto();
      toast.success(`Pronto: as telas do BPO agora mostram e gravam só ${r.descricao}.`);
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
