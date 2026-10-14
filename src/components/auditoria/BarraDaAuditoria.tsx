"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CampoPeriodo } from "@/components/ui/CampoPeriodo";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";

export type BotaoDeTipo = { chave: string; rotulo: string; total: number | null; href: string; ativo: boolean };

export type OpcaoDoChip = { valor: string; rotulo: string; total?: number; cor?: string; href: string; escolhida: boolean; nota?: string };

export type ChipDeLista = {
  chave: string;
  /** "Pessoa", "Área" — o rótulo em caixa alta do painel. */
  titulo: string;
  /** O que o chip diz: "Pessoa: todas", "Área: Fiscal". */
  rotulo: string;
  ativo: boolean;
  opcoes: OpcaoDoChip[];
};

export type ChipDoPeriodo = {
  rotulo: string;
  ativo: boolean;
  opcoes: OpcaoDoChip[];
  /** As datas escolhidas à mão, quando é o caso. */
  de: string;
  ate: string;
  /** O endereço sem o período, para "Aplicar" acrescentar as datas. */
  baseSemPeriodo: string;
};

/** Acima disto a lista do chip ganha busca — a regra do painel de filtros. */
const COM_BUSCA = 7;

const CLASSE_DO_CHIP =
  "inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-fs-2 font-medium whitespace-nowrap transition-colors";

function classeDoChip(ativo: boolean): string {
  return `${CLASSE_DO_CHIP} ${
    ativo ? "border-brand/40 bg-brand-subtle text-brand font-semibold" : "border-border-strong bg-surface text-fg-secondary hover:bg-surface-hover hover:text-fg"
  }`;
}

/**
 * A barra de filtros da auditoria (escolha "Auditoria · B" do Kauan,
 * 14/10/2026): a busca numa linha só, na largura toda, e embaixo os botões —
 * Tudo / Criou / Editou / Excluiu com a contagem, e Pessoa, Área e Período,
 * que abrem um painel no modelo do botão "Filtros" (rótulo em caixa alta e a
 * lista para escolher). Na página de alternativas a busca ficava solta na
 * ponta da fileira, numa altura diferente; aqui as duas linhas começam na
 * mesma borda e têm a mesma altura (32px).
 *
 * Cada escolha é um link: a URL guarda o filtro, e o voltar do navegador desfaz.
 */
export function BarraDaAuditoria({
  tipos,
  listas,
  periodo,
  hrefLimpar,
}: {
  tipos: BotaoDeTipo[];
  listas: ChipDeLista[];
  periodo: ChipDoPeriodo;
  hrefLimpar: string | null;
}) {
  return (
    <div className="flex flex-col gap-2.5 mb-6">
      <BuscaDaAuditoria />
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros da auditoria">
        {tipos.map((t) => (
          <Link key={t.chave} href={t.href} scroll={false} aria-current={t.ativo ? "true" : undefined} className={classeDoChip(t.ativo)}>
            {t.rotulo}
            {t.total !== null && <span className="tabular-nums font-semibold">{new Intl.NumberFormat("pt-BR").format(t.total)}</span>}
          </Link>
        ))}
        <span aria-hidden className="hidden sm:block w-px h-5 bg-border-strong mx-1" />
        {listas.map((l) => (
          <ChipComLista key={l.chave} chip={l} />
        ))}
        <ChipDePeriodo chip={periodo} />
        {hrefLimpar && (
          <Link
            href={hrefLimpar}
            scroll={false}
            className="inline-flex items-center gap-1 h-8 px-2 rounded-md text-fs-2 font-medium text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
          >
            <X size={13} aria-hidden /> Limpar filtros
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * A busca, que filtra enquanto se digita (350 ms depois da última tecla). Abrir
 * a busca volta a lista ao começo (sem dia aberto). Quando a URL muda por fora
 * — "Limpar filtros", o voltar do navegador — a caixa acompanha; a mudança que
 * a própria caixa mandou não volta para ela, para não comer a letra digitada
 * enquanto a tela recarrega.
 */
function BuscaDaAuditoria() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const daUrl = params.get("q") ?? "";
  const [valor, setValor] = useState(daUrl);
  const [enviado, setEnviado] = useState(daUrl);
  const [ultimaDaUrl, setUltimaDaUrl] = useState(daUrl);
  if (daUrl !== ultimaDaUrl) {
    setUltimaDaUrl(daUrl);
    if (daUrl !== enviado) {
      setValor(daUrl);
      setEnviado(daUrl);
    }
  }

  useEffect(() => {
    const limpo = valor.trim();
    if (limpo === daUrl) return;
    const t = setTimeout(() => {
      const q = new URLSearchParams(params.toString());
      if (limpo) q.set("q", limpo);
      else q.delete("q");
      for (const k of ["dia", "ver", "dias"]) q.delete(k);
      setEnviado(limpo);
      const s = q.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    }, 350);
    return () => clearTimeout(t);
    // Só a digitação dispara: a URL que muda por causa dela não pode reagendar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  return (
    <CampoDeBusca
      compact
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      placeholder="Buscar por empresa, pessoa, ação ou nome do cadastro"
      aria-label="Buscar na auditoria"
    />
  );
}

function GatilhoDoChip({ rotulo, ativo, open, toggle }: { rotulo: string; ativo: boolean; open: boolean; toggle: () => void }) {
  return (
    <button type="button" onClick={toggle} className={classeDoChip(ativo || open)}>
      {rotulo}
      <ChevronDown size={13} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

function ListaDeOpcoes({ opcoes, rotulo, close }: { opcoes: OpcaoDoChip[]; rotulo: string; close: () => void }) {
  const [busca, setBusca] = useState("");
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? opcoes.filter((o) => o.rotulo.toLowerCase().includes(q)) : opcoes;
  }, [opcoes, busca]);

  return (
    <div className="flex flex-col gap-1.5">
      {opcoes.length > COM_BUSCA && (
        <Input
          compact
          autoFocus
          icon={<Search />}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={`Buscar ${rotulo.toLowerCase()}…`}
          aria-label={`Buscar ${rotulo.toLowerCase()}`}
        />
      )}
      <ul className="scroll-y max-h-[260px] overflow-y-auto flex flex-col gap-0.5" aria-label={rotulo}>
        {visiveis.map((o) => (
          <li key={o.valor || "__todas"}>
            <Link
              href={o.href}
              scroll={false}
              onClick={close}
              aria-current={o.escolhida ? "true" : undefined}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-ui transition-colors ${
                o.escolhida ? "bg-brand-subtle text-brand font-medium" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
              }`}
            >
              {o.cor && <span aria-hidden className="size-2 rounded-full flex-shrink-0" style={{ background: o.cor }} />}
              <span className="min-w-0 flex-1 truncate">
                {o.rotulo}
                {o.nota && <span className="ml-1 text-fs-2 font-normal text-fg-muted">{o.nota}</span>}
              </span>
              {o.total !== undefined && <span className="text-fs-2 text-fg-muted tabular-nums">{o.total}</span>}
              {o.escolhida && <Check size={13} className="flex-shrink-0" aria-hidden />}
            </Link>
          </li>
        ))}
        {visiveis.length === 0 && <li className="px-2.5 py-2 text-fs-2 text-fg-muted">Nada encontrado para “{busca}”.</li>}
      </ul>
    </div>
  );
}

function ChipComLista({ chip }: { chip: ChipDeLista }) {
  return (
    <Dropdown width={290} trigger={({ open, toggle }) => <GatilhoDoChip rotulo={chip.rotulo} ativo={chip.ativo} open={open} toggle={toggle} />}>
      {({ close }) => (
        <div className="flex flex-col gap-2">
          <p className="c41-rotulo px-1">{chip.titulo}</p>
          <ListaDeOpcoes opcoes={chip.opcoes} rotulo={chip.titulo} close={close} />
        </div>
      )}
    </Dropdown>
  );
}

function ChipDePeriodo({ chip }: { chip: ChipDoPeriodo }) {
  const router = useRouter();
  const [datas, setDatas] = useState({ de: chip.de, ate: chip.ate });
  const completas = /^\d{4}-\d{2}-\d{2}$/.test(datas.de) && /^\d{4}-\d{2}-\d{2}$/.test(datas.ate);

  return (
    <Dropdown width={320} trigger={({ open, toggle }) => <GatilhoDoChip rotulo={chip.rotulo} ativo={chip.ativo} open={open} toggle={toggle} />}>
      {({ close }) => (
        <div className="flex flex-col gap-2">
          <p className="c41-rotulo px-1">Período</p>
          <ListaDeOpcoes opcoes={chip.opcoes} rotulo="Período" close={close} />
          <div className="border-t border-border pt-2.5 mt-1 flex flex-col gap-2">
            <p className="c41-rotulo px-1">Escolher as datas</p>
            <CampoPeriodo compact de={datas.de} ate={datas.ate} onChange={(p) => setDatas(p)} aria-label="Período da auditoria" />
            <Button
              size="sm"
              variant="secondary"
              disabled={!completas}
              onClick={() => {
                const q = new URLSearchParams(chip.baseSemPeriodo.split("?")[1] ?? "");
                q.set("periodo", "datas");
                q.set("de", datas.de);
                q.set("ate", datas.ate);
                close();
                router.push(`${chip.baseSemPeriodo.split("?")[0]}?${q.toString()}`, { scroll: false });
              }}
            >
              Aplicar as datas
            </Button>
          </div>
        </div>
      )}
    </Dropdown>
  );
}
