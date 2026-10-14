import "./carreiras41.css";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { MARCA_41_CARREIRAS, type RotasDoPortal } from "@/lib/carreiras/enderecoDeCarreiras";
import { fonteDoTexto, fonteDosTitulos } from "./fontes";
import { MenuDoTopo } from "./MenuDoTopo";
// A marca da 41 Tallent, do jeito que o Kauan mandou (14/10/2026): o logo
// inteiro e o recorte só do triângulo, sem redesenho. Importados (e não por
// `/41-tallent/...`) para sair com endereço do próprio Next, que vale no
// endereço do 41 Carreiras e no do Connect.
import logo41Tallent from "../../../../public/41-tallent/logo.png";
import marca41Tallent from "../../../../public/41-tallent/marca.png";

export type PaginaAtual = "inicio" | "vagas" | "conta" | "privacidade";

/**
 * A moldura das páginas do 41 Carreiras (15/10/2026): o topo roxo com a marca
 * e o menu, e o rodapé com quem conduz os processos. Tudo dentro de
 * `.t41-raiz`, que traz as cores, as letras e o tema claro fixo.
 */
export function Moldura41({ rotas, atual, children }: { rotas: RotasDoPortal; atual?: PaginaAtual; children: ReactNode }) {
  const links = [
    { href: rotas.vagas, rotulo: "Vagas", pagina: "vagas" as const },
    { href: `${rotas.lista}#empresas`, rotulo: "Empresas" },
    { href: `${rotas.lista}#como-funciona`, rotulo: "Como funciona" },
  ];

  return (
    <div className={`t41-raiz ${fonteDosTitulos.variable} ${fonteDoTexto.variable}`}>
      <a href="#conteudo" className="t41-pular">
        Pular para o conteúdo
      </a>
      <header className="t41-topo">
        <div className="t41-caixa t41-topo__linha">
          <Link href={rotas.lista} className="t41-marca" aria-label={`${MARCA_41_CARREIRAS.nome}, por ${MARCA_41_CARREIRAS.recrutamento} — página inicial`}>
            <span className="t41-marca__ladrilho">
              <Image src={marca41Tallent} alt="" width={40} height={40} priority />
            </span>
            <span className="t41-marca__nome">
              <span className="t41-marca__produto">{MARCA_41_CARREIRAS.nome}</span>
              <span className="t41-marca__assina">por {MARCA_41_CARREIRAS.recrutamento}</span>
            </span>
          </Link>

          <nav className="t41-nav" aria-label="Principal">
            {links.map((l) => (
              <Link key={l.rotulo} href={l.href} aria-current={l.pagina && l.pagina === atual ? "page" : undefined}>
                {l.rotulo}
              </Link>
            ))}
          </nav>

          <div className="t41-topo__acoes">
            <Link href={rotas.conta} className="t41-botao t41-botao--contorno-claro t41-botao--pequeno t41-topo__acompanhar" aria-current={atual === "conta" ? "page" : undefined}>
              Acompanhar candidatura
            </Link>
            <MenuDoTopo links={[...links.map(({ href, rotulo }) => ({ href, rotulo })), { href: rotas.conta, rotulo: "Acompanhar candidatura" }]} />
          </div>
        </div>
      </header>

      <main id="conteudo" tabIndex={-1} style={{ outline: "none" }}>
        {children}
      </main>

      <footer className="t41-rodape">
        <div className="t41-caixa t41-rodape__grade">
          <div className="t41-rodape__marca">
            <span className="t41-rodape__logo">
              <Image src={logo41Tallent} alt={MARCA_41_CARREIRAS.recrutamento} width={104} height={104} />
            </span>
            <div>
              <p className="t41-rodape__nome">{MARCA_41_CARREIRAS.nome}</p>
              <p className="t41-rodape__texto">Processos seletivos conduzidos pela {MARCA_41_CARREIRAS.recrutamento}.</p>
              {/* Só com o CNPJ confirmado (ver MARCA_41_CARREIRAS.cnpj). */}
              {MARCA_41_CARREIRAS.cnpj && (
                <p className="t41-rodape__cnpj t41-num">
                  {MARCA_41_CARREIRAS.recrutamento} · CNPJ {MARCA_41_CARREIRAS.cnpj}
                </p>
              )}
            </div>
          </div>
          <nav aria-label="Rodapé">
            <ul>
              <li>
                <Link href={rotas.vagas}>Vagas abertas</Link>
              </li>
              <li>
                <Link href={rotas.conta}>Acompanhar candidatura</Link>
              </li>
              <li>
                <a href={MARCA_41_CARREIRAS.politicaDePrivacidade} target="_blank" rel="noopener">
                  Política de privacidade
                </a>
              </li>
              <li>
                <Link href={rotas.privacidade}>Seus dados neste portal</Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="t41-caixa">
          <p className="t41-rodape__base">
            {MARCA_41_CARREIRAS.nome} é o portal de vagas da {MARCA_41_CARREIRAS.recrutamento}, {MARCA_41_CARREIRAS.grupo}.
          </p>
        </div>
      </footer>
    </div>
  );
}
