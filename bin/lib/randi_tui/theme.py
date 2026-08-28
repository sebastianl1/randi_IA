"""Tema de la TUI — tokens de color (acento rojo, marca griega Rho)."""

# ── Paleta ────────────────────────────────────────────────────────────
BG = "#0a0a0a"
PANEL = "#101010"
PANEL2 = "#14141b"
LINE = "#262626"
INK = "#e8e8ea"
MUTED = "#9c9c9c"
ACCENT = "#e5484d"          # rojo RANDI
ACCENT_DIM = "#7f1d1d"      # rojo suave (bordestado/fondo)
GOOD = "#22c55e"
BAD = "#ef4444"
WARN = "#f59e0b"
BRAND = "Ρ"                  # letra griega Rho -> RANDI

GRADES = {
    "S": "#22c55e", "A": "#4ade80", "B": "#a3e635",
    "C": "#f59e0b", "D": "#f97316", "F": "#ef4444", "?": "#56565f",
}


def grade_color(grade: str) -> str:
    return GRADES.get(grade, "#56565f")


def tui_css() -> str:
    return f"""
Screen {{ background: {BG}; }}

/* Header */
#status {{ dock: top; height: 2; padding: 0 2; color: {MUTED};
           background: {PANEL}; border-bottom: solid {LINE}; text-style: bold; }}

/* Cuerpo: chat + contexto */
#body {{ height: 1fr; }}
#chat {{ width: 1fr; padding: 1 2; scrollbar-color: #3a3a3a; scrollbar-background: {BG}; }}
#chat Markdown {{ border-left: solid {LINE}; padding-left: 1; color: {INK}; }}
.msg-user {{ background: {PANEL2}; border-left: solid {ACCENT};
            color: {INK}; padding: 0 1; margin: 0 0 1 1; }}
.msg-meta {{ color: #56565f; text-style: bold; margin: 1 0 0 0; }}
.msg-panel {{ padding: 1 2; background: {PANEL}; border: tall {LINE}; color: #d6d6da; }}

/* Panel contexto (derecha) */
#context {{ width: 40; background: #0d0d10; border-left: solid {LINE}; padding: 1 1; height: 1fr; }}

/* Sugerencias de comandos / */
#suggestions {{ dock: bottom; height: 7; background: {PANEL};
               border: tall {LINE}; border-bottom: none; }}
#suggestions ListView {{ background: {PANEL}; }}
#suggestions ListItem {{ padding: 0 1; }}
#suggestions ListView:focus-within ListItem:focus {{ background: #1b1b22; }}

/* Composer full-width (de borde a borde) */
#composer-box {{ dock: bottom; height: 8; border: round {LINE}; background: {PANEL};
                margin: 0 0 1 0; padding: 1; }}
Composer {{ height: 6; background: {PANEL2}; border: none; color: {INK}; }}
#hint {{ dock: bottom; height: 1; color: #56565f; padding: 0 2; text-align: right; }}
"""
