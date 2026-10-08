// A moldura das telas de entrada: login, esqueci e nova senha.
//
// Nasceu no portal do cliente (02/10/2026); em 06/10/2026 o Kauan decidiu que
// a entrada da equipe ganha o mesmo visual, com um carrossel próprio. O que
// muda entre os dois é o rótulo acima do título e o carrossel — ver
// `portal/MolduraDoPortal` e `login/MolduraDaEquipe`.
//
// - No computador, duas metades: o formulário sobre um fundo com a textura da
//   marca, e o carrossel do que a pessoa encontra lá dentro.
// - No celular, o topo na cor da marca com o logo e o título, e o cartão do
//   formulário sobreposto a ele. O carrossel fica só no computador.
//
// O formulário entra como `children` e vem dentro de um cartão (`ui/Card`): no
// celular é ele que se sobrepõe ao topo azul.

const GRADE = {
  backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
  backgroundSize: "40px 40px",
};

export function MolduraDeEntrada({
  rotulo,
  titulo,
  subtitulo,
  carrossel,
  children,
}: {
  /** Acima do título: de quem é esta entrada ("Portal do Cliente", "Área da equipe"). */
  rotulo: string;
  titulo: string;
  subtitulo: string;
  carrossel: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
      <main className="relative isolate flex flex-col lg:min-h-dvh">
        {/* Celular: topo na cor da marca. */}
        <div
          className="lg:hidden relative overflow-hidden px-6 pt-8 pb-28 text-white"
          style={{ background: "linear-gradient(165deg, var(--c41-brand-600), var(--c41-brand-900))" }}
        >
          <div aria-hidden className="absolute inset-0 opacity-[0.07]" style={GRADE} />
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-horizontal-dark.svg" alt="Connect" className="h-7 w-auto" />
            <p className="mt-7 text-fs-1 font-semibold uppercase tracking-[0.1em] text-white/60">{rotulo}</p>
            <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.01em] leading-tight">{titulo}</h1>
            <p className="mt-2 text-fs-4 leading-relaxed text-white/75 max-w-[36ch]">{subtitulo}</p>
          </div>
        </div>

        {/* Computador: pontilhado da marca que some para as bordas, e dois brilhos. */}
        <div aria-hidden className="hidden lg:block absolute inset-0 -z-10 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--c41-brand-500) 30%, transparent) 1px, transparent 0)",
              backgroundSize: "22px 22px",
              maskImage: "radial-gradient(ellipse 75% 70% at 50% 45%, #000 20%, transparent 80%)",
            }}
          />
          <div
            className="absolute -top-40 -left-32 size-[520px] rounded-full blur-3xl"
            style={{ background: "color-mix(in srgb, var(--c41-brand-400) 22%, transparent)" }}
          />
          <div
            className="absolute -bottom-48 right-0 size-[460px] rounded-full blur-3xl"
            style={{ background: "color-mix(in srgb, var(--c41-brand-300) 18%, transparent)" }}
          />
        </div>

        <div className="hidden lg:flex absolute top-8 left-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-light.svg" alt="Connect" className="block dark:hidden h-8 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-dark.svg" alt="Connect" className="hidden dark:block h-8 w-auto" />
        </div>

        <div className="relative flex-1 flex flex-col items-center justify-start lg:justify-center px-4 lg:px-10 pb-10 lg:py-24 -mt-20 lg:mt-0">
          <div className="w-full max-w-[400px]">
            <div className="hidden lg:block mb-7">
              <p className="text-fs-2 font-semibold uppercase tracking-[0.08em] text-brand">{rotulo}</p>
              <h1 className="mt-2 text-fs-9 font-semibold text-fg tracking-[-0.015em] leading-tight [text-wrap:balance]">{titulo}</h1>
              <p className="mt-2 text-fs-4 leading-relaxed text-fg-secondary">{subtitulo}</p>
            </div>
            <div className="[&>*]:shadow-[0_20px_50px_-24px_rgba(18,52,125,0.35)]">{children}</div>
          </div>
        </div>
      </main>

      <aside
        className="hidden lg:flex relative overflow-hidden items-center justify-center px-12 xl:px-16 py-16"
        style={{ background: "radial-gradient(120% 90% at 85% 10%, var(--c41-brand-700), var(--c41-brand-900) 60%)" }}
      >
        <div aria-hidden className="absolute inset-0 opacity-[0.05]" style={GRADE} />
        <div
          aria-hidden
          className="absolute -bottom-40 -left-40 size-[520px] rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--c41-brand-500) 35%, transparent)" }}
        />
        {carrossel}
      </aside>
    </div>
  );
}
