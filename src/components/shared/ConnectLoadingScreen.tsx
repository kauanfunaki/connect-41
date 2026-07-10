// Tela de carregamento pós-login. Autocontida de propósito (estilos inline em
// <style>, sem depender de globals.css/Tailwind) porque o mesmo markup/CSS
// também é usado (via renderConnectLoadingScreenHTML, string simples — Next
// App Router bloqueia react-dom/server em Route Handlers) na página HTML de
// transição do login (src/app/api/auth/login-form/route.tsx), que não carrega
// o bundle CSS do app. Quando usado dentro do app normal via este componente
// React, os `var(--c41-*, fallback)` abaixo resolvem para os tokens reais do
// Design System V2 automaticamente.

export const CONNECT_LOADING_WORDS = [
  "empresas",
  "pessoas",
  "setores",
  "processos",
  "tarefas",
  "pipelines",
  "documentos",
  "dados",
  "empresas", // repete a primeira pro loop fechar sem salto
];

type Props = {
  words?: string[];
};

export function ConnectLoadingScreen({ words = CONNECT_LOADING_WORDS }: Props) {
  return (
    <div className="connect-loading-screen">
      <style>{CONNECT_LOADING_STYLES}</style>

      <div className="connect-loading-card">
        <div className="connect-loading-brand" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-light.svg" alt="" className="connect-loading-logo connect-loading-logo-light" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-dark.svg" alt="" className="connect-loading-logo connect-loading-logo-dark" />
        </div>

        <div className="connect-loading-visual" aria-hidden="true">
          <span className="connect-spinner" />

          <div className="connect-loader">
            <p className="connect-loading-label">Carregando</p>
            <div className="connect-loading-words">
              {words.map((w, i) => (
                <span key={`${w}-${i}`} className="connect-loading-word">
                  {w}
                </span>
              ))}
            </div>
          </div>

          <p className="connect-loading-static">Carregando plataforma</p>
        </div>

        <p className="connect-loading-subtitle">Preparando seu ambiente de trabalho</p>

        <p className="connect-loading-sr-only" role="status" aria-live="polite">
          Carregando plataforma Connect. Preparando seu ambiente de trabalho.
        </p>
      </div>
    </div>
  );
}

// Gera o mesmo markup do componente acima como string HTML pura — usado pela
// página de transição do login, que não pode importar react-dom/server nem
// renderizar um Client/Server Component (é um Route Handler devolvendo HTML
// bruto). Mantém uma única fonte de verdade para o CSS (CONNECT_LOADING_STYLES).
export function renderConnectLoadingScreenHTML(words: string[] = CONNECT_LOADING_WORDS): string {
  const wordsHtml = words
    .map((w) => `<span class="connect-loading-word">${w}</span>`)
    .join("");

  return `<div class="connect-loading-screen">
    <style>${CONNECT_LOADING_STYLES}</style>
    <div class="connect-loading-card">
      <div class="connect-loading-brand" aria-hidden="true">
        <img src="/brand/logo-horizontal-light.svg" alt="" class="connect-loading-logo connect-loading-logo-light" />
        <img src="/brand/logo-horizontal-dark.svg" alt="" class="connect-loading-logo connect-loading-logo-dark" />
      </div>
      <div class="connect-loading-visual" aria-hidden="true">
        <span class="connect-spinner"></span>
        <div class="connect-loader">
          <p class="connect-loading-label">Carregando</p>
          <div class="connect-loading-words">${wordsHtml}</div>
        </div>
        <p class="connect-loading-static">Carregando plataforma</p>
      </div>
      <p class="connect-loading-subtitle">Preparando seu ambiente de trabalho</p>
      <p class="connect-loading-sr-only" role="status" aria-live="polite">
        Carregando plataforma Connect. Preparando seu ambiente de trabalho.
      </p>
    </div>
  </div>`;
}

export const CONNECT_LOADING_STYLES = `
.connect-loading-screen {
  --cls-bg: var(--c41-canvas, #F4F3F7);
  --cls-surface: var(--c41-surface, #FFFFFF);
  --cls-border: var(--c41-border, #E4E1EA);
  --cls-fg: var(--c41-fg, #1C1A22);
  --cls-fg-muted: var(--c41-fg-muted, #8B8695);
  --cls-primary: var(--c41-brand, #243DA1);
  position: fixed;
  inset: 0;
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cls-bg);
  color: var(--cls-fg);
  z-index: 9999;
}

[data-theme="dark"] .connect-loading-screen {
  --cls-bg: var(--c41-canvas, #141219);
  --cls-surface: var(--c41-surface, #1C1A22);
  --cls-border: var(--c41-border, rgba(255,255,255,.08));
  --cls-fg: var(--c41-fg, #F5F3F8);
  --cls-fg-muted: var(--c41-fg-muted, #8B8695);
  /* mais claro que o --c41-brand padrão do app (brand-500) — aqui o azul
     precisa se destacar sozinho num fundo escuro, sem texto/borda ao redor
     pra ajudar no contraste, então usamos um degrau mais claro da escala. */
  --cls-primary: var(--c41-brand-400, #5468CE);
}

.connect-loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: 100%;
  max-width: 320px;
  padding: 40px 32px;
  border-radius: 20px;
  background: var(--cls-surface);
  border: 1px solid var(--cls-border);
  box-shadow: 0 20px 48px rgba(15, 12, 25, .14);
  text-align: center;
}

.connect-loading-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.connect-loading-logo {
  height: 22px;
  width: auto;
  object-fit: contain;
}

.connect-loading-logo-dark { display: none; }

[data-theme="dark"] .connect-loading-logo-light { display: none; }
[data-theme="dark"] .connect-loading-logo-dark { display: block; }

.connect-loading-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.connect-spinner {
  display: grid;
  width: 48px;
  height: 48px;
  border: 4px solid transparent;
  border-radius: 50%;
  border-right-color: var(--cls-primary);
  animation: connect-spin 1s infinite linear;
}

.connect-spinner::before,
.connect-spinner::after {
  content: "";
  grid-area: 1 / 1;
  margin: 2px;
  border: inherit;
  border-radius: 50%;
  animation: connect-spin 2s infinite;
}

.connect-spinner::after {
  margin: 8px;
  animation-duration: 3s;
}

@keyframes connect-spin {
  to { transform: rotate(1turn); }
}

.connect-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.connect-loading-label {
  margin: 0;
  font-weight: 600;
  font-size: 14.5px;
  color: var(--cls-fg);
  white-space: nowrap;
}

.connect-loading-words {
  /* px fixo, não em: container e word têm font-sizes diferentes, então
     alturas em "em" relativas a cada um divergiam e vazavam a próxima palavra
     por baixo do overflow:hidden. */
  overflow: hidden;
  height: 20px;
  line-height: 20px;
}

.connect-loading-word {
  display: block;
  height: 20px;
  line-height: 20px;
  font-weight: 600;
  font-size: 14.5px;
  color: var(--cls-primary);
  animation: connect-cycle-words 6.4s infinite;
}

.connect-loading-static {
  display: none;
  margin: 0;
  font-weight: 600;
  font-size: 14.5px;
  color: var(--cls-fg);
}

.connect-loading-subtitle {
  margin: 0;
  font-size: 12.5px;
  color: var(--cls-fg-muted);
}

.connect-loading-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes connect-cycle-words {
  5%    { transform: translateY(-105%); }
  12.5% { transform: translateY(-100%); }
  17.5% { transform: translateY(-205%); }
  25%   { transform: translateY(-200%); }
  30%   { transform: translateY(-305%); }
  37.5% { transform: translateY(-300%); }
  42.5% { transform: translateY(-405%); }
  50%   { transform: translateY(-400%); }
  55%   { transform: translateY(-505%); }
  62.5% { transform: translateY(-500%); }
  67.5% { transform: translateY(-605%); }
  75%   { transform: translateY(-600%); }
  80%   { transform: translateY(-705%); }
  87.5% { transform: translateY(-700%); }
  92.5% { transform: translateY(-805%); }
  100%  { transform: translateY(-800%); }
}

@media (prefers-reduced-motion: reduce) {
  .connect-spinner,
  .connect-spinner::before,
  .connect-spinner::after {
    animation: none;
    border-color: var(--cls-border);
    border-top-color: var(--cls-primary);
  }
  .connect-loader { display: none; }
  .connect-loading-static { display: block; }
}
`;
