#!/usr/bin/env python3
"""Ponte local entre a extensão do TEC e o painel de estudos.

O processo não recebe nem armazena senha. A extensão envia apenas estatísticas
visíveis de páginas do TEC em que o usuário já está autenticado.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def number(value, default=0):
    if value is None or value == "":
        return default
    try:
        return float(str(value).replace("%", "").replace(",", "."))
    except (TypeError, ValueError):
        return default


def normalize(raw: dict, index: int) -> dict:
    attempted = int(number(raw.get("attempted", raw.get("respondidas", raw.get("resolvidas", raw.get("total", 0))))))
    accuracy = number(raw.get("accuracy", raw.get("aproveitamento", raw.get("percentualAcerto", 0))))
    correct = int(number(raw.get("correct", raw.get("acertos", raw.get("certas", 0)))))
    if not correct and attempted and accuracy:
        correct = round(attempted * accuracy / 100)
    incorrect = int(number(raw.get("incorrect", raw.get("erros", max(0, attempted - correct)))))
    name = str(raw.get("name", raw.get("nome", raw.get("title", f"Caderno {index + 1}"))))
    identifier = str(raw.get("id", raw.get("cadernoId", raw.get("codigo", f"import-{index}-{name.lower().replace(' ', '-')}"))))
    subject = str(raw.get("subject", raw.get("area", raw.get("disciplina", "specific")))).lower()
    return {
        "id": identifier,
        "name": name,
        "subject": "general" if any(token in subject for token in ("geral", "portugu", "ingl", "matem", "racioc", "rlm", "legisla", "atualidade")) else "specific",
        "topic": str(raw.get("topic", raw.get("assunto", ""))),
        "attempted": max(0, attempted),
        "correct": max(0, min(correct, attempted or correct)),
        "incorrect": max(0, incorrect),
        "repeatErrors": int(number(raw.get("repeatErrors", raw.get("errosRepetidos", 0)))),
        "lastAttemptAt": raw.get("lastAttemptAt", raw.get("ultimoEstudo", raw.get("lastAttempt"))),
    }


def read_source(path: Path):
    text = path.read_text(encoding="utf-8-sig")
    if path.suffix.lower() == ".csv":
        return list(csv.DictReader(text.splitlines()))
    value = json.loads(text)
    if isinstance(value, list):
        return value
    for key in ("cadernos", "data", "items", "results"):
        if isinstance(value.get(key), list):
            return value[key]
    raise ValueError("JSON sem uma lista cadernos/data/items/results")


def write_snapshot(records, output: Path, source: str) -> dict:
    if not records:
        raise ValueError("O payload não contém cadernos")
    payload = {"version": 1, "source": source, "generatedAt": now_iso(), "cadernos": [normalize(row, i) for i, row in enumerate(records)]}
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, output)
    return payload


def import_snapshot(source: Path, output: Path) -> dict:
    return write_snapshot(read_source(source), output, source.name)


class CORSHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):  # noqa: N802
        if self.path != "/ingest":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            records = body if isinstance(body, list) else next((body.get(key) for key in ("cadernos", "data", "items", "results") if isinstance(body.get(key), list)), [])
            source = str(body.get("source", "tec-extension")) if isinstance(body, dict) else "tec-extension"
            payload = write_snapshot(records, self.server.snapshot_path, source)
            response = json.dumps({"ok": True, "count": len(payload["cadernos"])}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
        except (ValueError, json.JSONDecodeError, OSError) as exc:
            self.send_error(400, str(exc))


def serve(path: Path, port: int):
    path = path.resolve()
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"version": 1, "source": "tec-extension", "generatedAt": now_iso(), "cadernos": []}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    directory = path.parent

    class Handler(CORSHandler):
        pass

    def handler(*args, **kwargs):
        return Handler(*args, directory=str(directory), **kwargs)

    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    server.snapshot_path = path
    print(f"TEC bridge ativo em http://127.0.0.1:{port}/{path.name}")
    print("Use Ctrl+C para encerrar. Nenhuma senha do TEC é armazenada.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nTEC bridge encerrado.")
    finally:
        server.server_close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--import", dest="source", type=Path, help="exportação JSON/CSV do TEC")
    parser.add_argument("--output", type=Path, default=Path("tec_sync.json"), help="snapshot normalizado")
    parser.add_argument("--serve", type=Path, metavar="SNAPSHOT", help="servir snapshot por HTTP local")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    try:
        if args.source:
            payload = import_snapshot(args.source, args.output)
            print(f"Importados {len(payload['cadernos'])} cadernos em {args.output}")
        if args.serve:
            serve(args.serve, args.port)
        if not args.source and not args.serve:
            parser.print_help()
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Erro: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
