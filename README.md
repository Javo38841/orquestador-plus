# OrquestadorPlus

Centro de mando personal para desarrolladores: tareas, bugs, notas y bitácora en un solo lugar, en tu equipo y sin conexión.

Aplicación de escritorio para **Windows 10/11** y **Fedora**, hecha con Electron y Angular. Todos los datos quedan en tu equipo: una base SQLite y tus notas en Markdown.

> Estado: en construcción (antes de la v0.1.0).

## Documentación

- [Definición del proyecto](docs/definicion-del-proyecto.md): visión, requisitos funcionales y no funcionales, pantallas y trazabilidad.
- [Maquetas de las pantallas](docs/diseno/pantallas.pdf)
- [Decisiones de arquitectura (ADR)](docs/diseno/adr/)

## Ramas y versiones

| Rama | Qué es |
| --- | --- |
| `develop` | Integración. Cada merge publica la build **OrquestadorPlus Dev** en el pre-release `dev-latest`. |
| `main` | Producción. Cada tag `vX.Y.Z` publica los instaladores en GitHub Releases. |

La build Dev y la de producción se instalan como apps distintas y no comparten datos.

## Desarrollo

Las instrucciones técnicas (comandos, convenciones y flujo de agentes) están en [`CLAUDE.md`](CLAUDE.md).
