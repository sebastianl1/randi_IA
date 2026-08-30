"""RANDI TUI — interfaz interactiva de terminal (Textual).

Estilo de terminal moderno: input `>`, chat con Markdown, command palette,
sidebar (modelos/sesiones/hardware) y vistas (catalogo, tier, compare).

Ejecuta:  randi   (o)  randi chat [modelo]
"""
from .app import RandiApp

__all__ = ["RandiApp", "run_tui"]


def run_tui(argv: list[str] | None = None) -> int:
    from .app import main

    return main(argv or [])
