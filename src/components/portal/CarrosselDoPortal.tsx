"use client";

import { useEffect, useState } from "react";
import { Bell, Check, CheckCircle2, FileText, Paperclip, Search, ShieldCheck, Sparkles, TrendingUp, X } from "lucide-react";

// O carrossel do login do portal (02/10/2026): o que o cliente encontra lá
// dentro. Na primeira versão as quatro imagens seguiam o mesmo molde (a tela
// inclinada e um recorte à frente); no retorno do Kauan, cada slide ganhou uma
// cena própria, desenhada aqui em código — nítida em qualquer tela, sem
// imagem para baixar e sem dado de cliente: os nomes e valores são inventados.
//
// O painel é sempre azul da marca, nos dois temas: as cenas usam cartões
// claros com cores próprias, e não as do tema.

type Slide = { chave: string; titulo: string; texto: string; Cena: () => React.ReactNode };

const SLIDES: Slide[] = [
  {
    chave: "notas",
    titulo: "Suas notas, num lugar só",
    texto: "Notas emitidas e recebidas por todas as suas empresas — e, logo na entrada, o que está esperando por você.",
    Cena: CenaDasNotas,
  },
  {
    chave: "pendencias",
    titulo: "O que a equipe precisa de você",
    texto: "Cada pendência com prazo e situação. Você responde por aqui, com o arquivo junto, sem e-mail perdido no caminho.",
    Cena: CenaDasPendencias,
  },
  {
    chave: "aprovacoes",
    titulo: "Aprove pagamentos de onde estiver",
    texto: "As contas que dependem do seu ok chegam com o valor e o seu teto. Um clique e o escritório já sabe.",
    Cena: CenaDasAprovacoes,
  },
  {
    chave: "caixa",
    titulo: "O caixa da empresa, mês a mês",
    texto: "O que entrou, o que saiu e o que vence nas próximas semanas, sem precisar pedir relatório.",
    Cena: CenaDoCaixa,
  },
];

/** Tempo de cada slide na tela. */
const INTERVALO_MS = 6500;

export function CarrosselDoPortal() {
  const [atual, setAtual] = useState(0);
  // Parado com o mouse ou o foco do teclado em cima — e sempre, para quem
  // pediu menos movimento ao sistema.
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (pausado || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Um timer por slide, e não um intervalo fixo: escolher um slide pelos
    // pontinhos recomeça a contagem.
    const t = window.setTimeout(() => setAtual((i) => (i + 1) % SLIDES.length), INTERVALO_MS);
    return () => window.clearTimeout(t);
  }, [atual, pausado]);

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="O que você encontra no portal"
      className="relative w-full max-w-[640px] flex flex-col gap-10"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
    >
      <div className="grid">
        {SLIDES.map((s, i) => {
          const ativo = i === atual;
          return (
            <div
              key={s.chave}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${SLIDES.length}: ${s.titulo}`}
              aria-hidden={!ativo}
              inert={!ativo}
              data-ativo={ativo}
              className={`group/slide [grid-area:1/1] flex flex-col gap-10 transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${
                ativo ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
              }`}
            >
              {/* A cena é decorativa: o título e o texto embaixo dizem o que ela mostra. */}
              <div aria-hidden className="relative w-full aspect-[16/11] select-none">
                <s.Cena />
              </div>
              <div className="text-center max-w-[460px] mx-auto">
                <h2 className="text-[24px] font-semibold text-white tracking-[-0.01em] leading-snug [text-wrap:balance]">{s.titulo}</h2>
                <p className="mt-2.5 text-[14px] leading-relaxed text-white/70 [text-wrap:pretty]">{s.texto}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-2">
        {SLIDES.map((s, i) => (
          <button
            key={s.chave}
            type="button"
            onClick={() => setAtual(i)}
            aria-label={`Mostrar: ${s.titulo}`}
            aria-current={i === atual}
            className="group/ponto p-1.5 -m-1 rounded-full focus-visible:outline-2 focus-visible:outline-white/80"
          >
            <span
              className={`block h-2 rounded-full transition-all duration-300 ${
                i === atual ? "w-7 bg-white" : "w-2 bg-white/35 group-hover/ponto:bg-white/60"
              }`}
            />
          </button>
        ))}
      </div>

      <p className="text-center text-[11px] text-white/40 -mt-6">Ilustrações com dados fictícios.</p>
    </section>
  );
}

// ─── Peças das cenas ──────────────────────────────────────────────────────────

/** Cartão claro das cenas. `entrar` dá o atraso da entrada quando o slide fica ativo. */
function Cartao({ className = "", style, entrar = 0, children }: { className?: string; style?: React.CSSProperties; entrar?: number; children: React.ReactNode }) {
  return (
    <div
      className={`absolute rounded-2xl bg-white text-[#141824] shadow-[0_28px_60px_-18px_rgba(4,12,40,0.6)] ring-1 ring-black/5 transition-[opacity,translate] duration-700 ease-out motion-reduce:transition-none opacity-0 translate-y-4 group-data-[ativo=true]/slide:opacity-100 group-data-[ativo=true]/slide:translate-y-0 ${className}`}
      style={{ transitionDelay: `${entrar}ms`, ...style }}
    >
      {children}
    </div>
  );
}

function Selo({ cor, children }: { cor: "azul" | "verde" | "ambar" | "vermelho" | "violeta" | "cinza"; children: React.ReactNode }) {
  const cores = {
    azul: "bg-[#E8EFFD] text-[#1F5EEA]",
    verde: "bg-[#E2F5EC] text-[#0E7A55]",
    ambar: "bg-[#FBF0DC] text-[#9A5B00]",
    vermelho: "bg-[#FBE6E3] text-[#B3372C]",
    violeta: "bg-[#EFE8FB] text-[#6D3FC0]",
    cinza: "bg-[#EEF0F5] text-[#4B5468]",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${cores[cor]}`}>{children}</span>;
}

// ─── 1. Notas: um leque de documentos fiscais ─────────────────────────────────

function NotaFiscal({ tipo, cor, numero, emitente, valor, data }: { tipo: string; cor: "azul" | "verde" | "violeta"; numero: string; emitente: string; valor: string; data: string }) {
  return (
    <div className="p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Selo cor={cor}>{tipo}</Selo>
        <span className="text-[10.5px] text-[#6B7489] tabular-nums">Nº {numero}</span>
      </div>
      <p className="text-[13px] font-semibold leading-tight">{emitente}</p>
      <div className="border-t border-dashed border-[#DFE3EC]" />
      <div className="flex items-end justify-between">
        <span className="text-[10.5px] text-[#6B7489]">emitida em {data}</span>
        <span className="text-[16px] font-semibold tabular-nums">{valor}</span>
      </div>
    </div>
  );
}

function CenaDasNotas() {
  return (
    <>
      <Cartao className="left-[2%] top-[6%] w-[50%] -rotate-[4deg]" entrar={0}>
        <NotaFiscal tipo="CT-e" cor="verde" numero="1284" emitente="Distribuidora Serra Azul" valor="R$ 8.450,00" data="01/10" />
      </Cartao>
      <Cartao className="left-[25%] top-[30%] w-[50%] rotate-[1deg] z-10" entrar={120}>
        <NotaFiscal tipo="NF-e" cor="azul" numero="58712" emitente="Posto Central Rodovia" valor="R$ 2.345,50" data="28/09" />
      </Cartao>
      <Cartao className="right-[1%] top-[61%] w-[48%] rotate-[5deg] z-20" entrar={240}>
        <NotaFiscal tipo="NFS-e" cor="violeta" numero="412" emitente="Oficina do Paulo" valor="R$ 1.290,00" data="24/09" />
      </Cartao>
      <Cartao className="left-[2%] bottom-[6%] w-[44%] z-20 px-3.5 py-2.5 flex items-center gap-2" entrar={380}>
        <Search size={15} className="text-[#6B7489] flex-shrink-0" />
        <span className="text-[12.5px] text-[#6B7489] flex-1 truncate">Buscar nota ou CNPJ…</span>
        <span className="rounded-md bg-[#EEF0F5] px-1.5 py-0.5 text-[10px] font-semibold text-[#4B5468]">Filtros</span>
      </Cartao>
      <Cartao className="right-[3%] top-[10%] z-20 px-3 py-2 flex items-center gap-2 !rounded-full" entrar={520}>
        <Sparkles size={13} className="text-[#1F5EEA]" />
        <span className="text-[11.5px] font-semibold whitespace-nowrap">6 notas novas este mês</span>
      </Cartao>
    </>
  );
}

// ─── 2. Pendências: o celular, o aviso chegando e a resposta com anexo ────────

function CenaDasPendencias() {
  const itens: { titulo: string; prazo: string; selo: React.ReactNode }[] = [
    { titulo: "Confirmar o pagamento do aluguel", prazo: "venceu 26/09", selo: <Selo cor="vermelho">Vencida</Selo> },
    { titulo: "Enviar o extrato bancário de setembro", prazo: "até 06/10", selo: <Selo cor="ambar">Aguardando você</Selo> },
    { titulo: "Nota fiscal do frete de São Paulo", prazo: "até 03/10", selo: <Selo cor="azul">Com a equipe</Selo> },
  ];
  return (
    <>
      {/* O celular */}
      <Cartao className="right-[10%] top-0 h-full aspect-[9/17] !rounded-[30px] !bg-[#0E1426] p-[7px]" entrar={0}>
        <div className="h-full w-full rounded-[24px] bg-[#F5F6F9] overflow-hidden flex flex-col">
          <div className="flex justify-center pt-2">
            <span className="h-1 w-12 rounded-full bg-[#D3D8E3]" />
          </div>
          <div className="px-3.5 pt-3 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7489]">Grupo Modelo</p>
            <p className="text-[17px] font-semibold">Pendências</p>
          </div>
          <div className="px-2.5 flex flex-col gap-2">
            {itens.map((i) => (
              <div key={i.titulo} className="rounded-xl bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col gap-1.5">
                <p className="text-[11.5px] font-semibold leading-snug text-[#1F5EEA]">{i.titulo}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-[#6B7489]">{i.prazo}</span>
                  {i.selo}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Cartao>
      {/* O aviso chegando */}
      <Cartao className="left-[4%] top-[12%] w-[50%] z-10 p-3 flex items-start gap-2.5" entrar={300}>
        <span className="mt-0.5 inline-flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#1F5EEA] text-white">
          <Bell size={15} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-semibold">Nova pendência</span>
            <span className="text-[10px] text-[#6B7489]">agora</span>
          </span>
          <span className="block text-[11.5px] text-[#444D61] leading-snug">Enviar o extrato bancário de setembro</span>
        </span>
      </Cartao>
      {/* A resposta, com o arquivo */}
      <Cartao className="left-[10%] bottom-[10%] w-[46%] z-10 p-3 flex flex-col gap-2" entrar={520}>
        <span className="text-[11.5px] text-[#444D61]">Segue o extrato de setembro.</span>
        <span className="flex items-center gap-2 rounded-lg bg-[#F5F6F9] px-2.5 py-2">
          <Paperclip size={13} className="text-[#1F5EEA]" />
          <span className="text-[11.5px] font-semibold truncate">extrato-setembro.pdf</span>
        </span>
        <span className="self-end inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#0E7A55]">
          <Check size={12} /> Enviado à equipe
        </span>
      </Cartao>
    </>
  );
}

// ─── 3. Aprovações: a conta, os dois botões e a confirmação ───────────────────

function CenaDasAprovacoes() {
  return (
    <>
      {/* Uma segunda conta atrás, para dar fila */}
      <Cartao className="left-[16%] top-[8%] w-[68%] h-[46%] !bg-white/80 scale-[0.94]" entrar={0}>
        <span />
      </Cartao>
      <Cartao className="left-[10%] top-[16%] w-[80%] z-10 p-5 flex flex-col gap-4" entrar={120}>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B7489]">
            <ShieldCheck size={14} className="text-[#1F5EEA]" /> Aguardando a sua aprovação
          </span>
          <Selo cor="verde">Dentro do teto</Selo>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">OFICINA DO PAULO</p>
            <p className="text-[12px] text-[#6B7489]">Manutenção preventiva · Transportes Modelo</p>
            <p className="text-[11.5px] text-[#6B7489] mt-1">vence 09/10/2026</p>
          </div>
          <p className="text-[26px] font-semibold tabular-nums tracking-[-0.01em] whitespace-nowrap">R$ 1.560,00</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <span className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#0E7A55] text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(14,122,85,0.7)]">
            <Check size={15} /> Aprovar
          </span>
          <span className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#F1C9C4] text-[13px] font-semibold text-[#B3372C]">
            <X size={15} /> Reprovar
          </span>
        </div>
      </Cartao>
      <Cartao className="left-[4%] bottom-[8%] w-[38%] z-20 p-3 flex flex-col gap-1" entrar={320}>
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7489]">Seu teto</span>
        <span className="text-[16px] font-semibold tabular-nums">R$ 5.000,00</span>
        <span className="text-[10.5px] text-[#6B7489]">por conta · acima disso, outra pessoa aprova</span>
      </Cartao>
      <Cartao className="right-[4%] bottom-[4%] w-[54%] z-20 p-3 flex items-center gap-2.5" entrar={480}>
        <CheckCircle2 size={22} className="text-[#0E7A55] flex-shrink-0" />
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold">Pagamento aprovado</span>
          <span className="block text-[11px] text-[#6B7489] truncate">R$ 1.560,00 · o escritório já foi avisado</span>
        </span>
      </Cartao>
    </>
  );
}

// ─── 4. Caixa: entradas e saídas no gráfico e o saldo projetado ───────────────

function CenaDoCaixa() {
  const meses = ["Mai", "Jun", "Jul", "Ago", "Set", "Out"];
  const entradas = [12.4, 14.1, 13.2, 17.2, 15.8, 16.9];
  const saidas = [9.8, 11.2, 12.9, 8.5, 13.1, 12.2];
  const maior = 18;
  // Saldo acumulado, para a linha.
  const acumulado = entradas.reduce<number[]>((a, e, i) => [...a, (a[i - 1] ?? 0) + e - saidas[i]], []);
  const maiorSaldo = Math.max(...acumulado);
  const W = 300;
  const H = 120;
  const passo = W / meses.length;
  const linha = acumulado.map((v, i) => `${i === 0 ? "M" : "L"}${passo * i + passo / 2},${H - (v / maiorSaldo) * (H - 14) - 4}`).join(" ");
  return (
    <>
      <Cartao className="left-[5%] top-[5%] w-[90%] z-0 p-5 flex flex-col gap-3" entrar={0}>
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold">Fluxo de caixa</p>
          <span className="flex items-center gap-3 text-[10.5px] text-[#6B7489]">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-sm bg-[#0E7A55]" /> Entradas
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-sm bg-[#E0675B]" /> Saídas
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-3 rounded bg-[#1F5EEA]" /> Saldo
            </span>
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full h-auto">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#E9ECF3" strokeWidth="1" />
          ))}
          {meses.map((m, i) => {
            const x = passo * i + passo / 2;
            const he = (entradas[i] / maior) * H;
            const hs = (saidas[i] / maior) * H;
            return (
              <g key={m}>
                <rect x={x - 11} y={H - he} width="9" height={he} rx="2" fill="#0E7A55" opacity="0.9" />
                <rect x={x + 2} y={H - hs} width="9" height={hs} rx="2" fill="#E0675B" opacity="0.85" />
                <text x={x} y={H + 12} textAnchor="middle" fontSize="9" fill="#6B7489">
                  {m}
                </text>
              </g>
            );
          })}
          <path d={linha} fill="none" stroke="#1F5EEA" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          {acumulado.map((v, i) => (
            <circle key={i} cx={passo * i + passo / 2} cy={H - (v / maiorSaldo) * (H - 14) - 4} r="2.6" fill="#fff" stroke="#1F5EEA" strokeWidth="1.6" />
          ))}
        </svg>
      </Cartao>
      <Cartao className="left-[2%] bottom-[3%] w-[48%] z-10 p-4 flex flex-col gap-1" entrar={300}>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#6B7489]">
          <TrendingUp size={13} className="text-[#0E7A55]" /> Saldo projetado em 30 dias
        </span>
        <span className="text-[22px] font-semibold tabular-nums tracking-[-0.01em] text-[#0E7A55]">R$ 15.014,00</span>
        <span className="text-[10.5px] text-[#6B7489] tabular-nums">+R$ 36.700 a receber · −R$ 21.686 a pagar</span>
      </Cartao>
      <Cartao className="right-[3%] bottom-[10%] z-10 px-3 py-2 flex items-center gap-2 !rounded-full" entrar={480}>
        <FileText size={13} className="text-[#1F5EEA]" />
        <span className="text-[11.5px] font-semibold whitespace-nowrap">Relatório do mês pronto</span>
      </Cartao>
    </>
  );
}
