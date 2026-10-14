"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, House, Menu, UserRound } from "lucide-react";
import { Contador } from "@/components/ui/Contador";
import { IconeDaArea } from "@/components/configuracoes/IconeDaArea";
import {
  INICIO_DAS_CONFIGURACOES,
  SUA_CONTA,
  localDaRota,
  type AreaDeConfiguracao,
  type ChaveDaArea,
  type MenuDasConfiguracoes as Menu_,
} from "@/lib/configuracoes/areas";

/**
 * O menu das configurações (escolha "Organização · A" do Kauan, 14/10/2026):
 * à esquerda de toda tela de configuração, com as áreas e as telas de cada
 * uma — de "Usuários" a "Feriados" sem voltar ao início.
 *
 * A área da tela aberta vem aberta; as outras mostram quantas telas têm e
 * abrem com um clique, sem sair da tela. No celular o menu vira um botão no
 * topo ("Usuários ▾") que abre a lista inteira.
 */
export function MenuDasConfiguracoes({ menu }: { menu: Menu_ }) {
  const pathname = usePathname();
  const aba = useSearchParams().get("aba");
  const local = localDaRota(pathname, aba, menu.areas);
  const noInicio = pathname === INICIO_DAS_CONFIGURACOES;
  const naConta = pathname === SUA_CONTA.rota || pathname.startsWith(`${SUA_CONTA.rota}/`);
  const areaAtual = local?.area.chave ?? null;

  const [abertas, setAbertas] = useState<Set<ChaveDaArea>>(() => new Set(areaAtual ? [areaAtual] : []));
  // Trocou de área pelo endereço (link de outra tela, voltar do navegador): a
  // nova abre, sem fechar a que a pessoa abriu à mão. Ajuste durante a
  // renderização, como o React recomenda para estado que segue uma prop.
  const [ultimaArea, setUltimaArea] = useState(areaAtual);
  if (areaAtual !== ultimaArea) {
    setUltimaArea(areaAtual);
    if (areaAtual && !abertas.has(areaAtual)) setAbertas(new Set([...abertas, areaAtual]));
  }

  const [celularAberto, setCelularAberto] = useState(false);
  const [ultimoCaminho, setUltimoCaminho] = useState(pathname);
  if (pathname !== ultimoCaminho) {
    setUltimoCaminho(pathname);
    setCelularAberto(false);
  }

  function alternar(chave: ChaveDaArea) {
    const novas = new Set(abertas);
    if (novas.has(chave)) novas.delete(chave);
    else novas.add(chave);
    setAbertas(novas);
  }

  const comuns = menu.areas.filter((a) => !a.soDaPlataforma);
  const daPlataforma = menu.areas.filter((a) => a.soDaPlataforma);
  const nomeDoLugar = noInicio ? "Visão geral" : naConta ? SUA_CONTA.rotulo : (local?.tela.rotulo ?? "Configurações");

  return (
    <>
      {/* Celular e tablet: um botão no topo com a tela aberta; a lista desce
          por cima do conteúdo e fecha ao escolher. */}
      <div className="lg:hidden px-6 pt-5">
        <button
          type="button"
          onClick={() => setCelularAberto((v) => !v)}
          aria-expanded={celularAberto}
          aria-controls="menu-das-configuracoes-celular"
          className="w-full flex items-center gap-3 h-11 px-3.5 rounded-lg border border-border-strong bg-surface text-left shadow-xs hover:bg-surface-hover transition-colors"
        >
          <Menu size={16} className="text-fg-muted flex-shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block c41-rotulo">Configurações</span>
            <span className="block text-ui font-semibold text-fg truncate">{nomeDoLugar}</span>
          </span>
          <ChevronDown
            size={16}
            aria-hidden
            className={`text-fg-muted flex-shrink-0 transition-transform ${celularAberto ? "rotate-180" : ""}`}
          />
        </button>
        {celularAberto && (
          <nav
            id="menu-das-configuracoes-celular"
            aria-label="Telas das configurações"
            className="c41-surgir mt-2 rounded-lg border border-border-strong bg-surface-elevated shadow-lg p-2 max-h-[70vh] overflow-y-auto scroll-y"
          >
            {menu.inicio && (
              <ItemPrincipal href={INICIO_DAS_CONFIGURACOES} ativo={noInicio} icone={<House size={16} aria-hidden />} rotulo="Visão geral" />
            )}
            {[...comuns, ...daPlataforma].map((area) => (
              <div key={area.chave} className="mt-2">
                <p className="flex items-center gap-2 px-2.5 py-1.5 c41-rotulo">
                  {area.rotulo}
                  {area.soDaPlataforma && <span className="normal-case tracking-normal font-normal">· só 41 Tech</span>}
                </p>
                {area.telas.map((t) => (
                  <ItemDaTela key={t.chave} href={t.href} rotulo={t.rotulo} ativo={local?.tela.chave === t.chave} recuo={false} />
                ))}
              </div>
            ))}
            <div className="my-2 h-px bg-border" />
            <ItemPrincipal href={SUA_CONTA.href} ativo={naConta} icone={<UserRound size={16} aria-hidden />} rotulo={SUA_CONTA.rotulo} />
          </nav>
        )}
      </div>

      {/* Computador: a coluna fixa à esquerda, que rola junto só se for maior que a tela. */}
      <nav
        aria-label="Menu das configurações"
        className="hidden lg:flex flex-col gap-0.5 w-[248px] flex-shrink-0 sticky top-0 self-start max-h-[calc(100dvh-4rem)] overflow-y-auto scroll-y pl-6 pr-1 pt-6 pb-8"
      >
        <p className="font-display text-card-title font-semibold text-fg px-2.5 pb-2.5">Configurações</p>
        {menu.inicio && (
          <ItemPrincipal href={INICIO_DAS_CONFIGURACOES} ativo={noInicio} icone={<House size={16} aria-hidden />} rotulo="Visão geral" />
        )}
        <div className="my-2.5 mx-1 h-px bg-border" />
        {comuns.map((area) => (
          <GrupoDaArea
            key={area.chave}
            area={area}
            aberta={abertas.has(area.chave)}
            atual={areaAtual === area.chave}
            telaAtual={local?.tela.chave ?? null}
            onAlternar={() => alternar(area.chave)}
          />
        ))}
        {daPlataforma.length > 0 && (
          <>
            <p className="c41-rotulo px-2.5 pt-3.5 pb-1.5">Só 41 Tech</p>
            {daPlataforma.map((area) => (
              <GrupoDaArea
                key={area.chave}
                area={area}
                aberta={abertas.has(area.chave)}
                atual={areaAtual === area.chave}
                telaAtual={local?.tela.chave ?? null}
                onAlternar={() => alternar(area.chave)}
              />
            ))}
          </>
        )}
        <div className="my-2.5 mx-1 h-px bg-border" />
        <ItemPrincipal href={SUA_CONTA.href} ativo={naConta} icone={<UserRound size={16} aria-hidden />} rotulo={SUA_CONTA.rotulo} />
      </nav>
    </>
  );
}

function ItemPrincipal({ href, ativo, icone, rotulo }: { href: string; ativo: boolean; icone: React.ReactNode; rotulo: string }) {
  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-ui transition-colors ${
        ativo ? "bg-brand-solid text-on-brand font-semibold" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
      }`}
    >
      <span className="flex-shrink-0">{icone}</span>
      {rotulo}
    </Link>
  );
}

function ItemDaTela({ href, rotulo, ativo, recuo = true }: { href: string; rotulo: string; ativo: boolean; recuo?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={`block py-1.5 pr-2.5 rounded-md text-ui transition-colors ${recuo ? "pl-[2.375rem]" : "pl-2.5"} ${
        ativo ? "bg-brand-subtle text-brand font-semibold" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
      }`}
    >
      {rotulo}
    </Link>
  );
}

function GrupoDaArea({
  area,
  aberta,
  atual,
  telaAtual,
  onAlternar,
}: {
  area: AreaDeConfiguracao;
  aberta: boolean;
  atual: boolean;
  telaAtual: string | null;
  onAlternar: () => void;
}) {
  const idDaLista = `area-do-menu-${area.chave}`;
  return (
    <div>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberta}
        aria-controls={idDaLista}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-ui text-left transition-colors hover:bg-surface-hover ${
          atual ? "text-fg font-semibold" : "text-fg-secondary hover:text-fg"
        }`}
      >
        <span className={`flex-shrink-0 ${atual ? "text-brand" : ""}`}>
          <IconeDaArea icone={area.icone} />
        </span>
        <span className="min-w-0 flex-1 truncate">{area.rotulo}</span>
        {aberta ? (
          <ChevronDown size={14} className="flex-shrink-0 text-fg-muted" aria-hidden />
        ) : (
          <Contador valor={area.telas.length} pequeno />
        )}
      </button>
      {aberta && (
        <div id={idDaLista} className="flex flex-col gap-0.5 pb-1">
          {area.telas.map((t) => (
            <ItemDaTela key={t.chave} href={t.href} rotulo={t.rotulo} ativo={telaAtual === t.chave} />
          ))}
        </div>
      )}
    </div>
  );
}
