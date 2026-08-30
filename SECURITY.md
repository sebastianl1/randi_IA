# Politica de seguridad

RANDI es un proyecto local que ejecuta modelos de IA en tu propio dispositivo. Valoramos la seguridad.

## Reportar una vulnerabilidad

**NO abras un issue publico** para vulnerabilidades. En su lugar, contacta a los mantenedores en privado por el canal de GitHub Security Advisories o por correo a los mantenedores del repositorio.

Incluye en tu reporte:

- Descripcion de la vulnerabilidad y su impacto.
- Pasos para reproducirla.
- Plataforma afectada (Termux, Linux, macOS, Windows, WSL2).
- Version de RANDI afectada.

## Consideraciones de seguridad del proyecto

- **Local por diseno**: los modelos y datos nunca salen de tu dispositivo por defecto.
- **Modelos**: descarga solo modelos oficiales de `https://ollama.com/library`. RANDI no ejecuta codigo de modelos de terceros.
- **Endpoints locales**: `randi web` solo escucha en `localhost` y no debe exponerse a Internet.

## Alcance

Este proyecto se distribuye SIN GARANTIA (licencia MIT). Usalo bajo tu responsabilidad.
