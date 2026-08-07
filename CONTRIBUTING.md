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
3. Verifica que todo pase:
   ```bash
   bash -n bin/randi install-ollama.sh bin/ollama-chat
   python3 -m py_compile web/server.py bin/lib/*.py
   for f in web/js/*.js docs/lang/*.js; do node --check "$f"; done
   python3 -c "import json; json.load(open('web/models.json'))"
   ```
4. Envia el PR describiendo que hace y como probarlo.

## Convenciones

- Sin comentarios en el codigo salvo que aporten valor (el proyecto es autocontenido).
- `models.json` es la unica fuente de verdad del catalogo de modelos; no dupliques listas en otros archivos.
- Shebangs con `#!/usr/bin/env bash|python3` (multiplataforma).
- Los scripts bash y python deben ser multiplataforma (Termux/Linux/macOS/Windows).
- El autor de los commits: `Sebastian Laguna <sebasbele11@gmail.com>`.

## Reportes de seguridad

Lee `SECURITY.md`. Para vulnerabilidades, NO abras un issue publico; escribe a los mantenedores en privado.
