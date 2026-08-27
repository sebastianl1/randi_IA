"""Tabla de comandos slash del TUI. Los handlers reciben (app, arg)."""
from __future__ import annotations

from typing import TYPE_CHECKING, Callable

if TYPE_CHECKING:
    from .app import RandiApp

Handler = Callable[["RandiApp", str], None]


def _register() -> dict[str, tuple[str, Handler]]:
    C: dict[str, tuple[str, Handler]] = {}

    def cmd(name: str, desc: str):
        def deco(fn: Handler):
            C[name] = (desc, fn)
            return fn
        return deco

    @cmd("/help", "Mostrar ayuda de comandos")
    def _help(app: "RandiApp", arg: str):
        app.action_help()

    @cmd("/model", "Cambiar modelo activo")
    def _model(app: "RandiApp", arg: str):
        app.set_model(arg.strip())

    @cmd("/system", "Definir el system prompt")
    def _system(app: "RandiApp", arg: str):
        app.set_system(arg.strip())

    @cmd("/temp", "Ajustar temperatura (0.0-2.0)")
    def _temp(app: "RandiApp", arg: str):
        app.set_temp(arg.strip())

    @cmd("/clear", "Limpiar la conversacion")
    def _clear(app: "RandiApp", arg: str):
        app.clear_chat()

    @cmd("/save", "Guardar sesion  /save <nombre>")
    def _save(app: "RandiApp", arg: str):
        app.save_session(arg.strip())

    @cmd("/load", "Cargar sesion  /load <nombre>")
    def _load(app: "RandiApp", arg: str):
        app.load_session(arg.strip())

    @cmd("/models", "Listar modelos instalados")
    def _models(app: "RandiApp", arg: str):
        app.list_models_info()

    @cmd("/install", "Instalar un modelo  /install <modelo>")
    def _install(app: "RandiApp", arg: str):
        app.install_model_cmd(arg.strip())

    @cmd("/recommend", "Recomendar por caso de uso  /recommend [chat|code|reasoning|vision]")
    def _recommend(app: "RandiApp", arg: str):
        app.recommend_cmd(arg.strip())

    @cmd("/hardware", "Ver perfil de hardware")
    def _hardware(app: "RandiApp", arg: str):
        app.view_hardware()

    @cmd("/tokens", "Muestras tokens aproximados")
    def _tokens(app: "RandiApp", arg: str):
        app.show_tokens()

    @cmd("/info", "Info de la sesion")
    def _info(app: "RandiApp", arg: str):
        app.show_info()

    @cmd("/image", "Adjuntar imagen  /image <ruta> (vision)")
    def _image(app: "RandiApp", arg: str):
        app.attach_image(arg.strip())

    @cmd("/eco", "Modo eco: menos RAM (on/off)")
    def _eco(app: "RandiApp", arg: str):
        app.toggle_eco()

    @cmd("/code", "Modo programador (on/off)")
    def _code(app: "RandiApp", arg: str):
        app.toggle_code()

    @cmd("/general", "Volver al modo general")
    def _general(app: "RandiApp", arg: str):
        app.toggle_code(force=False)

    @cmd("/tts", "Texto a voz (on/off)")
    def _tts(app: "RandiApp", arg: str):
        app.toggle_tts()

    @cmd("/theme", "Cambiar tema dark/light")
    def _theme(app: "RandiApp", arg: str):
        app.toggle_theme()

    @cmd("/session", "Listar sesiones")
    def _session(app: "RandiApp", arg: str):
        app.list_sessions_cmd()

    @cmd("/catalog", "Abrir catalogo de modelos")
    def _catalog(app: "RandiApp", arg: str):
        app.open_view("models")

    @cmd("/tier", "Abrir tier list")
    def _tier(app: "RandiApp", arg: str):
        app.open_view("tier")

    @cmd("/compare", "Abrir comparador")
    def _compare(app: "RandiApp", arg: str):
        app.open_view("compare")

    @cmd("/exit", "Salir de RANDI")
    def _exit(app: "RandiApp", arg: str):
        app.exit_tui()

    return C


COMMANDS: dict[str, tuple[str, Handler]] = _register()


def completions(prefix: str = "") -> list[str]:
    if not prefix:
        return list(COMMANDS)
    return [c for c in COMMANDS if c.startswith(prefix.lower())]
