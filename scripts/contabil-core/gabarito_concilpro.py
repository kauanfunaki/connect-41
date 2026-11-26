"""Gabarito do leitor do Razão de fornecedores (ConcilPro), Bloco D, Fase D3a (26/11/2026).

Plugin do pytest: roda a suíte do original (dev41tech/contabil-core) que exercita o ConcilPro
(`tests/unit/test_concilpro_parser.py`, `test_concilpro_correcoes.py` e `test_concilpro_planilha.py`) e grava
cada chamada de `src/domain/concilpro/parser.py` e `consolidador.py` que a suíte faz, com a entrada e a saída
exatas (a entrada é copiada ANTES da chamada: várias funções alteram o que recebem). O teste do lote da IA de
imagem que falha (`test_falha_em_um_batch_vision_invalida_toda_extracao`, que troca o `_visao_batch` por um
falso) entra como cenário com a OpenAI simulada falhando na 2ª chamada.

Depois acrescenta casos inventados com semente fixa:
- as funções unitárias de `parser.py`, `consolidador.py` e `ai_classifier.py`, nas bordas (valores e datas
  BR, NF e CNPJ no histórico, colunas deslocadas, histórico em várias linhas, duplicados, fornecedor repetido,
  respostas da IA fora do formato);
- PDFs de Razão inventados (gerados aqui pelo PyMuPDF, com fornecedores e CNPJs fictícios), com o texto de
  cada página nas três estratégias (`layout`, `palavras` e `chars`) e a escolhida;
- leituras inteiras (`parsear_arquivo_razao`, seguidas de `consolidar_todos_fornecedores` e
  `classificar_lancamentos_incertos`, como o processamento do envio) com a IA simulada nas quatro
  combinações da chave da OpenAI e do `ALLOW_FINANCIAL_DATA_TO_OPENAI` (que o original NÃO consulta), e com
  a falha do provedor. Na combinação chave presente e envio bloqueado, grava também a saída sem IA, que é a
  do porte (no Connect a chave do escritório desligada não manda nada).
A IA de verdade nunca é chamada: o `_get_client` devolve um cliente falso que grava cada chamada (texto ou
imagem, o sistema, o texto enviado, as páginas, `max_tokens` e `timeout`) e responde pelas regras do cenário.

O porte em TypeScript repete tudo (`src/lib/contabil-core/concilpro/*.test.ts`).

Dados: os nomes da variável GABARITO_NOMES ("REAL=FICTICIO;..."), fora do git, são trocados, e os CNPJs que
não são de exemplo viram fictícios começando com 9 (`gabarito_cruzamento.sanitizar_texto`). Para gerar de
novo, o GABARITO_NOMES precisa dos nomes de fornecedores de `tests/unit/test_concilpro_parser.py` (das classes
`TestConsolidacaoEntrePaginas` e `TestContaSemMovimento`, e o do histórico "VLR REF PGTO MOTOR ..." de
`test_bloco_com_data_mas_sem_leitura_nao_vira_sem_movimento`), com trocas do MESMO tamanho (a coluna conta
caracteres). O nome de empresa do exemplo do "Formato 2" no prompt de texto é trocado aqui, sem depender da
variável, por "LOJA FICTICIA DE MATERIAIS DE OBRAS" (o mesmo do porte).

Uso, a partir da raiz do contabil-core (com pdfplumber, PyMuPDF, openpyxl, xlwt e pytest; o `-I` ignora o
PYTHONPATH, então o caminho do plugin entra pelo `-c`):
    GABARITO_NOMES=... PYTHONDONTWRITEBYTECODE=1 GABARITO_PASTA=<connect>/src/lib/contabil-core/concilpro/gabarito \\
        python -I -W ignore -c "import sys; sys.path.insert(0, '<connect>/scripts/contabil-core'); import pytest; \\
        sys.exit(pytest.main(['-q', '-p', 'no:cacheprovider', '-p', 'gabarito_concilpro', \\
        'tests/unit/test_concilpro_parser.py', 'tests/unit/test_concilpro_correcoes.py', 'tests/unit/test_concilpro_planilha.py']))"

Conferência local em arquivos reais (a saída fica FORA do repositório, só com os resultados):
    python -I -W ignore <connect>/scripts/contabil-core/gabarito_concilpro.py conferir <saida.json> <arquivo>...
"""
from __future__ import annotations

import contextlib
import copy
import dataclasses
import functools
import hashlib
import io
import json
import os
import random
import re
import sys
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

os.environ.setdefault("SECRET_KEY", "gabarito-local-sem-segredo-0123456789abcdef")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://gabarito:gabarito@127.0.0.1:1/gabarito")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gabarito_cruzamento import sanitizar_texto  # noqa: E402

chamadas: dict[str, dict] = {}
conteudos: dict[str, bytes] = {}
_ESTADO = {"dentro": 0}

NOME_DO_EXEMPLO = "LOJA FICTICIA DE MATERIAIS DE OBRAS"
_EXEMPLO_DO_PROMPT = re.compile(r'"[^"\n]*"(\s+← ruído — IGNORE)')


# ─── Sanitização e codificação ──────────────────────────────────────────────

def _texto_limpo(v: str) -> str:
    return sanitizar_texto(_EXEMPLO_DO_PROMPT.sub(lambda m: '"' + NOME_DO_EXEMPLO + '"' + m.group(1), v))


def sanitizar(v):
    if isinstance(v, str):
        return _texto_limpo(v)
    if isinstance(v, list):
        return [sanitizar(x) for x in v]
    if isinstance(v, tuple):
        return tuple(sanitizar(x) for x in v)
    if isinstance(v, dict):
        return {k: sanitizar(x) for k, x in v.items()}
    return v


def codificar(v):
    """JSON simples: objeto para dict de chaves texto; o resto marcado ($dec, $dt, $f, $int, $arquivo, $tupla)."""
    if isinstance(v, bool) or v is None or isinstance(v, str):
        return v
    if isinstance(v, int):
        return {"$int": str(v)} if abs(v) > 2**53 else v
    if isinstance(v, float):
        return {"$f": repr(v)}
    if isinstance(v, Decimal):
        return {"$dec": str(v)}
    if isinstance(v, datetime):
        return {"$dt": v.isoformat()}
    if isinstance(v, date):
        return {"$d": v.isoformat()}
    if isinstance(v, (bytes, bytearray)):
        sha = hashlib.sha256(bytes(v)).hexdigest()[:12]
        conteudos.setdefault(sha, bytes(v))
        return {"$arquivo": sha}
    if isinstance(v, tuple):
        return {"$tupla": [codificar(x) for x in v]}
    if isinstance(v, list):
        return [codificar(x) for x in v]
    if isinstance(v, dict):
        return {str(k): codificar(x) for k, x in v.items()}
    if dataclasses.is_dataclass(v) and not isinstance(v, type):
        return {f.name: codificar(getattr(v, f.name)) for f in dataclasses.fields(v)}
    raise TypeError(f"tipo sem codificação: {type(v)!r}")


def _erro(exc: BaseException) -> dict:
    return {"tipo": type(exc).__name__, "mensagem": str(exc)}


def _executar(fn, args) -> dict:
    _ESTADO["dentro"] += 1
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            return {"result": codificar(fn(*args))}
    except Exception as exc:  # noqa: BLE001 — o erro também é saída
        return {"error": _erro(exc)}
    finally:
        _ESTADO["dentro"] -= 1


def _registrar(nome, fn, args, extra_args=None):
    """Grava `fn(*args)` (numa cópia: há funções que alteram o que recebem); `extra_args` vai no lugar de `args`."""
    entrada = {"fn": nome, "args": codificar(list(extra_args if extra_args is not None else args))}
    entrada.update(_executar(fn, copy.deepcopy(list(args))))
    chave = json.dumps([entrada["fn"], entrada["args"]], sort_keys=True, ensure_ascii=False)
    chamadas.setdefault(chave, entrada)
    return entrada


def _modulos():
    sys.path.insert(0, os.getcwd())
    from src.domain.concilpro import ai_classifier, consolidador, parser

    return parser, ai_classifier, consolidador


_DA_SUITE_PARSER = (
    "_construir_runs", "_montar_linhas_de_runs", "_pontuar_extracao", "_escolher_estrategia", "_colunas_do_header",
    "_valores_por_coluna", "_corrigir_colunas_por_posicao", "consolidar_fornecedores_duplicados",
    "parsear_bloco_deterministico", "detectar_formato_arquivo",
)
_DA_SUITE_CONSOLIDADOR = ("consolidar_lancamentos_fornecedor",)
_SUITE: dict[str, int] = {}


def envolver(modulo, prefixo, nome_fn):
    original = getattr(modulo, nome_fn)
    if getattr(original, "__gabarito__", False):
        return

    @functools.wraps(original)
    def gravador(*args, **kwargs):
        if _ESTADO["dentro"]:
            return original(*args, **kwargs)
        copia = copy.deepcopy(list(args) + list(kwargs.values()))
        try:
            return original(*args, **kwargs)
        finally:
            entrada = _registrar(f"{prefixo}.{nome_fn}", original, sanitizar(copia))
            entrada["suite"] = True

    gravador.__gabarito__ = True
    setattr(modulo, nome_fn, gravador)


def pytest_configure(config):  # noqa: ARG001
    parser, _ai, cons = _modulos()
    for fn in _DA_SUITE_PARSER:
        envolver(parser, "parser", fn)
    for fn in _DA_SUITE_CONSOLIDADOR:
        envolver(cons, "consolidador", fn)


# ─── A IA simulada ──────────────────────────────────────────────────────────

def _nome_do_sistema(ai, sistema: str) -> str:
    return {ai.PARSE_SYSTEM_PROMPT: "PARSE", ai.VISION_SYSTEM_PROMPT: "VISION", ai.CLASSIFY_SYSTEM_PROMPT: "CLASSIFY"}[sistema]


_TIPO_DO_SISTEMA = {"PARSE": "texto", "VISION": "visao", "CLASSIFY": "classificacao"}
_PADRAO_DA_RESPOSTA = {"texto": '{"lancamentos": []}', "visao": '{"lancamentos": []}', "classificacao": '{"resultados": []}'}


def _cliente_falso(ai, regras_do_cenario: list, feitas: list, estado: dict):
    """A OpenAI falsa: grava a chamada e responde pela primeira regra que servir (tipo e trecho do texto)."""
    regras = [dict(r) for r in regras_do_cenario]

    class Completions:
        def create(self, *, model, messages, **kw):
            nome = _nome_do_sistema(ai, messages[0]["content"])
            tipo = _TIPO_DO_SISTEMA[nome]
            usuario = messages[1]["content"]
            if isinstance(usuario, str):
                texto, imagens = usuario, 0
            else:
                textos = [p["text"] for p in usuario if p["type"] == "text"]
                texto = textos[0] if textos else None
                imagens = sum(1 for p in usuario if p["type"] == "image_url")
            # O texto vai como foi enviado: vem dos PDFs e blocos inventados aqui (o sanitizador trocaria os CNPJs fictícios).
            registro = {"tipo": tipo, "modelo": model, "sistema": nome, "texto": texto,
                        "imagens": imagens, "max_tokens": kw.get("max_tokens"), "timeout": kw.get("timeout"),
                        "temperature": kw.get("temperature"), "response_format": kw.get("response_format")}
            if tipo == "visao":
                c = estado["cursor"]
                registro["paginas"] = estado["render"][c:c + imagens]
                estado["cursor"] = c + imagens
            feitas.append(registro)
            alvo = texto or ""
            conteudo = _PADRAO_DA_RESPOSTA[tipo]
            for k, r in enumerate(regras):
                if r.get("tipo") not in (None, tipo):
                    continue
                if r.get("se") is not None and r["se"] not in alvo:
                    continue
                if r.get("uma_vez"):
                    regras.pop(k)
                if r.get("falha"):
                    raise RuntimeError("falha simulada do provedor")
                conteudo = r["content"]
                break
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=conteudo))], usage=None)

    return SimpleNamespace(chat=SimpleNamespace(completions=Completions()))


@contextlib.contextmanager
def ia_simulada(parser, ai, chave: bool, regras: list, feitas: list, estado: dict | None = None):
    """Troca o cliente da OpenAI (presente só com a chave) e grava as páginas que cada imagem levou."""
    estado = estado if estado is not None else {"render": [], "cursor": 0}
    cliente = _cliente_falso(ai, regras, feitas, estado)
    guardados = (ai._get_client, parser._renderizar_paginas_pdf)
    renderizar = guardados[1]

    def render(arquivo_bytes, page_indices):
        png = renderizar(arquivo_bytes, page_indices)
        total = _paginas_do_pdf(arquivo_bytes)
        estado["render"] = [i for i in page_indices if 0 <= i < total] if png else []
        estado["cursor"] = 0
        return png

    ai._get_client = (lambda: cliente) if chave else (lambda: None)
    parser._renderizar_paginas_pdf = render
    _ESTADO["dentro"] += 1
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            yield estado
    finally:
        _ESTADO["dentro"] -= 1
        ai._get_client, parser._renderizar_paginas_pdf = guardados


def _paginas_do_pdf(conteudo: bytes) -> int:
    import pymupdf

    try:
        with pymupdf.open(stream=conteudo, filetype="pdf") as doc:
            return len(doc)
    except Exception:  # noqa: BLE001
        return 0


PADRAO = {"chave": True, "allow": True, "respostas": []}


def rodar_cenario(parser, ai, cons, conteudo: bytes, c: dict) -> dict:
    """`parsear_arquivo_razao` e, sem erro, o que o envio fazia depois (consolidar e classificar os incertos)."""
    feitas: list = []
    saida: dict = {}
    with ia_simulada(parser, ai, c["chave"], c["respostas"], feitas):
        try:
            dados = parser.parsear_arquivo_razao(conteudo)
        except Exception as exc:  # noqa: BLE001
            saida["error"] = _erro(exc)
        else:
            saida["result"] = codificar(dados)
            dados = cons.consolidar_todos_fornecedores(dados)
            incertos = [l for f in dados["fornecedores"] for l in f.get("lancamentos", []) if l.get("classificacao_incerta")]
            if incertos:
                ai.classificar_lancamentos_incertos(incertos)
            saida["processado"] = codificar(dados)
    saida["chamadas_ia"] = feitas
    return saida


def cenario(mods, nome: str, conteudo: bytes, **c) -> None:
    parser, ai, cons = mods
    config = {**PADRAO, **c}
    saida = rodar_cenario(parser, ai, cons, conteudo, config)
    entrada = {"fn": "razao.cenario", "nome": nome, "args": [codificar(conteudo), config], **saida}
    if config["chave"] and not config["allow"]:
        sem = rodar_cenario(parser, ai, cons, conteudo, {**config, "chave": False})
        entrada["sem_ia"] = {k: sem[k] for k in ("result", "processado", "error") if k in sem}
    chamadas.setdefault(json.dumps(["cenario", nome], ensure_ascii=False), entrada)


def cenario_combinado(mods, nome: str, conteudo: bytes, **c) -> None:
    """As quatro combinações da chave da OpenAI e do `ALLOW_FINANCIAL_DATA_TO_OPENAI`."""
    for chave in (True, False):
        for allow in (True, False):
            sufixo = f"{'chave' if chave else 'sem-chave'}-{'liberada' if allow else 'bloqueada'}"
            cenario(mods, f"{nome}-{sufixo}", conteudo, **{**c, "chave": chave, "allow": allow})


def direta_ia(mods, nome: str, fn: str, args: list, codificados: list, regras: list, chave: bool = True, paginas: int = 0) -> None:
    """`parsear_bloco_fornecedor_ia`, `parsear_bloco_fornecedor_ia_visao` ou `classificar_lancamentos_incertos` sozinhos."""
    parser, ai, _cons = mods
    feitas: list = []
    estado = {"render": list(range(paginas)), "cursor": 0}
    saida: dict = {}
    with ia_simulada(parser, ai, chave, regras, feitas, estado):
        alvo = copy.deepcopy(args)
        try:
            r = getattr(ai, fn)(*alvo)
            saida["result"] = codificar(alvo[0] if fn == "classificar_lancamentos_incertos" else r)
        except Exception as exc:  # noqa: BLE001
            saida["error"] = _erro(exc)
    entrada = {"fn": f"ia.{fn}", "nome": nome, "args": codificar(codificados), "config": {"chave": chave, "respostas": regras}, **saida,
               "chamadas_ia": feitas}
    chamadas.setdefault(json.dumps(["ia", fn, nome], ensure_ascii=False), entrada)


# ─── PDFs de Razão inventados ───────────────────────────────────────────────
#
# Paisagem A4, fonte de 7 pontos. Cada linha é uma lista de (x, texto, alinhamento): "e" põe o texto a partir
# de x; "d" o termina em x (os números contábeis são alinhados à direita, como os rótulos das colunas).

X_DATA, X_LOTE, X_HIST, D_CTA, D_DEB, D_CRED, D_SALDO = 30, 80, 120, 470, 560, 640, 760
FONTE = 7.0


def _x(texto: str, x: float, alinhamento: str) -> float:
    import pymupdf

    return x - pymupdf.get_text_length(texto, fontname="helv", fontsize=FONTE) if alinhamento == "d" else x


def pdf_razao(paginas: list[list], largura: float = 842, altura: float = 595) -> bytes:
    """`paginas`: cada página é uma lista de linhas; cada linha, uma lista de (x, texto, alinhamento[, dy])."""
    import pymupdf

    doc = pymupdf.open()
    for linhas in paginas:
        p = doc.new_page(width=largura, height=altura)
        y = 40.0
        for linha in linhas:
            for item in linha:
                x, texto, alinha = item[:3]
                dy = item[3] if len(item) > 3 else 0.0
                if texto:
                    p.insert_text((_x(texto, x, alinha), y + dy), texto, fontsize=FONTE, fontname="helv")
            y += 10.5
    dados = doc.tobytes()
    doc.close()
    return dados


EMPRESA = "EMPRESA FICTICIA COMERCIO LTDA"
CNPJ_EMPRESA = "99.123.456/0001-91"


def cab_relatorio(folha: int = 1, periodo: str = "01/01/2026 - 31/03/2026") -> list:
    return [
        [(30, f"Empresa: {EMPRESA}", "e"), (760, f"Folha: {folha:04d}", "d")],
        [(30, f"C.N.P.J.: {CNPJ_EMPRESA}", "e")],
        [(30, f"Período: {periodo}", "e"), (380, "RAZÃO", "e")],
    ]


def cab_tabela() -> list:
    return [[(X_DATA, "Data", "e"), (X_LOTE, "Lote", "e"), (X_HIST, "Histórico", "e"), (D_CTA, "Cta.C.Part.", "d"),
             (D_DEB, "Débito", "d"), (D_CRED, "Crédito", "d"), (D_SALDO, "Saldo-Exercício", "d")]]


def conta(codigo: str, conta_contabil: str, nome: str) -> list:
    return [(30, "Conta:", "e"), (62, f"{codigo} - {conta_contabil}" if codigo else "", "e"), (160, nome, "e")]


def saldo_anterior(valor: str) -> list:
    return [(X_HIST, "SALDO ANTERIOR", "e"), (D_SALDO, valor, "d")]


def lanc(data: str, lote: str, hist: str, cta: str = "", deb: str = "", cred: str = "", saldo: str = "") -> list:
    return [(X_DATA, data, "e"), (X_LOTE, lote, "e"), (X_HIST, hist, "e"), (D_CTA, cta, "d"), (D_DEB, deb, "d"),
            (D_CRED, cred, "d"), (D_SALDO, saldo, "d")]


def total(deb: str, cred: str) -> list:
    return [(380, "Total da conta:", "e"), (D_DEB, deb, "d"), (D_CRED, cred, "d")]


def bloco_alfa() -> list:
    return [
        conta("1001", "2.1.3.01.0001", "FORNECEDOR ALFA LTDA"),
        saldo_anterior("1.000,00C"),
        lanc("05/01/2026", "11190", "COMPRA CONFORME NF NUMERO 123456", "425", cred="2.758,20", saldo="3.758,20C"),
        lanc("20/01/2026", "11192", "VLR REF PGTO NF 123456", "29", deb="2.758,20", saldo="1.000,00C"),
        lanc("28/01/2026", "11200", "COMPRA NF 7788 SERIE 2", "425", cred="150,00", saldo="1.150,00C"),
        total("2.758,20", "2.908,20"),
    ]


def bloco_beta(total_credito: str = "500,00") -> list:
    return [
        conta("1002", "2.1.3.01.0002", "FORNECEDOR BETA SERVICOS S/A"),
        saldo_anterior("0,00"),
        lanc("10/02/2026", "200", "SERVICO PRESTADO CONF. NFS 4455", "31", cred="500,00", saldo="500,00C"),
        total("0,00", total_credito),
    ]


def bloco_gama() -> list:
    return [
        conta("1003", "2.1.3.01.0003", "GAMA TRANSPORTES EIRELI"),
        saldo_anterior("0,00"),
        lanc("03/03/2026", "310", "CT-E 99881 FRETE", "40", cred="1.234.567,89", saldo="1.234.567,89C"),
        lanc("15/03/2026", "311", "PIX CNPJ 91.222.333/0001-44 ADTO", "50", deb="100,00", saldo="1.234.467,89C"),
        lanc("16/03/2026", "312", "TRANSFERENCIA DIVERSA", "50", deb="0,01", saldo="1.234.467,88C"),
        total("100,01", "1.234.567,89"),
    ]


def pdfs_inventados() -> dict[str, tuple[bytes, list]]:
    """Os PDFs de cada cenário, com as regras da IA simulada (respostas por tipo e trecho do texto)."""
    r = lambda tipo, content, se=None, **k: {"tipo": tipo, "se": se, "content": content, **k}  # noqa: E731
    j = lambda o: json.dumps(o, ensure_ascii=False)  # noqa: E731
    pdfs: dict[str, tuple[bytes, list]] = {}

    simples = cab_relatorio() + cab_tabela() + bloco_alfa() + bloco_beta()
    pdfs["simples"] = (pdf_razao([simples]), [])

    # O total da conta que não fecha: o bloco vai para a IA de texto (e o débito/crédito é corrigido pela coluna).
    nao_fecha = cab_relatorio() + cab_tabela() + bloco_alfa() + bloco_beta("900,00")
    resposta_beta = {"saldo_anterior": 0.0, "saldo_anterior_tipo": "", "total_debito": 0.0, "total_credito": 900.0,
                     "lancamentos": [{"data": "10/02/2026", "lote": "200", "historico": "SERVICO PRESTADO CONF. NFS 4455",
                                      "conta_partida": "31", "valor_debito": 500.0, "valor_credito": 0.0, "saldo_apos": 500.0,
                                      "saldo_tipo": "C", "tipo_operacao": "PAGAMENTO"},
                                     {"data": "2026-02-11", "lote": "201", "historico": "AJUSTE SEM NOTA", "conta_partida": None,
                                      "valor_debito": 0, "valor_credito": "400,00", "saldo_apos": "900.00", "tipo_operacao": "x"}]}
    pdfs["total-nao-fecha"] = (pdf_razao([nao_fecha]), [r("texto", j(resposta_beta), "1002 - 2.1")])

    # Sem "Total da conta": IA de texto; sem resposta útil: a imagem (lote único) com conciliação.
    sem_total = cab_relatorio() + cab_tabela() + bloco_alfa()[:-1] + bloco_gama()
    visao = {"saldo_anterior": "1.000,00", "saldo_anterior_tipo": "C", "total_debito": 2758.20, "total_credito": 2908.20,
             "lancamentos": [{"data": "05/01/2026", "lote": "11190", "historico": "COMPRA CONFORME NF NUMERO 123456",
                              "conta_partida": 425, "valor_debito": 0, "valor_credito": 2758.20, "saldo_apos": 3758.20,
                              "saldo_tipo": "C", "tipo_operacao": "COMPRA"},
                             {"data": "20-01-2026", "lote": 11192, "historico": "VLR REF PGTO NF 123456", "valor_debito": 2758.2,
                              "valor_credito": None, "saldo_apos": 1000, "tipo_operacao": "pagamento"},
                             {"data": "31/02/2026", "lote": "1", "historico": "DATA IMPOSSIVEL", "valor_credito": 1},
                             {"data": "28/01/2026", "lote": "11200", "historico": "COMPRA NF 7788 SERIE 2", "valor_credito": "150",
                              "tipo_operacao": "DEBITO"}],
             "conciliacao": [{"nf": "123456", "data_compra": "05/01/2026", "valor_original": 2758.20, "valor_pago": 2758.20,
                              "saldo_em_aberto": 0.0, "status": "paga", "pagamentos": [{"data": "20/01/2026", "valor": 2758.20,
                                                                                         "criterio": "regra_1"}]}],
             "resumo": {"total_compras": 2908.20, "total_pagamentos": 2758.20, "saldo_em_aberto": 150.0},
             "validacao": {"saldo_confere": True, "observacoes": ["conferido"]}}
    pdfs["sem-total"] = (pdf_razao([sem_total]), [r("texto", j({"lancamentos": [{"data": "05/01/2026", "valor_credito": 0}]}), "1001 - 2.1"),
                                                  r("visao", j(visao), "1001 - 2.1")])

    # Um fornecedor em 5 páginas, com o "Conta:" repetido no alto de cada uma: a imagem em 2 lotes.
    paginas = []
    linhas_de = lambda k: [lanc(f"{k + 1:02d}/01/2026", str(500 + k), f"COMPRA NF {9000 + k}", "425", cred="10,00",  # noqa: E731
                                saldo=f"{(k + 1) * 10},00C")]
    for k in range(5):
        corpo = cab_relatorio(k + 1) + cab_tabela() + [conta("2001", "2.1.3.01.0201", "DELTA DISTRIBUIDORA LTDA")]
        if k == 0:
            corpo.append(saldo_anterior("0,00"))
        corpo += linhas_de(k)
        if k == 4:
            corpo.append(total("0,00", "999,00"))
        paginas.append(corpo)
    lote1 = {"saldo_anterior": 0, "saldo_anterior_tipo": "", "total_debito": 0, "total_credito": 0,
             "lancamentos": [{"data": f"0{k + 1}/01/2026", "lote": str(500 + k), "historico": f"COMPRA NF {9000 + k}",
                              "valor_credito": 10.0, "saldo_apos": (k + 1) * 10.0, "saldo_tipo": "C"} for k in range(3)]}
    lote2 = {"total_credito": 50.0, "total_debito": "0",
             "lancamentos": [{"data": f"0{k + 1}/01/2026", "lote": str(500 + k), "historico": f"COMPRA NF {9000 + k}",
                              "valor_credito": 10.0, "saldo_apos": (k + 1) * 10.0, "saldo_tipo": "C"} for k in range(3, 5)]}
    multipagina = pdf_razao(paginas)
    pdfs["cinco-paginas"] = (multipagina, [r("visao", j(lote1), "2001 - 2.1", uma_vez=True), r("visao", j(lote2))])
    # O cabeçalho do relatório também vai à imagem (a 1ª chamada): a regra dele vem antes.
    cabecalho = r("visao", j({"lancamentos": []}), uma_vez=True)
    pdfs["cinco-paginas-lote-2-falha"] = (multipagina, [cabecalho, r("visao", j(lote1), "2001 - 2.1", uma_vez=True), r("visao", "", falha=True)])
    pdfs["cinco-paginas-lote-2-incompleto"] = (multipagina, [cabecalho, r("visao", j(lote1), "2001 - 2.1", uma_vez=True), r("visao", j({"total": 1}))])
    # Sem essa regra, a falha cai já na imagem do cabeçalho do relatório, e o arquivo inteiro para ali.
    pdfs["cinco-paginas-cabecalho-falha"] = (multipagina, [r("visao", j(lote1), "2001 - 2.1", uma_vez=True), r("visao", "", falha=True)])
    pdfs["cinco-paginas-cabecalho-incompleto"] = (multipagina, [r("visao", j(lote1), "2001 - 2.1", uma_vez=True), r("visao", j({"total": 1}))])

    # O mesmo fornecedor em dois blocos não vizinhos, com um lançamento lido nos dois: consolidado e sem duplicata.
    repetido = cab_relatorio() + cab_tabela() + bloco_alfa() + bloco_beta() + [
        conta("1001", "2.1.3.01.0001", "FORNECEDOR ALFA LTDA"),
        saldo_anterior("1.150,00C"),
        lanc("28/01/2026", "11200", "COMPRA NF 7788 SERIE 2", "425", cred="150,00", saldo="1.150,00C"),
        lanc("29/01/2026", "11201", "COMPRA NF 7789 SERIE 2", "425", cred="50,00", saldo="1.200,00C"),
        total("0,00", "200,00"),
    ]
    pdfs["fornecedor-repetido"] = (pdf_razao([repetido]), [])

    # Conta sem movimento, conta sem código (o nome logo abaixo), bloco sem cabeçalho de colunas.
    sem_mov = cab_relatorio() + cab_tabela() + [conta("3001", "2.1.3.01.0301", "EPSILON SEM MOVIMENTO ME"), saldo_anterior("1.234,56D"),
                                                 total("0,00", "0,00")] + bloco_beta()
    pdfs["sem-movimento"] = (pdf_razao([sem_mov]), [])
    sem_codigo = cab_relatorio() + cab_tabela() + [[(30, "Conta:", "e")], [(160, "ZETA COMERCIO DE PECAS", "e")],
                                                    lanc("07/02/2026", "77", "COMPRA NF 55443", "425", cred="80,00", saldo="80,00C"),
                                                    total("0,00", "80,00")]
    pdfs["conta-sem-codigo"] = (pdf_razao([sem_codigo]), [])
    sem_cabecalho = cab_relatorio() + bloco_alfa()
    resposta_alfa = {"saldo_anterior": 1000.0, "saldo_anterior_tipo": "C", "total_debito": 2758.20, "total_credito": 2908.20,
                     "lancamentos": [{"data": "05/01/2026", "lote": "11190", "historico": "COMPRA CONFORME NF NUMERO 123456",
                                      "valor_credito": 2758.20, "saldo_apos": 3758.20, "saldo_tipo": "C", "tipo_operacao": "COMPRA"},
                                     {"data": "20/01/2026", "lote": "11192", "historico": "VLR REF PGTO NF 123456",
                                      "valor_debito": 2758.20, "saldo_apos": 1000.00, "saldo_tipo": "C"},
                                     {"data": "28/01/2026", "lote": "11200", "historico": "COMPRA NF 7788 SERIE 2", "valor_credito": 150,
                                      "saldo_apos": 1150, "saldo_tipo": "C", "tipo_operacao": "OUTRO"}],
                     "conciliacao": 5, "validacao": {"observacoes": None}}
    pdfs["sem-cabecalho"] = (pdf_razao([sem_cabecalho]), [r("texto", j({**resposta_alfa, "conciliacao": []}), "1001 - 2.1")])
    pdfs["sem-cabecalho-conciliacao-numero"] = (pdf_razao([sem_cabecalho]), [r("texto", j(resposta_alfa), "1001 - 2.1")])
    pdfs["sem-cabecalho-validacao-lista"] = (pdf_razao([sem_cabecalho]), [r("texto", j({**resposta_alfa, "conciliacao": [], "validacao": [1]}), "1001 - 2.1")])
    pdfs["sem-cabecalho-observacao-numero"] = (pdf_razao([sem_cabecalho]),
                                              [r("texto", j({**resposta_alfa, "conciliacao": [], "validacao": {"observacoes": 7}}), "1001 - 2.1")])
    pdfs["sem-cabecalho-lancamento-nao-objeto"] = (pdf_razao([sem_cabecalho]),
                                                  [r("texto", j({"lancamentos": [3, {"data": "05/01/2026", "valor_credito": 1}]}), "1001 - 2.1")])
    pdfs["sem-cabecalho-valor-booleano"] = (pdf_razao([sem_cabecalho]),
                                           [r("texto", j({"lancamentos": [{"data": "05/01/2026", "valor_credito": True}]}), "1001 - 2.1")])
    pdfs["sem-cabecalho-primeiro-com-valor"] = (pdf_razao([sem_cabecalho]),
                                               [r("texto", j({"lancamentos": [{"data": "05/01/2026", "valor_credito": 1}, "x", None]}), "1001 - 2.1")])
    pdfs["sem-cabecalho-json-quebrado"] = (pdf_razao([sem_cabecalho]), [r("texto", '{"lancamentos": [', "1001 - 2.1")])
    pdfs["sem-cabecalho-lista"] = (pdf_razao([sem_cabecalho]), [r("texto", "[1, 2]", "1001 - 2.1")])
    pdfs["sem-cabecalho-saldo-anterior-booleano"] = (pdf_razao([sem_cabecalho]),
                                                    [r("texto", j({**resposta_alfa, "conciliacao": [], "validacao": {}, "saldo_anterior": False}), "1001 - 2.1")])
    pdfs["sem-cabecalho-texto-falha"] = (pdf_razao([sem_cabecalho]), [r("texto", "", "1001 - 2.1", falha=True),
                                                                      r("visao", j(resposta_alfa | {"conciliacao": []}), "1001 - 2.1")])

    # Formato 6: o histórico desenhado 5 vezes numa linha de base 0,96 pt acima da dos dados (o texto entrelaça).
    f6 = cab_relatorio() + cab_tabela() + [conta("4001", "2.1.3.01.0401", "ETA INDUSTRIA LTDA"), saldo_anterior("0,00")]
    for data, lote, hist, deb, cred, saldo in [("28/02/2026", "11190", "VALOR A RECOLHER DE IPI DO PERIODO", "", "2.758,20", "2.758,20C"),
                                               ("28/02/2026", "11192", "VALOR A RECUPERAR DE IPI DO PERIODO", "2.758,20", "", "0,00")]:
        linha = [(X_HIST + 40 * k, hist, "e", -0.96) for k in range(5)]
        linha += [(X_DATA, data, "e"), (X_LOTE, lote, "e"), (D_CTA, "425", "d"), (D_DEB, deb, "d"), (D_CRED, cred, "d"), (D_SALDO, saldo, "d")]
        f6.append(linha)
    f6.append(total("2.758,20", "2.758,20"))
    pdfs["formato-6-sem-digitos"] = (pdf_razao([f6]), [])
    # O mesmo, com as cópias por cima da data e do lote (o exemplo do original): o texto entrelaçado mistura dígitos
    # e letras, e a estratégia por caracteres vence.
    f6d = cab_relatorio() + cab_tabela() + [conta("4002", "2.1.3.01.0402", "ETA INDUSTRIA FILIAL LTDA"), saldo_anterior("0,00")]
    for data, lote, hist, deb, cred, saldo in [("28/02/2026", "11190", "VALOR A RECOLHER DE IPI DO PERIODO", "", "2.758,20", "2.758,20C"),
                                               ("28/02/2026", "11192", "VALOR A RECUPERAR DE IPI DO PERIODO", "2.758,20", "", "0,00")]:
        linha = [(X_DATA + 0.7 + 40 * k, hist, "e", -0.96) for k in range(5)]
        linha += [(X_DATA, data, "e"), (X_LOTE, lote, "e"), (D_CTA, "425", "d"), (D_DEB, deb, "d"), (D_CRED, cred, "d"), (D_SALDO, saldo, "d")]
        f6d.append(linha)
    f6d.append(total("2.758,20", "2.758,20"))
    pdfs["formato-6"] = (pdf_razao([f6d]), [])

    # Formato 4: o histórico repetido 3 vezes na mesma linha de base, sem se sobrepor.
    f4 = cab_relatorio() + cab_tabela() + [conta("5001", "2.1.3.01.0501", "TETA SERVICOS LTDA"), saldo_anterior("4.095,27C")]
    hist = "VLR REF PGTO FGTS 04/2024"
    f4.append([(X_DATA, "20/05/2024", "e"), (X_LOTE, "1167", "e"), (X_HIST, hist, "e"), (210, hist, "e"), (300, hist, "e"),
               (D_CTA, "9", "d"), (D_DEB, "1.118,34", "d"), (D_SALDO, "2.976,93C", "d")])
    f4.append(total("1.118,34", "0,00"))
    pdfs["formato-4"] = (pdf_razao([f4], altura=595), [])

    # Histórico em várias linhas (antes e depois da data), NF e CNPJ, números grandes, data impossível.
    varias = cab_relatorio() + cab_tabela() + [
        conta("6001", "2.1.3.01.0601", "IOTA ALIMENTOS LTDA"),
        saldo_anterior("0,00"),
        lanc("02/03/2026", "900", "VALOR REFERENTE FGTS S/FOLHA DE", "", cred="1.059,14", saldo="1.059,14C"),
        [(X_HIST, "PAGAMENTO - 05/2024", "e")],
        [(X_HIST, "1741", "e")],
        lanc("03/03/2026", "901", "PGTO CONFORME NF Nº 123987 CNPJ 92.111.222/0001-33", "552", deb="59,14", saldo="1.000,00C"),
        [(X_HIST, "SISPAG BOLETO BANCO 341", "e")],
        lanc("31/02/2026", "902", "DATA QUE NAO EXISTE", "552", deb="1,00", saldo="999,00C"),
        total("59,14", "1.059,14"),
    ]
    pdfs["historico-varias-linhas"] = (pdf_razao([varias]), [])

    # Colunas deslocadas: o valor no meio do caminho entre Débito e Crédito, ou além da folga.
    desloc = cab_relatorio() + cab_tabela() + [
        conta("7001", "2.1.3.01.0701", "KAPPA EQUIPAMENTOS SA"),
        saldo_anterior("0,00"),
        lanc("04/03/2026", "41", "COMPRA NF 30303", "425", cred="", saldo="300,00C") + [(D_DEB + 40, "300,00", "d")],
        lanc("05/03/2026", "42", "COMPRA NF 30304", "425", cred="", saldo="400,00C") + [(D_CRED + 6, "100,00", "d")],
        total("0,00", "400,00"),
    ]
    pdfs["colunas-deslocadas"] = (pdf_razao([desloc]), [r("texto", j({"lancamentos": [
        {"data": "04/03/2026", "lote": "41", "historico": "COMPRA NF 30303", "valor_debito": 300, "tipo_operacao": "COMPRA"},
        {"data": "05/03/2026", "lote": "42", "historico": "COMPRA NF 30304", "valor_credito": 100}]}), "7001 - 2.1")])

    # Duas páginas em que o bloco termina no fim da 1ª: o intervalo de linhas alcança a página seguinte.
    pagina1 = cab_relatorio(1) + cab_tabela() + [conta("8001", "2.1.3.01.0801", "LAMBDA PAPEIS LTDA"),
                                                 lanc("06/01/2026", "1", "COMPRA SEM TOTAL", "1", cred="10,00", saldo="10,00C")]
    pagina2 = cab_relatorio(2) + cab_tabela() + bloco_beta()
    pdfs["bloco-no-fim-da-pagina"] = (pdf_razao([pagina1, pagina2]), [r("visao", j({"lancamentos": [
        {"data": "06/01/2026", "lote": "1", "historico": "COMPRA SEM TOTAL", "valor_credito": 10}]}), "8001 - 2.1")])

    # Um fornecedor lido pelas colunas em duas páginas: o "Conta:" repetido continua o bloco, e o cabeçalho da 2ª
    # página (empresa, CNPJ, período e títulos) entra como continuação do histórico do último lançamento.
    p1 = cab_relatorio(1) + cab_tabela() + [conta("9001", "2.1.3.01.0901", "MU MATERIAIS LTDA"), saldo_anterior("0,00"),
                                            lanc("02/01/2026", "71", "COMPRA NF 70001", "425", cred="100,00", saldo="100,00C")]
    p2 = cab_relatorio(2) + cab_tabela() + [conta("9001", "2.1.3.01.0901", "MU MATERIAIS LTDA"),
                                            lanc("03/01/2026", "72", "VLR REF PGTO NF 70001", "29", deb="100,00", saldo="0,00"),
                                            total("100,00", "100,00")]
    pdfs["bloco-em-duas-paginas"] = (pdf_razao([p1, p2]), [])

    # Página em branco (sem texto) e PDF sem fornecedor.
    pdfs["em-branco"] = (pdf_razao([[]]), [])
    pdfs["so-cabecalho"] = (pdf_razao([cab_relatorio() + cab_tabela()]), [r("texto", j({"lancamentos": [{"data": "01/01/2026", "valor_debito": 5}]}))])
    return pdfs


@functools.lru_cache(maxsize=1)
def outros_arquivos() -> dict[str, bytes]:
    """Os que não são PDF de Razão: o texto qualquer, o ZIP, a planilha .xlsx e .xls e o PDF quebrado."""
    import zipfile

    import openpyxl
    import xlwt

    saida: dict[str, bytes] = {"texto-qualquer": b"GIF89a nada de razao", "vazio": b"", "pdf-quebrado": b"%PDF-1.4\n%%EOF"}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("a.txt", "x")
    saida["zip"] = buf.getvalue()
    saida["zip-com-prefixo"] = b"lixo" + buf.getvalue()

    linhas = [["Empresa:", EMPRESA], ["C.N.P.J.:", CNPJ_EMPRESA], ["Período:", "01/01/2026 - 31/03/2026"],
              ["Data", "Lote", "Histórico", "Cta.C.Part.", "Débito", "Crédito", "Saldo-Exercício"],
              ["Conta:", 1001, "2.1.3.01.0001", "FORNECEDOR ALFA LTDA"],
              [None, None, "SALDO ANTERIOR", None, None, None, -1000],
              [datetime(2026, 1, 5), 11190, "COMPRA CONFORME NF NUMERO 123456", 425, None, 2758.2, -3758.2],
              [datetime(2026, 1, 20), 11192, "VLR REF PGTO NF 123456", 29, 2758.2, None, -1000],
              [None, None, "Total da conta", None, 2758.2, 2758.2]]
    wb = openpyxl.Workbook()
    for linha in linhas:
        wb.active.append(linha)
    buf = io.BytesIO()
    wb.save(buf)
    saida["planilha-xlsx"] = buf.getvalue()
    livro = xlwt.Workbook()
    folha = livro.add_sheet("Razao")
    data = xlwt.easyxf(num_format_str="DD/MM/YYYY")
    for i, linha in enumerate(linhas):
        for k, v in enumerate(linha):
            if isinstance(v, datetime):
                folha.write(i, k, v, data)
            elif v is not None:
                folha.write(i, k, v)
    buf = io.BytesIO()
    livro.save(buf)
    saida["planilha-xls"] = buf.getvalue()
    return saida


def _candidatos_do_pdf(parser, conteudo: bytes) -> dict:
    """O texto de cada página nas três estratégias, a escolhida e o texto final (`_extrair_paginas`)."""
    import pdfplumber

    with pdfplumber.open(io.BytesIO(conteudo)) as pdf:
        candidatos = [parser._extrair_candidatos(p) for p in pdf.pages]
        return {"candidatos": candidatos, "estrategia": parser._escolher_estrategia(candidatos), "paginas": parser._extrair_paginas(pdf)}


# ─── Chamadas diretas ───────────────────────────────────────────────────────

def _lanc(data: str, lote, debito="0", credito="0", saldo="0", tipo="COMPRA", **k) -> dict:
    base = {"data_lancamento": datetime.strptime(data, "%d/%m/%Y"), "lote": lote, "historico": k.pop("historico", "x"),
            "conta_partida": None, "valor_debito": Decimal(debito), "valor_credito": Decimal(credito),
            "saldo_apos_lancamento": Decimal(saldo), "saldo_tipo": "", "tipo_operacao": tipo, "numero_nf": None,
            "cnpj_historico": None, "classificacao_incerta": False, "classificado_por_ia": False}
    base.update(k)
    return base


def _forn(codigo: str, nome: str, lancamentos: list, **k) -> dict:
    base = {"codigo_conta": codigo, "conta_contabil": "2.1.3.01.0001", "nome_fornecedor": nome, "saldo_anterior": Decimal("0"),
            "saldo_anterior_tipo": "", "total_debito": Decimal("0"), "total_credito": Decimal("0"), "lancamentos": lancamentos,
            "conciliacao_ia": [], "resumo_ia": {}, "validacao_ia": {}}
    base.update(k)
    return base


HEADER = ("   Data         Lote  Histórico                                                        Cta.C.Part.       Débito"
          "          Crédito         Saldo-Exercício")
LINHA_CRED = ("28/02/2026      11190 VALOR A RECOLHER DE IPI DO PERÍODO                                       425"
              "                      2.758,20                2.758,20C")
LINHA_DEB = ("28/02/2026      11192 VALOR A RECUPERAR DE IPI DO PERÍODO                                       29       2.758,20"
             "                                    0,00")


def _linha(data: str, lote: str, hist: str, cta: str, deb: str, cred: str, saldo: str, deslocar: int = 0) -> str:
    """Uma linha alinhada ao HEADER: cada valor termina na borda da coluna (+ deslocamento)."""
    bordas = {"debito": HEADER.find("Débito") + 6, "credito": HEADER.find("Crédito") + 7, "saldo": HEADER.find("Saldo-Exercício") + 15}
    cta_fim = HEADER.find("Cta.C.Part.") + 11
    s = f"{data}      {lote} {hist}"
    s = s.ljust(cta_fim - len(cta)) + cta
    for nome, v in (("debito", deb), ("credito", cred), ("saldo", saldo)):
        if v:
            fim = bordas[nome] + deslocar
            s = s.ljust(fim - len(v.rstrip("CD")) if v[-1] in "CD" else fim - len(v)) + v
    return s


def chamadas_diretas(mods, rng: random.Random) -> None:
    parser, ai, cons = mods
    reg = lambda nome, fn, *args: _registrar(nome, fn, list(args))  # noqa: E731

    for v in ["1.234,56", "1234,56", "-1.234,56", "R$ 1.234,56", "", "   ", "abc", "1.2.3,4", "1,234,56", "12", "0,00", "-0,00",
              "١٢٣,٤٥", "1.234,56C", "(1,00)", "1e3", "--1", "1-2", "999.999.999.999,99", None, "1_000,00", "+5,00", ".", ",50"]:
        reg("parser.parse_valor", parser.parse_valor, v)
    for v in ["31/01/2025", " 31/01/2025 ", "31/1/2025", "1/1/2025", "31/02/2025", "29/02/2024", "29/02/2025", "00/01/2025",
              "01/13/2025", "01/01/0000", "01/01/25", "2025-01-31", "", None, "31/01/2025 10:00", "٣١/٠١/٢٠٢٥", " 1/01/2025", "1 /01/2025"]:
        reg("parser.parse_data", parser.parse_data, v)
    historicos = ["COMPRAS CONFORME NF. Nº 21100", "NF 123", "NF 1234", "nf 98765 ref", "REF REF NF 4321", "REF 55555", "CT-E 99881",
                  "CT-E123", "NOTA FISCAL 4455", "NOTAFISCAL4455", "CONFORME NF..778899", "123456 - COMPRA", "1234 - COMPRA",
                  "CONFORME NF NÚMERO 1263290", "CONFORME NF NUMERO 1263290", "CONF. NFS 4455", "CONF.NFS4455", "NF Nº 0001",
                  "NF. N° 7777", "NFº 8888", "sem número", "", "PIX CNPJ 91.222.333/0001-44", "CNPJ 91222333000144",
                  "CNPJ 12.345.678/0001-9", "VLR REF PGTO NF ٤٤٥٥٦", "ﬁ NF 12345", "REFERENTE NF 3333", "REF NF 12"]
    for h in historicos:
        reg("parser.extrair_numero_nf", parser.extrair_numero_nf, h)
        reg("parser.extrair_cnpj", parser.extrair_cnpj, h)
    for h in historicos + ["DEVOLUCAO DE MERCADORIA", "ESTORNO", "ADTO A FORNECEDOR", "ADIANTAMENTO", "SERVIÇO", "serviço prestado",
                           "AQUISIÇÃO", "ADQUIRIDO", "BAIXA DE TITULO", "VALOR REF X", "VLR REF X", "PAGAMENTO", "PGTO", "outro"]:
        for deb, cred in [("10.00", "0"), ("0", "10.00"), ("0", "0"), ("-5", "5"), ("5", "5")]:
            reg("parser.classificar_tipo_operacao", parser.classificar_tipo_operacao, h, Decimal(deb), Decimal(cred))

    f4 = "20/05/2024 VLR REF PGTO FGTS 04/2024 1167 VLR REF PGTO FGTS 04/2024 VLR REF PGTO FGTS 04/2024 VLR REF PGTO FGTS 04/2024 9 1.118,34 VLR REF PGTO FGTS 04/2024 4.095,27C"
    linhas = [f4, "curta", "a b c d e f g h", "a b c d e f g h i", "A B C A B C A B C", "A B C A B C A B C D", "X Y X Y X Y X Y X Y",
              "UM DOIS TRES UM DOIS TRES UM DOIS TRES UM", "UM DOIS TRES  UM DOIS TRES  UM DOIS TRES  X", "a.b c d a.b c d a.b c d",
              "PIX ENVIADO PIX ENVIADO PIX ENVIADO PIX ENVIADOX PIX", "ÁGUA LUZ GÁS ÁGUA LUZ GÁS ÁGUA LUZ GÁS", "1 2 3 1 2 3 1 2 3 1 2 3 1 2 3",
              "   lead A B C A B C A B C   ", "\tA B C\tA B C A B C x y"]
    for _ in range(40):
        palavras = ["VLR", "REF", "PGTO", "NF", "123", "FGTS", "04/2024", "1.118,34", "A", "B"]
        linhas.append(" ".join(rng.choice(palavras) for _ in range(rng.randint(5, 22))))
    for l in linhas:
        reg("parser._deduplicar_historico_linha", parser._deduplicar_historico_linha, l)
    reg("parser._preprocessar_bloco", parser._preprocessar_bloco, "\n".join(linhas[:6]))
    reg("parser._preprocessar_bloco", parser._preprocessar_bloco, "")
    for b in [b"", b"%PDF-1.7 x", b"abc", b"PK\x03\x04", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1resto"]:
        reg("parser.calcular_hash_arquivo", parser.calcular_hash_arquivo, b)
        reg("parser.detectar_formato_arquivo", parser.detectar_formato_arquivo, b)
    for nome, conteudo in outros_arquivos().items():
        reg("parser.detectar_formato_arquivo", parser.detectar_formato_arquivo, conteudo)
    # O registro final do ZIP sem o diretório central certo, e com o comentário.
    eocd = b"PK\x05\x06" + bytes(8) + (46).to_bytes(4, "little") + (0).to_bytes(4, "little") + bytes(2)
    for b in [b"x" * 30 + eocd, b"PK\x01\x02" + bytes(42) + eocd, b"q" + b"PK\x01\x02" + bytes(42) + eocd + b"",
              b"PK\x01\x02" + bytes(42) + eocd[:-2] + (3).to_bytes(2, "little") + b"abc", b"\x00" * 21, eocd]:
        reg("parser.detectar_formato_arquivo", parser.detectar_formato_arquivo, b)

    # Runs, linhas e estratégia, com caracteres inventados.
    def chars(texto, x0, top, largura=3.0):
        return [{"text": c, "x0": x0 + i * largura, "x1": x0 + (i + 1) * largura, "top": top, "bottom": top + 7.0} for i, c in enumerate(texto)]

    conjuntos = [
        chars("28/02/2026", 0.0, 113.14) + chars("11192", 58.7, 113.14) + chars("2.758,20", 355.6, 113.14),
        chars("ABC", 10, 10) + chars("DEF", 19.5, 10) + chars("GHI", 30, 10.2) + chars("JKL", 41, 10.31) + chars("MNO", 50, 9.71),
        chars("ZY", 20, 5) + chars("XW", 18, 5) + chars("VU", 17.6, 5) + chars("TS", 14, 5),
        [],
        chars("A", 0, 0, 0.0) + chars("B", 0, 0, 0.0),
        chars("Total da conta:", 0.0, 200.0) + chars("40.679,43", 200.0, 200.0) + chars("40.679,43", 400.0, 200.0),
        chars("VALOR", 100, 50) + chars("VALOR", 102, 50.1) + chars("1.000,00", 99, 51) + chars("ZZ", 300, 52.4) + chars("YY", 300, 52.6),
        chars("ABC", 100, 50) + chars("ABC", 150, 50) + chars("5,00", 148, 50),
        chars("ABC", 100, 50) + chars("ABC", 150, 50) + chars("5,00", 98, 50) + chars("6,00", 148, 50),
        chars("5,00", 100, 50) + chars("5,00", 104, 50) + chars("XY", 50, 50),
        chars("REP", 10, 10) + chars("REP", 12, 10) + chars("REP", 14, 10) + chars("X", 11, 10) + chars("X", 30, 10),
        chars(" ", 0, 0) + chars("a b", 1, 0) + chars(" ", 20, 0),
        chars("NEG", -12, 10) + chars("POS", 8, 10),
    ]
    for _ in range(25):
        c = []
        for _k in range(rng.randint(1, 8)):
            c += chars(rng.choice(["28/02/2026", "11190", "VALOR", "2.758,20", "C", "D", "IPI"]), round(rng.uniform(-5, 500), 2),
                       round(rng.choice([10, 10.2, 10.5, 12.4, 13, 20]) + rng.uniform(0, 0.4), 3), round(rng.uniform(2, 5), 2))
        conjuntos.append(c)
    for cs in conjuntos:
        runs = parser._construir_runs(cs) if cs else []
        reg("parser._construir_runs", parser._construir_runs, cs)
        for largura in (3.7, 3.0, 2.5):
            reg("parser._montar_linhas_de_runs", parser._montar_linhas_de_runs, runs, largura)
        reg("parser._extrair_pagina_por_chars", lambda cs: parser._extrair_pagina_por_chars(SimpleNamespace(chars=cs)), cs)
    textos = ["", "28/02/2026 11190 COMPRA", " 28/02/2026x", "28/02/20261", "2V8A/L0O2R/2 A02 R6ECUPERA1R1 1D9E2 IVPIA LDOOR",
              "ABC123 ABCDE1 A1B2C3D 12.345,67C 1.1.01.0001 99/99/9999-D 2.758,20CD", "ÇÃO123 ção123 ÁGUA9X", "\n\n28/02/2026\n31/03/2026 x"]
    for t in textos:
        reg("parser._pontuar_extracao", parser._pontuar_extracao, t)
    paginas = [[{"layout": "28/02/2026 a", "palavras": "", "chars": "28/02/2026 a"}],
               [{"layout": "", "palavras": "", "chars": ""}], [], [{"layout": "x", "palavras": "28/02/2026", "chars": "28/02/2026 ABC123"}],
               [{"layout": "28/02/2026 ABC123", "palavras": "28/02/2026", "chars": None}], [{"palavras": "28/02/2026"}],
               [{"layout": "2V8A/L0O2R/2", "palavras": "x", "chars": "y"}, {"layout": "28/02/2026", "palavras": "", "chars": "28/02/2026"}]]
    for p in paginas:
        reg("parser._escolher_estrategia", parser._escolher_estrategia, p)

    # As colunas: cabeçalhos largos, estreitos, sem saldo, com dois saldos, com rótulo repetido; linhas alinhadas e deslocadas.
    cabecalhos = [HEADER, "  Data  Lote  Histórico   Cta.C.Part.       Débito          Crédito    Saldo-Exercício",
                  "  Data  Lote  Histórico   Cta.C.Part. Débito Crédito Saldo-Exercício", "Data Lote Débito Crédito",
                  "Data Histórico Débito Crédito Saldo Saldo-Exercício Saldo", "Crédito Débito Histórico Cta.C.Part.",
                  "Débito sem crédito", "Débito Débito Crédito", "Data   Débito Crédito  Cta.C.Part. Histórico", "nada aqui",
                  "Data Lote Histórico Débito Crédito Saldo-Exercício", "DébitoCrédito"]
    for h in cabecalhos:
        reg("parser._colunas_do_header", parser._colunas_do_header, [h])
    reg("parser._colunas_do_header", parser._colunas_do_header, ["sem nada", HEADER, cabecalhos[2]])
    reg("parser._colunas_do_header", parser._colunas_do_header, [])
    colunas = parser._colunas_do_header([HEADER])
    estreitas = parser._colunas_do_header([cabecalhos[2]])
    linhas_val = [LINHA_CRED, LINHA_DEB, _linha("01/03/2026", "300", "COMPRA NF 11111", "425", "", "1.000,00", "1.000,00C"),
                  _linha("01/03/2026", "300", "PGTO", "29", "500,00", "", "500,00C"),
                  _linha("01/03/2026", "301", "DESLOCADO", "29", "500,00", "", "500,00C", 3),
                  _linha("01/03/2026", "302", "DESLOCADO DEMAIS", "29", "500,00", "", "500,00C", 9),
                  _linha("01/03/2026", "303", "OS DOIS", "29", "10,00", "20,00", "10,00D"),
                  _linha("31/02/2026", "304", "DATA IMPOSSIVEL", "29", "10,00", "", "10,00D"),
                  _linha("01/03/2026", "305", "VALOR SEM CENTAVOS 1.000", "29", "1.000", "", ""),
                  "01/03/2026 306 X 12,345 1.234,56", "01/03/2026 307", "   01/03/2026    308   ESPAÇO   1,00",
                  "TOTAL 01/03/2026 309 1,00", "01/03/2026 310 2.758,20C 2.758,20D", "01/03/2026  ", "01/03/2026 311 ٢٫٧٥٨,٢٠",
                  _linha("01/03/2026", "312", "COMPRA NF 22222 HISTORICO MUITO LONGO QUE PASSA DA CONTA", "425", "", "1,00", "1,00C"),
                  _linha("01/03/2026", "313", "", "", "", "7,00", "7,00C")]
    for l in linhas_val:
        for c in (colunas, estreitas):
            reg("parser._valores_por_coluna", parser._valores_por_coluna, l, c)
            reg("parser._ler_linha_lancamento", parser._ler_linha_lancamento, l, c)
            reg("parser._e_continuacao_de_historico", parser._e_continuacao_de_historico, l, c)
    for l in ["", "   ", "CONTINUACAO DO HISTORICO", "1741", "Total da conta: 1,00 2,00", "  Conta: 1 - 2 X", "x 1,00",
              " " * 120 + "5,00", "Folha: 0002", "C.N.P.J.: 99.123.456/0001-91"]:
        reg("parser._e_continuacao_de_historico", parser._e_continuacao_de_historico, l, colunas)
    for fim in range(95, 150, 3):
        reg("parser._coluna_do_valor", parser._coluna_do_valor, fim, colunas)
        reg("parser._coluna_do_valor", parser._coluna_do_valor, fim - 30, estreitas)

    # Blocos inteiros: fecha, não fecha, sem total, sem cabeçalho, continuação, sem movimento, saldo anterior.
    conta_l = "Conta:        1667 - 2.1.3.01.0002                       FORNECEDOR TESTE LTDA"
    tot = lambda d, c: f"{' ' * 58}Total da conta:{' ' * 22}{d}{' ' * 16}{c}"  # noqa: E731
    l1 = _linha("05/01/2026", "11190", "COMPRA CONFORME NF NUMERO 123456", "425", "", "2.758,20", "3.758,20C")
    l2 = _linha("20/01/2026", "11192", "VLR REF PGTO NF 123456", "29", "2.758,20", "", "1.000,00C")
    l3 = _linha("28/01/2026", "11200", "COMPRA  NF   7788", "425", "", "150,00", "1.150,00C")
    blocos = [
        [HEADER, conta_l, "   SALDO ANTERIOR" + " " * 100 + "1.000,00C", l1, l2, l3, tot("2.758,20", "2.908,20")],
        [HEADER, conta_l, l1, l2, l3, tot("2.758,20", "2.908,21")],
        [HEADER, conta_l, l1, l2, l3, tot("2.758,20", "2.908,22")],
        [HEADER, conta_l, l1, l2, l3],
        [conta_l, l1, l2, tot("2.758,20", "2.758,20")],
        [HEADER, conta_l, l1, "     CONTINUACAO DA COMPRA", "     1741", "", l2, "PAGAMENTO - 05/2024", tot("2.758,20", "2.758,20")],
        [HEADER, conta_l, "   saldo anterior   12,00D", tot("0,00", "0,00")],
        [HEADER, conta_l, tot("0,00", "0,00")],
        [HEADER, conta_l, "01/01/2026 sem valor", tot("0,00", "0,00")],
        [HEADER, conta_l, tot("1,00", "0,00")],
        [HEADER, conta_l, l1, "     Conta: 9999 OUTRA", "Total da conta lixo", tot("0,00", "2.758,20")],
        [HEADER, conta_l, l1, tot("0,00", "2.758,20"), tot("9,99", "9,99")],
        [HEADER, l1, "     PIX CNPJ 91.222.333/0001-44", "     ²³", tot("0,00", "2.758,20")],
        [HEADER, "", l1, tot("0,00", "2.758,20")],
    ]
    for b in blocos:
        reg("parser.parsear_bloco_deterministico", parser.parsear_bloco_deterministico, b)

    # O fornecedor: "Conta:" com e sem código, o nome logo abaixo, linhas que não parecem nome.
    contas = [[conta_l], ["Conta: 1667 2.1.3 NOME"], ["Conta:1667-2.1.3.01 NOME COM  ESPAÇOS  "], ["  Conta: 123 NOME LTDA"],
              ["Conta: 12 3 NOME"], ["Conta:", "1234567", "A1B2C3 LTDA", "  ZETA   COMERCIO  ", "OUTRO NOME"], ["Conta:", "", "AB"],
              ["Conta:", "x", "y", "z", "w", "v", "NOME DEPOIS DE CINCO"], ["Conta:"], [], ["sem conta"], ["Conta:  ", "Açaí Ñandú"],
              ["Conta: sem numero", "NOME"], ["Conta:", "1.234,56", "12/03/2026", "ÉÇÃO"], ["x", "Conta:", "NOME UM", "Conta:", "NOME DOIS"]]
    for c in contas:
        reg("parser._identificar_fornecedor", parser._identificar_fornecedor, c)
    for n in ["", "abc", "abcd", "A1B2C3", "1A2B3C", "a1b2c3", "12/03/2026", "1.234,56", "ABCD 1A2B", "Ç ÃO É", "ab cd", "  NOME  ",
              "ʰʰʰʰ", "١٢٣٤", "ABC1D2E3"]:
        reg("parser._parece_nome_fornecedor", parser._parece_nome_fornecedor, n)

    # A resposta da IA: números, textos, datas e lançamentos de todos os jeitos.
    valores = ["null", "0", "1", "-1", "1.5", "1.50", "1e3", "1E-2", '"1.234,56"', '"1234.56"', '" 1 234,56 "', '"abc"', '""', '"1,5"',
               '"NaN"', '"Infinity"', "true", "false", "[1]", '{"a": 1}', '"1_000"', "123456789012345678901234567890", '"R$ 10,00"',
               '"10,"', '"1.2.3"', '"٣,٥"', "-0", "-0.0"]
    for v in valores:
        reg("parser._ia_decimal", lambda t: parser._ia_decimal(json.loads(t, parse_float=Decimal)), v)
    datas = ['"31/01/2025"', '"2025-01-31"', '"31-01-2025"', '"1/1/2025"', '"2025-1-1"', '"31/02/2025"', '" 31/01/2025 "', '"31/01/25"',
             '"2025/01/31"', '""', "null", "0", "20250131", '"31.01.2025"', '"31-1-2025"', '"0000-01-01"', '"2025-13-01"', "[1]",
             '"٣١/٠١/٢٠٢٥"', '"31/01/2025 10:00"', "true", '"29/02/2024"']
    for d in datas:
        reg("parser._ia_data", lambda t: parser._ia_data(json.loads(t, parse_float=Decimal)), d)

    def item(**k):
        base = {"data": "05/01/2026", "lote": "11190", "historico": "COMPRA CONFORME NF NUMERO 123456", "conta_partida": "425",
                "valor_debito": 0, "valor_credito": 2758.20, "saldo_apos": 3758.20, "saldo_tipo": "C", "tipo_operacao": "COMPRA"}
        base.update(k)
        return json.dumps(base, ensure_ascii=False)

    itens = [item(), item(data="2026-01-05"), item(data="05-01-2026"), item(data=None), item(data="xx"), item(tipo_operacao="pagamento"),
             item(tipo_operacao="ADIANTAMENTO"), item(tipo_operacao=None), item(tipo_operacao=5), item(tipo_operacao="outro"),
             item(tipo_operacao="credito"), item(historico=None), item(historico=12), item(historico="  PIX CNPJ 91.222.333/0001-44 NF 7777  "),
             item(conta_partida=0), item(conta_partida=425), item(conta_partida=" 4 "), item(conta_partida=1.5), item(lote=None), item(lote=0),
             item(lote=7459), item(lote=""), item(saldo_tipo=None), item(saldo_tipo=1), item(valor_debito=True), item(valor_credito="abc"),
             item(valor_credito="1.234,56"), item(valor_debito=5, valor_credito=0, tipo_operacao=""),
             item(valor_debito=0, valor_credito=0, tipo_operacao=""), item(valor_debito="NaN", tipo_operacao="DEBITO"),
             item(saldo_apos=None), item(saldo_apos=[1]), '{"data": "05/01/2026"}', "[]", "1", "null", '"x"',
             item(tipo_operacao="DEVOLUCAO", historico="ESTORNO"), item(tipo_operacao="ß")]
    for it in itens:
        reg("parser._normalizar_lancamento_ia", lambda t: parser._normalizar_lancamento_ia(json.loads(t, parse_float=Decimal)), it)

    # O fornecedor da IA, com a correção pela coluna.
    linhas_bloco = [HEADER, conta_l, LINHA_CRED, LINHA_DEB]
    dados = [
        {"lancamentos": [json.loads(item(data="28/02/2026", lote="11190")), json.loads(item(data="28/02/2026", lote="11192", valor_credito=2758.20))]},
        {"lancamentos": []}, {"lancamentos": [json.loads(item(data=None))]},
        {"lancamentos": [json.loads(item())], "conciliacao": "ab", "resumo": [], "validacao": {"observacoes": "xy", "saldo_confere": False}},
        {"lancamentos": [json.loads(item())], "conciliacao": True}, {"lancamentos": [json.loads(item())], "validacao": "x"},
        {"lancamentos": [json.loads(item())], "validacao": {"observacoes": 3}}, {"lancamentos": [json.loads(item())], "total_debito": True},
        {"lancamentos": [json.loads(item())], "saldo_anterior": "1.234,56", "saldo_anterior_tipo": 0, "total_debito": "2.758,20"},
        {"lancamentos": [json.loads(item())], "saldo_anterior_tipo": "D", "conciliacao": {"a": 1}},
        {"lancamentos": "abc"},
    ]
    for d in dados:
        texto = json.dumps(d, ensure_ascii=False)
        for linhas_ in (linhas_bloco, [conta_l, LINHA_CRED], ["sem conta"], ["Conta:", "NOME FORNECEDOR"]):
            reg("parser._construir_fornecedor_de_ia", lambda t, l: parser._construir_fornecedor_de_ia(json.loads(t, parse_float=Decimal), l), texto, linhas_)

    # A correção pela coluna, com candidatos repetidos.
    dup = [HEADER, LINHA_CRED, LINHA_CRED.replace("2.758,20 ", "1.000,00 ", 1), LINHA_DEB, LINHA_DEB]
    for lancs in [[_lanc("28/02/2026", "11190", credito="2758.20"), _lanc("28/02/2026", "11192")],
                  [_lanc("28/02/2026", "11190", debito="1000.00", tipo="PAGAMENTO"), _lanc("28/02/2026", "11190", credito="2758.20")],
                  [_lanc("28/02/2026", "11190", credito="999"), _lanc("28/02/2026", "11190"), _lanc("28/02/2026", "11190")],
                  [_lanc("28/02/2026", "11192", credito="2758.20", tipo="COMPRA"), _lanc("28/02/2026", " 11192 ", tipo="PAGAMENTO")],
                  [_lanc("28/02/2026", "", credito="1")], [_lanc("01/03/2026", "11190", credito="1")], []]:
        for linhas_ in (dup, [HEADER, LINHA_CRED, LINHA_DEB], ["28/02/2026 11192 COMPRA 2.758,20"], [HEADER]):
            reg("parser._corrigir_colunas_por_posicao", parser._corrigir_colunas_por_posicao, lancs, linhas_)

    # Duplicados e fornecedores repetidos.
    a = _lanc("23/06/2025", "444", credito="249.99", saldo="249.99")
    variacoes = [
        [a, dict(a, numero_nf="365866")], [a, dict(a, data_lancamento=datetime(2025, 6, 24))], [a, dict(a, lote="445")],
        [a, dict(a, lote="", data_lancamento=datetime(2025, 6, 24))], [dict(a, lote=""), dict(a, lote="445")],
        [_lanc("01/01/2025", "1"), _lanc("01/01/2025", "1")], [a, dict(a, valor_credito=Decimal("249.990"))],
        [a, dict(a, saldo_apos_lancamento=Decimal("0"))], [dict(a, saldo_apos_lancamento=Decimal("0.00")), dict(a, saldo_apos_lancamento=Decimal("0"))],
        [dict(a, lote=" 444 "), dict(a, lote="444", data_lancamento=datetime(2025, 7, 1), numero_nf="1")],
        [a, dict(a, lote="", data_lancamento=datetime(2025, 7, 1)), dict(a)], [],
    ]
    for v in variacoes:
        reg("parser._deduplicar_lancamentos", parser._deduplicar_lancamentos, v)
    forns = [
        [_forn("1495", "POSTO FICTICIO", [a]), _forn("1495", "POSTO FICTICIO", [dict(a, numero_nf="9")], total_credito=Decimal("249.99"))],
        [_forn("1", "A", [a]), _forn("2", "B", [a]), _forn("1", "A2", [dict(a, valor_credito=Decimal("5"))], saldo_anterior=Decimal("9"),
                                                         total_debito=Decimal("1.0"))],
        [_forn("", "SEM CODIGO", [a]), _forn("3", "C", [a, dict(a)])], [_forn("4", "D", [])], [],
        [_forn("5", "E", [a], saldo_anterior=Decimal("7"), saldo_anterior_tipo="D"), _forn("5", "E", [], saldo_anterior=Decimal("8"))],
    ]
    for f in forns:
        reg("parser.consolidar_fornecedores_duplicados", parser.consolidar_fornecedores_duplicados, f)

    # O consolidador.
    base = dict(_lanc("07/08/2026", "1", credito="10.00"), numero_nf="123")
    grupos = [
        [dict(base, historico="COMPRA NF 123 SÉRIE 1"), dict(base, historico="COMPRA NF 123 SÉRIE 2")],
        [dict(base, historico="COMPRA NF 123 SERIE 1"), dict(base, historico="COMPRA NF 123 série 1", valor_credito=Decimal("5.5"))],
        [dict(base, historico="NF 123 SER. A"), dict(base, historico="NF 123 SER A"), dict(base, historico="NF 123 SR A")],
        [dict(base), dict(base, data_lancamento=datetime(2026, 8, 7, 15, 30)), dict(base, data_lancamento=datetime(2026, 8, 8))],
        [dict(base, numero_nf=None), dict(base, numero_nf=None), dict(base, numero_nf="")],
        [dict(base, tipo_operacao="PAGAMENTO"), dict(base, tipo_operacao="PAGAMENTO"), dict(base, data_lancamento=datetime(2026, 1, 1))],
        [dict(base, serie_nf="b"), dict(base, serie="B"), dict(base, serie_nf=" ", historico="SÉRIE B")],
        [dict(base, historico="SÉRIE Nº: 1-A/2"), dict(base, historico="série no #1-A/2"), dict(base, historico="SER.1-A/2")],
        [dict(base, valor_credito=Decimal("1E+2")), dict(base, valor_credito=Decimal("0.001"))], [],
    ]
    for g in grupos:
        reg("consolidador.consolidar_lancamentos_fornecedor", cons.consolidar_lancamentos_fornecedor, g)
        for l in g:
            reg("consolidador._serie_da_nota", cons._serie_da_nota, l)
    dados_parser = {"hash_arquivo": "x", "empresa": EMPRESA, "cnpj": CNPJ_EMPRESA, "periodo_inicio": None, "periodo_fim": None,
                    "total_fornecedores": 3, "total_lancamentos": 3,
                    "fornecedores": [_forn("1", "A", grupos[0]), _forn("2", "B", grupos[1], total_credito=Decimal("99"), total_debito=Decimal("0.00")),
                                     _forn("3", "C", [], total_credito=Decimal("0"))]}
    reg("consolidador.consolidar_todos_fornecedores", cons.consolidar_todos_fornecedores, dados_parser)

    # As leituras por IA sozinhas: o texto, a imagem em lotes e a classificação.
    r = lambda tipo, content, se=None, **k: {"tipo": tipo, "se": se, "content": content, **k}  # noqa: E731
    j = lambda o: json.dumps(o, ensure_ascii=False)  # noqa: E731
    bloco = "\n".join([HEADER, conta_l, LINHA_CRED, LINHA_DEB])
    for nome, regras, texto in [("ok", [r("texto", j({"lancamentos": [], "total_debito": 1.5}))], bloco), ("curto", [], "x" * 29),
                                ("curto-com-espacos", [], "  " + "x" * 28 + "  "), ("trinta", [], "x" * 30), ("vazio", [], ""),
                                ("sem-lista", [r("texto", j({"lancamentos": {}}))], bloco), ("lista", [r("texto", "[]")], bloco),
                                ("quebrado", [r("texto", "{")], bloco), ("falha", [r("texto", "", falha=True)], bloco),
                                ("numeros", [r("texto", '{"lancamentos": [{"valor_credito": 1e400, "x": NaN}], "y": -Infinity}')], bloco)]:
        for chave in (True, False):
            direta_ia(mods, f"texto-{nome}-{'chave' if chave else 'sem-chave'}", "parsear_bloco_fornecedor_ia", [texto], [texto], regras, chave)
    lote = lambda k: j({"saldo_anterior": k, "saldo_anterior_tipo": "D" if k else "", "total_debito": k, "total_credito": 0,  # noqa: E731
                        "lancamentos": [{"id": k}] if k != 9 else []})
    for nome, n, regras, texto in [
        ("suite-lote-2-de-3", 7, [r("visao", lote(1), uma_vez=True), r("visao", "", falha=True)], ""),
        ("um-lote", 3, [r("visao", lote(1))], bloco), ("um-lote-incompleto", 2, [r("visao", j({"x": 1}))], bloco),
        ("um-lote-lista", 1, [r("visao", "[]")], bloco), ("um-lote-quebrado", 1, [r("visao", "{")], bloco),
        ("um-lote-falha", 1, [r("visao", "", falha=True)], bloco), ("tres-lotes", 7, [r("visao", lote(1), uma_vez=True), r("visao", lote(0), uma_vez=True),
                                                                                  r("visao", lote(3))], bloco),
        ("lotes-vazios", 4, [r("visao", lote(9))], bloco), ("lote-3-incompleto", 9, [r("visao", lote(2), uma_vez=True), r("visao", lote(1), uma_vez=True),
                                                                                    r("visao", "[]")], bloco),
        ("texto-curto", 4, [r("visao", lote(5))], "x" * 20), ("texto-21", 4, [r("visao", lote(5))], "x" * 21),
        ("texto-longo", 2, [r("visao", lote(5))], "é" * 900 + "fim"), ("sem-paginas", 0, [], bloco),
        ("totais-texto", 5, [r("visao", j({"lancamentos": [1], "total_debito": "0", "total_credito": "", "saldo_anterior": "0"}))], bloco),
    ]:
        for chave in (True, False):
            pngs = [b"png-%d" % k for k in range(n)]
            direta_ia(mods, f"visao-{nome}-{'chave' if chave else 'sem-chave'}", "parsear_bloco_fornecedor_ia_visao", [pngs, texto], [n, texto],
                      regras, chave, paginas=n)

    incertos = [_lanc("01/01/2026", "1", debito="10", tipo="DEBITO", classificacao_incerta=True, historico="  TED X  "),
                _lanc("02/01/2026", "2", credito="5.555", tipo="CREDITO", classificacao_incerta=True, numero_nf="1234"),
                _lanc("03/01/2026", "3", credito="7", tipo="COMPRA"),
                _lanc("04/01/2026", "4", tipo="OUTRO", classificacao_incerta=True, historico=""),
                _lanc("05/01/2026", "5", debito="-0", tipo="DEBITO", classificacao_incerta=True)]
    respostas = [
        {"resultados": [{"index": 0, "tipo_operacao": "pagamento", "numero_nf": None}, {"index": 1, "tipo_operacao": "COMPRA", "numero_nf": "9999"},
                        {"index": 2, "tipo_operacao": "x", "numero_nf": 12345}, {"index": 3, "numero_nf": "123"}]},
        {"resultados": [{"index": -1, "tipo_operacao": "COMPRA"}, {"index": 9}, {"index": None}, {"index": True, "tipo_operacao": "DEVOLUCAO"}]},
        {"resultados": [{"index": 0, "tipo_operacao": "COMPRA"}, {"index": "1"}, {"index": 2, "tipo_operacao": "COMPRA"}]},
        {"resultados": [{"index": 0, "tipo_operacao": "COMPRA"}, {"index": 1.0}]}, {"resultados": [{"index": 5.0}, {"index": 0, "tipo_operacao": "OUTRO"}]},
        {"resultados": [{"index": 0, "tipo_operacao": None}]}, {"resultados": [{"index": 0, "tipo_operacao": 7}]},
        {"resultados": [{"index": -9}]}, {"resultados": "ab"}, {"resultados": {}}, {"resultados": 3}, {"outro": 1}, [1],
        {"resultados": [{"index": 0, "numero_nf": 98765.0}, {"index": 1, "numero_nf": " 77 "}, {"index": 2, "numero_nf": [1, 2]}]},
        {"resultados": [1, {"index": 0, "tipo_operacao": "COMPRA"}]}, {"resultados": [{"index": 0, "tipo_operacao": "ß"}]},
    ]
    for k, resp in enumerate(respostas):
        for chave in (True, False) if k == 0 else (True,):
            direta_ia(mods, f"classificacao-{k:02d}-{'chave' if chave else 'sem-chave'}", "classificar_lancamentos_incertos", [incertos],
                      [incertos], [r("classificacao", j(resp))], chave)
    direta_ia(mods, "classificacao-quebrada", "classificar_lancamentos_incertos", [incertos], [incertos], [r("classificacao", "{")])
    direta_ia(mods, "classificacao-falha", "classificar_lancamentos_incertos", [incertos], [incertos], [r("classificacao", "", falha=True)])
    direta_ia(mods, "classificacao-sem-incertos", "classificar_lancamentos_incertos", [incertos[2:3]], [incertos[2:3]], [])


def cenarios_inventados(mods) -> None:
    parser = mods[0]
    for nome, (conteudo, regras) in pdfs_inventados().items():
        _registrar("parser.pdf_candidatos", lambda c: _candidatos_do_pdf(parser, c), [conteudo])
        cenario_combinado(mods, nome, conteudo, respostas=regras)
    for nome, conteudo in outros_arquivos().items():
        cenario(mods, nome, conteudo)
        cenario(mods, f"{nome}-sem-chave", conteudo, chave=False, allow=False)


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_PASTA")
    if not pasta:
        return
    mods = _modulos()
    parser, ai, cons = mods
    for modulo in (parser, cons):
        for nome in dir(modulo):
            fn = getattr(modulo, nome)
            if getattr(fn, "__gabarito__", False):
                setattr(modulo, nome, fn.__wrapped__)
    rng = random.Random(20261126)
    chamadas_diretas(mods, rng)
    cenarios_inventados(mods)

    os.makedirs(pasta, exist_ok=True)
    for sha, conteudo in conteudos.items():
        with open(os.path.join(pasta, f"concilpro-{sha}{_ext(conteudo)}"), "wb") as f:
            f.write(conteudo)

    def trocar(v):
        if isinstance(v, dict) and len(v) == 1 and isinstance(v.get("$arquivo"), str):
            return {"$arquivo": f"concilpro-{v['$arquivo']}{_ext(conteudos[v['$arquivo']])}"}
        if isinstance(v, list):
            return [trocar(x) for x in v]
        if isinstance(v, dict):
            return {k: trocar(x) for k, x in v.items()}
        return v

    for r in chamadas.values():
        r["args"] = trocar(r["args"])
    registros = sorted(chamadas.values(), key=lambda r: (r["fn"], r.get("nome") or "", json.dumps(r["args"], ensure_ascii=False)))
    prompts = {"PARSE": _texto_limpo(ai.PARSE_SYSTEM_PROMPT), "VISION": _texto_limpo(ai.VISION_SYSTEM_PROMPT),
               "CLASSIFY": _texto_limpo(ai.CLASSIFY_SYSTEM_PROMPT)}
    destino = os.path.join(pasta, "concilpro-chamadas.json")
    with open(destino, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"prompts": prompts, "chamadas": registros}, f, ensure_ascii=False, indent=0)
    por_fn: dict[str, int] = {}
    for r in registros:
        por_fn[r["fn"]] = por_fn.get(r["fn"], 0) + 1
    suite = sum(1 for r in registros if r.get("suite"))
    ia = sum(len(r.get("chamadas_ia") or []) for r in registros)
    print(f"\ngabarito: {len(registros)} chamadas {por_fn} ({suite} da suíte, {ia} chamadas à IA simulada) -> {destino}")


def _ext(conteudo: bytes) -> str:
    if conteudo[:4] == b"%PDF":
        return ".pdf"
    if conteudo[:2] == b"PK":
        return ".zip"
    return ".bin"


# ─── Conferência local ──────────────────────────────────────────────────────

def conferir(saida, arquivos):
    """Lê cada Razão com a IA desligada (sem a chave) e grava só o resultado, sem o arquivo."""
    mods = _modulos()
    resultado = {}
    for caminho in arquivos:
        with open(caminho, "rb") as f:
            conteudo = f.read()
        r = rodar_cenario(*mods, conteudo, {**PADRAO, "chave": False, "allow": False})
        r.pop("chamadas_ia")
        resultado[caminho] = r
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False)
    print(f"{len(arquivos)} arquivo(s) -> {saida}")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "conferir":
        sys.path.insert(0, os.getcwd())
        conferir(sys.argv[2], sys.argv[3:])
    else:
        print(__doc__)
        sys.exit(2)
