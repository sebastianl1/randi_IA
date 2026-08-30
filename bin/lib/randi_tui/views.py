"""Vistas navegables dentro de la TUI: catalogo, tier, comparador, hardware."""
from __future__ import annotations

from textual.app import ComposeResult
from textual.screen import Screen
from textual.widgets import Button, Input, ListItem, ListView, Static


def _plot(labels, values, title: str):
    """Barras con textual-plotext (fallback a ASCII si falta)."""
    try:
        from textual_plotext import PlotextPlot

        p = PlotextPlot()
        p.plt.theme("clear")
        p.plt.plotsize(60, 14)
        p.plt.bar(labels, values)
        p.plt.title(title)
        p.refresh()
        return p
    except Exception:
        width = max(1, (max([max(values), 1]) // 2))
        lines = [title, ""]
        for label, v in zip(labels, values):
            bar = "█" * (v if v <= width else width)
            lines.append(f"  {label:<4} {bar} {v}")
        from textual.widgets import Static
        return Static("\n".join(lines))


class _BaseScreen(Screen):
    BINDINGS = [("escape", "go_back", "Volver")]
    TITLE: str = ""
    CSS = """
    #h { padding: 1 2; text-style: bold; color: #fafafa;
         background: #101010; border-bottom: solid #262626; }
    .hw { padding: 1 2; }
    Button { margin: 1 2 0 2; }
    ListView { background: #0a0a0a; }
    ListItem { padding: 0 1; }
    ListItem:focus { background: #1b1b22; }
    """

    def compose_v(self) -> list:
        raise NotImplementedError

    def compose(self) -> ComposeResult:
        yield Static(self.TITLE, id="h")
        for w in self.compose_v():
            yield w
        yield Button("← Volver", id="back", variant="default")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "back":
            self.go_back()

    def go_back(self) -> None:
        self.dismiss()


class ModelsScreen(_BaseScreen):
    TITLE = "Catalogo de modelos (todos los casos)"

    def compose_v(self) -> list:
        return [ListView(id="models-lv")]

    def on_mount(self) -> None:
        self.app.run_worker(self._load())

    async def _load(self) -> None:
        import catalog as _cat
        import compat as _compat
        import hardware as _hw

        lv = self.query_one("#models-lv", ListView)
        try:
            hw = _hw.detect_hardware(cache=True)
            rows = []
            for m in _cat.get_models():
                ev = _compat.evaluate_model_best(m, hw)
                rows.append((ev.grade, m.get("ollamaId") or m["id"],
                             f"q{ev.quant}", m.get("size", "")))
            for grade, mid, quant, size in sorted(rows, key=lambda x: x[0])[:60]:
                lv.append(ListItem(Static(f"[{grade}] {mid:<24} {quant:<6} {size}")))
        except Exception as e:
            lv.append(ListItem(Static(f"error: {e}")))


class TierScreen(_BaseScreen):
    TITLE = "Tier list (S-F) para tu hardware"

    def compose_v(self) -> list:
        import catalog as _cat
        import hardware as _hw
        import recommend as _rec

        st = Static("")
        grades, vals = [], []
        try:
            hw = _hw.detect_hardware(cache=True)
            tiers = _rec.tier_list(_cat.get_models(), hw)
            lines = []
            for grade in "SABCDF?":
                items = tiers.get(grade, [])
                if not items:
                    continue
                grades.append(grade)
                vals.append(len(items))
                lines.append(f"[{grade}] ({len(items)})")
                for it in items[:6]:
                    lines.append(f"   {it['model']['id']}")
            st.update("\n".join(lines) or "Sin datos")
        except Exception as e:
            st.update(f"error: {e}")
        widgets = [st]
        if grades:
            widgets.append(_plot(grades, vals, "Modelos por grado"))
        return widgets


class CompareScreen(_BaseScreen):
    TITLE = "Comparar dos modelos"

    def compose_v(self) -> list:
        return [Input(id="ca", placeholder="modelo A", value="qwen3:8b"),
                Input(id="cb", placeholder="modelo B", value="deepseek-r1:7b"),
                Button("Comparar", id="cmp-go", variant="primary"),
                Static(id="cmp-out", classes="hw")]

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "cmp-go":
            self.compare()

    def compare(self) -> None:
        import catalog as _cat
        import compat as _compat
        import hardware as _hw

        a = self.query_one("#ca", Input).value.strip()
        b = self.query_one("#cb", Input).value.strip()
        out = self.query_one("#cmp-out", Static)
        try:
            hw = _hw.detect_hardware(cache=True)
            lines = []
            for target in (a, b):
                model = next((m for m in _cat.get_models()
                              if m["id"] == target or m.get("ollamaId") == target), None)
                if not model:
                    lines.append(f"no encontrado: {target}")
                    continue
                ev = _compat.evaluate_model_best(model, hw)
                lines.append(f"[{ev.grade}] {model['id']:<22} q{ev.quant} "
                             f"{ev.status} tok/s={ev.toks_per_sec}")
            out.update("\n".join(lines))
        except Exception as e:
            out.update(f"error: {e}")


class HardwareScreen(_BaseScreen):
    TITLE = "Perfil de hardware"

    def compose_v(self) -> list:
        import hardware as _hw
        import recommend as _rec

        st = Static("")
        widgets = [st]
        try:
            hw = _hw.detect_hardware(cache=True)
            prof = _hw.hardware_profile(hw)
            lines = [f"Clase: {prof['class']}", prof["summary"],
                     f"RAM {hw.ram_gb}GB · CPU {hw.cpu_cores} nucleos · {prof['platform']}"]
            usable = prof.get("usableRamGb") or 0
            if hw.ram_gb:
                widgets.append(_plot(["RAM total", "RAM util"], [hw.ram_gb, usable],
                                     "Memoria del sistema (GB)"))
            if not hw.is_apple_silicon and hw.gpu_vram_gb:
                lines.append(f"GPU {hw.gpu_name} · VRAM {hw.gpu_vram_gb}GB · BW {hw.gpu_memory_bw} GB/s")
                widgets.append(_plot(["VRAM", "Comodo (85%)"],
                                     [hw.gpu_vram_gb, round(hw.gpu_vram_gb * 0.85, 1)],
                                     "GPU (GB)"))
            lines.append("")
            lines.append("Mejores picks:")
            for r in _rec.rank_models(_rec.get_models(), hw, limit=6)[:6]:
                lines.append(f"  [{r['evaluation'].grade}] {r['model']['id']} q{r['evaluation'].quant}")
            st.update("\n".join(lines))
        except Exception as e:
            st.update(f"error: {e}")
        return widgets
