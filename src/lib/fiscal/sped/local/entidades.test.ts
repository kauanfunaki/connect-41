import { describe, expect, it } from "vitest";
import { decodificarEntidades } from "./entidades";

describe("decodificarEntidades", () => {
  it("decodifica as cinco entidades nomeadas e as referências numéricas", () => {
    expect(decodificarEntidades("FORNECEDOR &amp; CIA &lt;FILIAL&gt; &quot;A&quot; D&apos;AGUA")).toBe("FORNECEDOR & CIA <FILIAL> \"A\" D'AGUA");
    expect(decodificarEntidades("CAF&#201; &#xE9; &#x1F600;")).toBe("CAFÉ é 😀");
  });

  it("uma passada só: texto já decodificado não muda, e &amp;amp; vira &amp;", () => {
    expect(decodificarEntidades("M&M PARAFUSOS & CIA")).toBe("M&M PARAFUSOS & CIA");
    expect(decodificarEntidades("A &amp;amp; B")).toBe("A &amp; B");
    expect(decodificarEntidades(decodificarEntidades("A &amp; B"))).toBe("A & B");
  });

  it("deixa como está o que não é entidade válida", () => {
    expect(decodificarEntidades("&nbsp; &AMP; &#0; &#xD800; &#99999999;")).toBe("&nbsp; &AMP; &#0; &#xD800; &#99999999;");
  });
});
