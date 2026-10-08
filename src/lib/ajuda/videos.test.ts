import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  VIDEOS_DO_CONNECT,
  VIDEOS_DO_PORTAL,
  VIDEOS_DOS_PRIMEIROS_PASSOS,
  miniaturaDoVideo,
  todasAsMiniaturas,
} from "./videos";
import { idDoVideo } from "./youtube";
import { artigoDaChave } from "./artigos";
import { CHAVES_DOS_PASSOS } from "@/lib/portal/ajuda";

// O arquivo dos links é editado à mão (05/10/2026): estes testes pegam a chave
// digitada errado e o link colado pela metade antes de ir para o ar.
describe("o arquivo dos vídeos", () => {
  it("toda chave do Connect é de um artigo que existe", () => {
    for (const chave of Object.keys(VIDEOS_DO_CONNECT)) expect(artigoDaChave(chave), chave).not.toBeNull();
  });

  it("toda chave do portal é de um passo da ajuda do portal", () => {
    for (const chave of Object.keys(VIDEOS_DO_PORTAL)) expect(CHAVES_DOS_PASSOS, chave).toContain(chave);
  });

  it("os oito vídeos do portal têm lugar, na ordem da série", () => {
    // O Início entrou como segundo vídeo na regravação de 06/10/2026.
    expect(Object.keys(VIDEOS_DO_PORTAL)).toEqual(["entrar", "inicio", "solicitacao", "pendencia", "aprovar", "financeiro", "comunicado", "senha"]);
  });

  it("toda chave dos primeiros passos é de um passo da central do Connect", () => {
    // As chaves de PRIMEIROS_PASSOS (components/ajuda/CentralDeAjuda.tsx): o
    // componente é de cliente, e o teste não o importa — mude as duas juntas.
    const passos = ["meu-dia", "busca", "setor", "fixar", "filtros", "transferir", "avisos", "tema"];
    for (const chave of Object.keys(VIDEOS_DOS_PRIMEIROS_PASSOS)) expect(passos, chave).toContain(chave);
  });

  it("link preenchido é de um vídeo do YouTube", () => {
    const todos = [...Object.entries(VIDEOS_DO_CONNECT), ...Object.entries(VIDEOS_DO_PORTAL), ...Object.entries(VIDEOS_DOS_PRIMEIROS_PASSOS)];
    for (const [chave, link] of todos) {
      if (link.trim()) expect(idDoVideo(link), `${chave}: ${link}`).not.toBeNull();
    }
  });
});

// As miniaturas de public/miniaturas (08/10/2026): vídeo novo no catálogo sem a
// imagem gerada mostraria uma imagem quebrada na ajuda.
describe("as miniaturas dos vídeos", () => {
  it("todo vídeo do catálogo tem a miniatura em public/miniaturas", () => {
    for (const endereco of todasAsMiniaturas()) {
      expect(existsSync(path.join(process.cwd(), "public", endereco)), endereco).toBe(true);
    }
  });

  it("acha a miniatura pelo link, em qualquer formato de link do mesmo vídeo", () => {
    expect(miniaturaDoVideo("https://youtu.be/Ow_kW0_U3iA")).toBe("/miniaturas/portal-entrar.jpg");
    expect(miniaturaDoVideo("https://www.youtube.com/watch?v=Ow_kW0_U3iA")).toBe("/miniaturas/portal-entrar.jpg");
  });

  it("link que não é de vídeo da ajuda fica com a miniatura do YouTube", () => {
    expect(miniaturaDoVideo("https://youtu.be/xxxxxxxxxxx")).toBeNull();
    expect(miniaturaDoVideo("https://example.com/video")).toBeNull();
  });
});
