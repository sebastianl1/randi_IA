# Contribuyendo a RANDI

Gracias por querer contribuir. Todo el proyecto es 100% local y open source (MIT).

## Formas de contribuir

- **Reportar bugs**: abre un issue describiendo el problema, tu plataforma (Termux/Linux/macOS/Windows) y los pasos para reproducirlo.
- **Sugerir mejoras**: issues o PRs con propuestas claras.
- **Traducir**: la landing (`docs/lang/`) y el contenido.
- **Añadir modelos**: edita `web/models.json` (fuente unica del catalogo).
- **Escribir codigo**: sigue las convenciones del proyecto.

## Flujo de trabajo

1. Haz fork y crea una rama: `git checkout -b feat/mi-mejora`.
2. Haz cambios pequeños y enfocados.
3. Verifica que todo pase (mismo conjunto que el CI de `.github/workflows/ci.yml`):
   ```bash
   bash -n bin/randi install-ollama.sh bin/ollama-chat
   python3 -m py_compile web/server.py bin/lib/*.py
   for f in web/js/*.js docs/lang/*.js; do node --check "$f"; done
   python3 -c "import json; json.load(open('web/models.json'))"
   python3 -m pytest tests/ -q
   ```
4. Envia el PR describiendo que hace y como probarlo.

## Tests

- Los tests viven en `tests/` y cubren catalogo, seguridad del servidor web e i18n.
- Si tocas `web/server.py` (proxy/TTS/STT/imagegen) o `web/models.json`,
  ejecuta `python3 -m pytest tests/ -q` antes de enviar el PR.

## Convenciones

- Sin comentarios en el codigo salvo que aporten valor (el proyecto es autocontenido).
- `models.json` es la unica fuente de verdad del catalogo de modelos; no dupliques listas en otros archivos.
- Shebangs con `#!/usr/bin/env bash|python3` (multiplataforma).
- Los scripts bash y python deben ser multiplataforma (Termux/Linux/macOS/Windows).
- Commits estilo Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.
- El autor de los commits: `Sebastian Laguna <sebasbele11@gmail.com>`.
- La arquitectura y las decisiones (ADR) se documentan en `docs/ARCHITECTURE.md`; actualizalo si cambias componentes.

## Reportes de seguridad

Lee `SECURITY.md`. Para vulnerabilidades, NO abras un issue publico; escribe a los mantenedores en privado.
