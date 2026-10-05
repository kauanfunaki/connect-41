import { describe, expect, it } from "vitest";
import { enderecoDaMiniatura, enderecoDoPlayer, enderecoNoYouTube, idDoVideo } from "./youtube";

const ID = "dQw4w9WgXcQ";

describe("idDoVideo — o id a partir do link que a equipe cola", () => {
  it("watch?v=, com e sem www, no celular e com parâmetros extras", () => {
    expect(idDoVideo(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(idDoVideo(`https://youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(idDoVideo(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(idDoVideo(`https://www.youtube.com/watch?v=${ID}&t=42s&list=PL123`)).toBe(ID);
    expect(idDoVideo(`https://www.youtube.com/watch?feature=shared&v=${ID}`)).toBe(ID);
  });

  it("youtu.be/, o link curto do botão Compartilhar", () => {
    expect(idDoVideo(`https://youtu.be/${ID}`)).toBe(ID);
    expect(idDoVideo(`https://youtu.be/${ID}?si=AbCdEf123&t=10`)).toBe(ID);
  });

  it("shorts/ e embed/, inclusive o do modo de privacidade", () => {
    expect(idDoVideo(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(idDoVideo(`https://youtube.com/shorts/${ID}?feature=share`)).toBe(ID);
    expect(idDoVideo(`https://www.youtube.com/embed/${ID}?start=30&rel=0`)).toBe(ID);
    expect(idDoVideo(`https://www.youtube-nocookie.com/embed/${ID}`)).toBe(ID);
  });

  it("sem https:// e com espaço sobrando em volta", () => {
    expect(idDoVideo(`youtu.be/${ID}`)).toBe(ID);
    expect(idDoVideo(`www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(idDoVideo(`  https://youtu.be/${ID}  `)).toBe(ID);
  });

  it("link vazio ou inválido → null", () => {
    expect(idDoVideo("")).toBeNull();
    expect(idDoVideo("   ")).toBeNull();
    expect(idDoVideo(null)).toBeNull();
    expect(idDoVideo(undefined)).toBeNull();
    expect(idDoVideo("não é um link")).toBeNull();
    expect(idDoVideo("https://vimeo.com/123456789")).toBeNull();
    // Id curto, comprido ou com caractere que o YouTube não usa.
    expect(idDoVideo("https://www.youtube.com/watch?v=abc")).toBeNull();
    expect(idDoVideo(`https://youtu.be/${ID}x`)).toBeNull();
    expect(idDoVideo("https://youtu.be/dQw4w9WgXc!")).toBeNull();
    // Página do YouTube que não é um vídeo.
    expect(idDoVideo("https://www.youtube.com/")).toBeNull();
    expect(idDoVideo("https://www.youtube.com/watch")).toBeNull();
    expect(idDoVideo("https://www.youtube.com/@41contabil")).toBeNull();
  });

  it("outro site com cara de YouTube → null", () => {
    expect(idDoVideo(`https://exemplo.com/watch?v=${ID}`)).toBeNull();
    expect(idDoVideo(`https://youtube.com.exemplo.com/watch?v=${ID}`)).toBeNull();
    expect(idDoVideo(`https://exemplo.com/embed/${ID}`)).toBeNull();
    expect(idDoVideo(`javascript:alert(1)//youtu.be/${ID}`)).toBeNull();
  });
});

describe("os endereços que saem do id", () => {
  it("player sem cookie, tocando e sem sugestão de outro canal; miniatura e página do vídeo", () => {
    expect(enderecoDoPlayer(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0`);
    expect(enderecoDaMiniatura(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    expect(enderecoNoYouTube(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });
});
