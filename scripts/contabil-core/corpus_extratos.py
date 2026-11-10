"""Corpus de extratos reais (Fase 4, 10/11/2026): o que o Contábil Core original lê de cada arquivo.

Roda o `parse_pdf` (só as camadas determinísticas: a IA fica desligada) ou o `parse_planilha` em
cada arquivo e grava as transações lidas ou a recusa. O `corpus-extratos.ts` lê os mesmos arquivos
com o porte e compara. Os arquivos são de clientes: ficam fora do git, e a saída também.

Uso, a partir da raiz do contabil-core, com pdfplumber, openpyxl, xlrd e as dependências do projeto:
    python scripts/contabil-core/corpus_extratos.py <saida.json> <arquivo>...
"""
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("OPENAI_ENABLED", "false")
os.environ.setdefault("ALLOW_FINANCIAL_DATA_TO_OPENAI", "false")
# Valores fictícios só para a configuração carregar: nada aqui abre banco.
os.environ.setdefault("SECRET_KEY", "corpus-local-sem-segredo-0123456789abcdef")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://corpus:corpus@127.0.0.1:1/corpus")
sys.path.insert(0, os.getcwd())

from src.domain.extrato.pdf_parser import PDFParseError, parse_pdf  # noqa: E402
from src.domain.extrato.planilha_parser import EXTENSOES, PlanilhaParseError, parse_planilha  # noqa: E402

saida = Path(sys.argv[1])
resultado = {}
for caminho in sys.argv[2:]:
    nome = Path(caminho).name
    conteudo = Path(caminho).read_bytes()
    try:
        if nome.lower().endswith(EXTENSOES):
            # O ano de referência fixo deixa a comparação estável (sem ele, vale o relógio).
            transacoes = parse_planilha(conteudo, nome, 2026)
        else:
            transacoes = parse_pdf(conteudo, None)
        resultado[nome] = {
            "transacoes": [
                {
                    "fitid": t.fitid,
                    "data": t.data.isoformat(),
                    "valor": str(t.valor),
                    "historico": t.historico,
                    "tipo": t.tipo_ofx,
                    "saldo": None if t.saldo_apos is None else str(t.saldo_apos),
                    "ordem": t.ordem,
                }
                for t in transacoes
            ]
        }
    except (PDFParseError, PlanilhaParseError) as exc:
        resultado[nome] = {"erro": str(exc)}
    r = resultado[nome]
    print(nome, len(r["transacoes"]) if "transacoes" in r else "recusa: " + r["erro"][:90])
saida.write_text(json.dumps(resultado, ensure_ascii=False, indent=1), encoding="utf-8")
