# Gera os woff2 das fontes do Connect a partir dos originais do Google Fonts (OFL).
# Um arquivo por peso/fonte, cobrindo latin + latin-ext (os subsets que o
# next/font/google pedia), com todos os recursos OpenType (tnum incluso).
# Uso: python -I gerar_fontes.py <pasta-dos-originais> <pasta-de-saida>
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

orig, saida = Path(sys.argv[1]), Path(sys.argv[2])
saida.mkdir(parents=True, exist_ok=True)

# Faixas Unicode dos subsets "latin" e "latin-ext" do Google Fonts.
FAIXAS = """
U+0000-00FF U+0131 U+0152-0153 U+02BB-02BC U+02C6 U+02DA U+02DC U+0304 U+0308 U+0329
U+2000-206F U+20AC U+2122 U+2191 U+2193 U+2212 U+2215 U+FEFF U+FFFD
U+0100-02BA U+02BD-02C5 U+02C7-02CC U+02CE-02D7 U+02DD-02FF U+1D00-1DBF U+1E00-1E9F
U+1EF2-1EFF U+2020 U+20A0-20AB U+20AD-20C0 U+2113 U+2C60-2C7F U+A720-A7FF
""".split()

SO_LATIN = """
U+0000-00FF U+0131 U+0152-0153 U+02BB-02BC U+02C6 U+02DA U+02DC U+0304 U+0308 U+0329
U+2000-206F U+20AC U+2122 U+2191 U+2193 U+2212 U+2215 U+FEFF U+FFFD
""".split()

def codigos(faixas=FAIXAS):
    out = set()
    for f in faixas:
        f = f[2:]
        if "-" in f:
            a, b = f.split("-")
            out.update(range(int(a, 16), int(b, 16) + 1))
        else:
            out.add(int(f, 16))
    return out

def gerar(origem, destino, eixos=None, faixas=FAIXAS):
    # Recorta antes de instanciar: na ordem inversa o fontTools 4.57 quebra no
    # `gvar` de algumas variáveis (KeyError em glifos sem variação).
    fonte = TTFont(orig / origem, lazy=False)
    opcoes = subset.Options()
    # Os recursos padrão do fontTools (kern, liga, mark, locl…) mais os que o
    # app usa: algarismos tabulares e alinhados (`tabular-nums`), ordinais
    # (1º, 2ª), frações e caixa alta. Com "*" a Unbounded levava 1.054 glifos
    # de alternativos que nenhuma tela usa.
    opcoes.layout_features = opcoes.layout_features + ["tnum", "pnum", "lnum", "onum", "ordn", "frac", "case", "sups", "subs", "zero"]
    opcoes.name_IDs = ["*"]
    opcoes.name_languages = ["*"]
    opcoes.notdef_outline = True
    opcoes.glyph_names = False
    recortador = subset.Subsetter(opcoes)
    recortador.populate(unicodes=codigos(faixas))
    recortador.subset(fonte)
    if eixos:
        fonte = instancer.instantiateVariableFont(fonte, eixos)
    fonte.flavor = "woff2"
    fonte.save(saida / destino)
    print(destino, (saida / destino).stat().st_size // 1024, "KB")

# Connect (layout raiz): os pesos que o layout pedia.
gerar("IBMPlexSans-var.ttf", "IBMPlexSans-wght.woff2", {"wdth": 100, "wght": (400, 700)})
gerar("IBMPlexMono-Regular.ttf", "IBMPlexMono-400.woff2")
gerar("IBMPlexMono-Medium.ttf", "IBMPlexMono-500.woff2")
gerar("SpaceGrotesk-var.ttf", "SpaceGrotesk-wght.woff2", {"wght": (500, 700)})
# 41 Carreiras: variáveis inteiras, como o next/font/google entregava sem `weight`.
# Unbounded só com latin: o latin-ext quadruplicava o arquivo (192 → 46 KB), e é
# a fonte dos títulos, em português.
gerar("Unbounded-var.ttf", "Unbounded-wght.woff2", faixas=SO_LATIN)
gerar("HankenGrotesk-var.ttf", "HankenGrotesk-wght.woff2")
