# OrquestadorPlus — Definición del proyecto

> Centro de mando personal para desarrolladores: tareas, bugs, notas y bitácora en un solo lugar, en tu equipo y sin conexión.

- **Versión:** Borrador 0.1 · para confirmar diseño
- **Fecha:** 20 de octubre de 2026
- **Maquetas:** [`diseno/pantallas.pdf`](./diseno/pantallas.pdf)

## Índice

1. [Definición del proyecto](#1-definición-del-proyecto)
2. [Requisitos funcionales (RF)](#2-requisitos-funcionales-rf)
3. [Requisitos no funcionales (RNF)](#3-requisitos-no-funcionales-rnf)
4. [Navegación y lenguaje visual](#4-navegación-y-lenguaje-visual)
5. [Pantallas](#5-pantallas)
6. [Matriz de trazabilidad](#6-matriz-de-trazabilidad)
7. [Arquitectura técnica propuesta](#7-arquitectura-técnica-propuesta)
8. [Puntos a confirmar](#8-puntos-a-confirmar)

---

## 1. Definición del proyecto

OrquestadorPlus es una aplicación de escritorio, hecha con Electron, que reúne en un solo lugar el trabajo diario de una persona que desarrolla software.

### Problema

Las tareas, los bugs, las notas técnicas, los comandos frecuentes y lo que se aprende quedan repartidos entre varias apps, servicios en la nube y archivos sueltos. Capturar algo rápido cuesta más de lo que debería, y la información depende de cuentas y servidores de terceros.

### Visión

Un orquestador personal: abrir la app y ver qué toca hoy, capturar una idea en segundos y encontrar cualquier cosa escrita hace años, todo guardado en el propio equipo, sin conexión y en formatos abiertos.

### Usuarios

- **Usuario principal:** una persona que desarrolla software, trabaja en uno o varios proyectos y usa Windows 10/11 o Fedora.
- **Usuarios ocasionales:** compañeros o clientes que reportan un problema por el portal temporal, sin instalar nada ni ver los datos.

### Principios

| Principio | Descripción |
| --- | --- |
| Local primero | Los datos viven en el equipo. Nada se envía a terceros y todo funciona sin internet. |
| Captura sin fricción | Una tarea entra a la bandeja sin pedir proyecto, fecha ni categoría. Se clasifica después. |
| Datos portables | Una base SQLite y notas en Markdown. Respaldar es copiar una carpeta. |
| Teclado primero | Atajos para buscar (`Ctrl K`) y capturar (`Ctrl Espacio`), y navegación completa con teclado. |

### Alcance de la versión 1

**Incluye:** Hoy, bandeja de entrada, tareas (con recurrencia), tablero kanban, proyectos, etiquetas, wiki con enlaces, bugs, bitácora, búsqueda global, exportación, recordatorios y, si el tiempo alcanza, snippets, aprendizaje, pomodoro y portal en red local.

**No incluye:** sincronización entre equipos, cuentas de usuario, colaboración en tiempo real ni acceso al portal desde fuera de la red local (RF-16).

---

## 2. Requisitos funcionales (RF)

Priorizados con MoSCoW: **Must** imprescindible, **Should** importante, **Could** deseable, **Won’t (v1)** fuera de esta versión.

| ID | Requisito | Prioridad |
| --- | --- | --- |
| RF-01 | Capturar rápidamente una tarea o idea sin pedir proyecto, fecha ni categoría (bandeja de entrada) | Must |
| RF-02 | Crear, editar, completar y eliminar tareas, con proyecto opcional | Must |
| RF-03 | Ver “Hoy”: lo que vence hoy, lo atrasado y lo que se marcó para hoy | Must |
| RF-04 | Agrupar tareas en proyectos y verlas en un tablero kanban | Must |
| RF-05 | Ver todas las tareas, incluidas las sueltas, en un tablero general | Must |
| RF-06 | Crear tareas recurrentes (una vez, diaria, semanal, mensual) | Must |
| RF-07 | Etiquetar tareas, notas y bugs, y filtrar por etiqueta | Must |
| RF-08 | Escribir notas y documentación con enlaces entre ellas | Must |
| RF-09 | Registrar bugs con síntoma, causa, solución y estado | Should |
| RF-10 | Buscar de forma global en todo el contenido | Must |
| RF-11 | Exportar toda la información en formatos abiertos | Must |
| RF-12 | Llevar una bitácora diaria de desarrollo | Should |
| RF-13 | Guardar snippets y comandos con botón de copiar | Could |
| RF-14 | Registrar temas de aprendizaje con su avance | Could |
| RF-15 | Recibir reportes de otras personas mediante un formulario temporal en red local | Could |
| RF-16 | Habilitar ese formulario fuera de la red local, de forma opcional y desactivada por defecto | Won’t (v1) |
| RF-17 | Temporizador de enfoque (pomodoro) | Could |
| RF-18 | Recordatorios y notificaciones de tareas | Should |

Resumen: 10 Must · 3 Should · 4 Could · 1 Won’t.

---

## 3. Requisitos no funcionales (RNF)

| ID | Categoría | Requisito |
| --- | --- | --- |
| RNF-01 | Privacidad | Todos los datos quedan en el equipo del usuario; no se envía nada a terceros |
| RNF-02 | Disponibilidad | Funciona completo sin internet |
| RNF-03 | Independencia | Cada instalación es autónoma, sin cuentas ni servidor central |
| RNF-04 | Portabilidad de datos | El usuario puede llevarse toda su información y respaldarla fácilmente |
| RNF-05 | Rendimiento | Abre rápido y la búsqueda responde de forma casi instantánea, incluso con años de datos |
| RNF-06 | Usabilidad | Capturar una tarea toma pocos segundos y se puede usar casi todo con teclado |
| RNF-07 | Seguridad | El formulario externo solo puede enviar reportes, nunca leer ni modificar los datos del usuario |
| RNF-08 | Confiabilidad | No se pierden datos ante cierres inesperados o apagones |
| RNF-09 | Instalación | Se instala y se usa sin conocimientos técnicos ni configuración previa |
| RNF-10 | Consumo de recursos | Puede quedar abierta todo el día sin ralentizar el equipo |
| RNF-11 | Mantenibilidad | Es fácil de ampliar con nuevos módulos sin rehacer lo existente |
| RNF-12 | Compatibilidad | Funciona en Windows 10/11 y Fedora (Linux) con el mismo comportamiento y los mismos datos |
| RNF-13 | Portabilidad de archivos | El archivo de datos es el mismo formato en ambos sistemas, así que se puede mover una base de Windows a Fedora y viceversa sin conversión |
| RNF-14 | Idioma de la interfaz | Toda la interfaz, mensajes y documentación de usuario están en español |
| RNF-15 | Idioma del código | Código, identificadores, comentarios, commits y documentación técnica en inglés |
| RNF-16 | Preparación para i18n | Los textos de la interfaz viven en archivos de traducción y no dentro del código, para poder agregar otro idioma sin reescribir nada |
| RNF-17 | Consistencia visual | La interfaz sigue el diseño de `docs/diseno/pantallas.pdf`: una sola paleta (variables de tema) y componentes comunes (chips, badges, fechas con color, pestañas, tarjetas) que todas las pantallas reutilizan, con buen contraste |

---

## 4. Navegación y lenguaje visual

### Barra lateral

```
Buscar en todo                Ctrl K

PRINCIPAL
  Hoy
  Bandeja de entrada          (contador)
  Tareas
  Tablero

REGISTRO
  Bugs e incidencias          (contador)
  Wiki
  Bitácora

MÁS
  Snippets
  Aprendizaje
  Portal de reportes

● Datos locales, sin conexión
```

### Estructura de cada pantalla

- Título y una línea que explica para qué sirve la vista.
- Acción principal arriba a la derecha (“Nueva tarea”, “Nuevo bug”…).
- Lista o tablero a la izquierda; panel de detalle o contexto a la derecha.
- Contadores en la barra lateral para lo que pide atención (bandeja, bugs abiertos).
- Indicador permanente “Datos locales, sin conexión” (RNF-01, RNF-02).

### Elementos recurrentes

- **Chip de proyecto** (azul) o “Suelta” para tareas sin proyecto.
- **Etiqueta** con `#` en monoespaciada.
- **Chip de repetición** (morado): Diaria, Semanal · domingo, Mensual · día 1…
- **Fecha relativa:** Hoy, Ayer, Hace 2 días; en ámbar si está atrasada.
- **Origen:** “Captura rápida” o “Portal” con el nombre de quien reporta.

### Paleta (aproximada, tomada de las maquetas)

| Uso | Color |
| --- | --- |
| Fondo | `#0F1218` |
| Superficie | `#1A1F28` |
| Acento | `#3FC9A6` |
| Atrasado / aviso | `#E0A33A` |
| Proyecto | `#3B6FD1` |
| Repetición | `#8B6BD9` |

Tipografía: sans-serif para la interfaz y monoespaciada para etiquetas, atajos y código. Solo existe tema oscuro.

---

## 5. Pantallas

Las maquetas están en [`diseno/pantallas.pdf`](./diseno/pantallas.pdf).

### 5.1 Hoy — pág. 1

Cubre: RF-01, RF-03, RF-15, RF-17, RNF-06

La pantalla de inicio. Responde a “¿qué tengo que hacer ahora?”.

- **Captura rápida** arriba (`Ctrl Espacio`): escribir y Enter. Lo capturado va a la bandeja.
- **Atrasadas** (ámbar) y **Para hoy**, con proyecto, etiquetas, repetición y fecha relativa.
- **Enfoque:** pomodoro asociado a una tarea, con sesión actual, pausar y reiniciar.
- **Mañana:** vista previa de lo que viene.
- **Entrantes del portal:** aviso de reportes pendientes de clasificar.

### 5.2 Bandeja de entrada — pág. 2

Cubre: RF-01, RF-02, RF-07, RF-09, RF-15

Todo lo que se captura sin clasificar queda aquí hasta decidir qué hacer con ello.

- Lista de elementos con su origen: **Captura rápida** o **Portal** (con nombre de quien reporta).
- Panel **Clasificar:** convertir en Tarea, Bug o Nota, o Descartar.
- Al convertir se completan título, proyecto y fecha límite (opcionales) y etiquetas.
- “Dejar para después” mantiene el elemento en la bandeja.

### 5.3 Tareas — pág. 9

Cubre: RF-02, RF-05, RF-06, RF-07

Todas las tareas, con y sin proyecto, en forma de lista. Aquí también se administran las series recurrentes.

- Pestañas **Tareas** y **Series recurrentes**.
- Filtros por proyecto y por tipo de repetición.
- Columnas: tarea con etiquetas, proyecto, repetición (Una vez, Diaria, Cada 2 semanas · viernes, Mensual · primer lunes…) y vencimiento.

### 5.4 Tablero — pág. 3

Cubre: RF-04, RF-05, RF-07, RF-15

Las tareas en movimiento, con y sin proyecto, en un kanban.

- Columnas, de izquierda a derecha, cada una con su color y su conteo en el encabezado (“ENTRANTES · 2”): **Entrantes** (ámbar; solo los reportes del portal sin revisar, que se clasifican como tarea o se descartan desde la tarjeta; no tiene botón “+”), **Por hacer** (neutro), **En curso** (azul) y **Hecho** (verde, últimos 7 días). Los tres últimos tienen un botón “+” para crear una tarea en esa columna. Entrantes se ve igual en cualquier tablero y no le afecta el filtro de etiquetas.
- Arriba: un combo box de tablero con el estilo del diseño (“General” por defecto, “Sueltas” —solo las tareas sin proyecto— o un proyecto; RF-04) y chips por etiqueta: se muestran las 8 más usadas y un “más…” despliega el resto; la opción elegida se resalta en turquesa.
- Panel lateral plegable “Proyectos” (se recuerda si está abierto o cerrado): lista los proyectos y permite crear uno nuevo; el último tablero elegido también se recuerda. Con ventana angosta las columnas se desplazan en horizontal.
- Tarjetas compactas: título (recortado si es largo), proyecto o “Suelta”, etiquetas (con “+N” si sobran), repetición y fecha con texto y color (“Venció ayer”, “Mañana”, “Completada ayer”). “Mover a…” vive en un menú que aparece al pasar el mouse o enfocar la tarjeta y se opera con teclado.

### 5.5 Bugs e incidencias — pág. 4

Cubre: RF-07, RF-09, RF-15

Cada ficha guarda síntoma, impacto, causa raíz y solución, para encontrar casos parecidos después.

- Filtros: Todos, Abiertos, Resueltos. Identificador correlativo `BUG-14` y severidad (Alta, Media, Baja).
- Estados: **Nuevo → En análisis → Resuelto → Verificado**.
- Secciones de la ficha: Síntoma, Impacto, Causa raíz, Solución.
- **Casos parecidos:** sugeridos a partir de la búsqueda de texto y etiquetas.

### 5.6 Wiki — págs. 7–8

Cubre: RF-07, RF-08, RF-13, RNF-04, RNF-13

Notas y documentación en modo lectura a pantalla completa, con su propia navegación. Se sale con `Esc`.

- Árbol de secciones a la izquierda (Empezar, Decisiones, Guías, Aprendizaje).
- Índice “En esta página” y **enlaces entrantes** (backlinks) a la derecha.
- Bloques de aviso: Nota, Consejo, Precaución.
- Bloques de código con **Guardar en Snippets**.
- Editar página, fecha de última actualización y navegación anterior / siguiente.

> La maqueta documenta la decisión **ADR-001**: SQLite para tareas, bugs, etiquetas e índice de búsqueda; cada nota como archivo `.md` con frontmatter, compatible con Obsidian o Starlight.

### 5.7 Snippets — pág. 5

Cubre: RF-07, RF-13, RNF-01

Bloques de código de la wiki, listos para copiar.

- Filtros por tipo: SQL, Comandos, Credenciales.
- Cada tarjeta muestra la página de origen (“Desde: Guías / Consultas SQL”), el código, Copiar y etiquetas.
- **Credenciales** ocultas con botón Mostrar, cifradas con el almacén seguro del sistema y excluidas de las exportaciones.
- “Traer de la wiki” importa bloques de código existentes.

### 5.8 Portal de reportes — pág. 6

Cubre: RF-15, RF-16, RNF-07

Un formulario temporal para que otras personas reporten problemas. Solo puede crear reportes; nunca lee el tablero.

- Estado del portal y su dirección en la red local, con “Copiar enlace”.
- **Enlaces por proyecto** con token, expiración y “Revocar”.
- Vista previa de lo que ve quien recibe el enlace y últimos envíos.
- “Acceso desde fuera de la red” apagado por defecto (RF-16, fuera de la v1).

---

## 6. Matriz de trazabilidad

| ID | Prioridad | Pantallas que lo cubren | Estado |
| --- | --- | --- | --- |
| RF-01 | Must | Hoy (captura rápida), Bandeja de entrada | ✅ Diseñado |
| RF-02 | Must | Tareas, Tablero, Hoy · falta el formulario de crear/editar tarea | 🟡 Parcial |
| RF-03 | Must | Hoy | ✅ Diseñado |
| RF-04 | Must | Tablero con combo box (General, Sueltas o proyecto), panel plegable y creación de proyectos · falta renombrar, archivar y eliminar proyectos | 🟡 Parcial |
| RF-05 | Must | Tablero (General y Sueltas), Tareas | ✅ Diseñado |
| RF-06 | Must | Tareas (Series recurrentes) · falta el editor de repetición | 🟡 Parcial |
| RF-07 | Must | Todas (chips #etiqueta), filtros en Tablero y Snippets | ✅ Diseñado |
| RF-08 | Must | Wiki (lectura, backlinks, secciones anidadas hasta 5 niveles) · falta el modo edición | 🟡 Parcial |
| RF-09 | Should | Bugs e incidencias | ✅ Diseñado |
| RF-10 | Must | Solo el acceso “Buscar en todo · Ctrl K” · falta la paleta de resultados | ❌ Falta |
| RF-11 | Must | Ninguna · falta Ajustes / Exportar | ❌ Falta |
| RF-12 | Should | Solo en el menú · falta la pantalla Bitácora | ❌ Falta |
| RF-13 | Could | Snippets, Wiki (Guardar en Snippets) | ✅ Diseñado |
| RF-14 | Could | Aprendizaje (sin maqueta: lista con filtro por estado y formulario en línea) | ✅ Implementado |
| RF-15 | Could | Portal de reportes, Bandeja, Tablero (Entrantes), Hoy | ✅ Diseñado |
| RF-16 | Won’t | Portal (interruptor apagado) | ⏸ Fuera de v1 |
| RF-17 | Could | Hoy (bloque Enfoque) | ✅ Diseñado |
| RF-18 | Should | Ninguna · falta configurar recordatorios y cómo se ve la notificación | ❌ Falta |

**Resultado:** 8 requisitos diseñados, 4 parciales y 5 sin pantalla. Dos de los que faltan son **Must** (RF-10 búsqueda y RF-11 exportación).

---

## 7. Arquitectura técnica propuesta

Propuesta para validar junto con el diseño; nada de esto está decidido todavía.

| Área | Propuesta | Cubre |
| --- | --- | --- |
| Escritorio | Electron con proceso principal, *preload* con `contextBridge` y renderer aislado (`contextIsolation`, sin `nodeIntegration`) | RNF-12 |
| Interfaz | React + TypeScript con Vite; un módulo por pantalla (tasks, inbox, board, bugs, wiki, journal, snippets, learning, portal) | RNF-11, RNF-15 |
| Datos | SQLite (`better-sqlite3`) en un único archivo `datos.db`, modo WAL y transacciones; migraciones versionadas | RNF-08, RNF-13 |
| Notas | Archivos Markdown con frontmatter en `wiki/`; enlaces `[[nota]]` indexados para backlinks | RF-08, RNF-04 |
| Búsqueda | Índice FTS5 de SQLite sobre tareas, bugs, notas, bitácora y snippets | RF-10, RNF-05 |
| Recurrencia | Regla tipo RRULE guardada en la serie; la siguiente instancia se genera al completar la anterior | RF-06 |
| Recordatorios | Planificador en el proceso principal + `Notification` nativa; icono en la bandeja del sistema | RF-18, RNF-10 |
| Credenciales | `safeStorage` de Electron (DPAPI en Windows, libsecret en Fedora) | RNF-01 |
| Portal | Servidor HTTP local con un único endpoint `POST /reportar`, token por enlace, expiración y límite de envíos; escribe solo en la bandeja | RF-15, RNF-07 |
| Exportación | JSON + CSV por entidad y la carpeta de Markdown, comprimidos en un ZIP | RF-11, RNF-04 |
| Idioma | `i18next` con `locales/es.json`; ningún texto de interfaz dentro de los componentes | RNF-14, RNF-16 |
| Empaquetado | `electron-builder`: instalador NSIS para Windows, RPM y AppImage para Fedora | RNF-09, RNF-12 |

### Carpeta de datos

```
OrquestadorPlus/
├── datos.db        tareas, bugs, etiquetas, bitácora, índice de búsqueda
└── wiki/           notas en Markdown (.md con frontmatter)
    └── <nota>.assets/   imágenes y archivos adjuntos, junto a su nota (enlaces Markdown estándar)
```

---

## 8. Puntos a confirmar

Decisiones de diseño que conviene cerrar antes de escribir código.

- [ ] **Pantallas que faltan:** búsqueda global (Ctrl K), Bitácora, Aprendizaje, Ajustes / Exportar, detalle y edición de tarea, editor de repetición, administración de proyectos y edición de la wiki.
- [ ] **Recordatorios (RF-18):** ¿cuándo avisa (hora fija, X minutos antes)? ¿Notificación del sistema, dentro de la app o ambas? ¿Sigue activa con la ventana cerrada, desde la bandeja del sistema?
- [ ] **Columna “Entrantes” del tablero:** los reportes del portal aparecen en la Bandeja y también en el Tablero. ¿Deben estar en ambos o solo en la Bandeja hasta clasificarse?
- [ ] **Columnas del kanban:** ¿fijas (Por hacer, En curso, Hecho) o configurables por proyecto?
- [ ] **Snippets y wiki:** en el diseño cada snippet viene de una página de la wiki. ¿Se puede crear un snippet suelto, sin página de origen?
- [ ] **Credenciales en Snippets:** no está en los RF. Agrega cifrado y exclusión de exportaciones. ¿Se mantiene en la v1 o se deja para después?
- [ ] **RF-16 en la pantalla del portal:** es Won’t (v1) pero aparece el interruptor. ¿Se oculta en la v1 o se muestra deshabilitado?
- [ ] **Estados y campos de bug:** el diseño agrega Impacto, severidad y el estado “Verificado”. ¿Se actualiza RF-09 para incluirlos?
- [ ] **Tema claro:** solo existe el tema oscuro. ¿Se necesita tema claro o seguir el tema del sistema?
- [ ] **Ventana y atajos:** ¿barra de título nativa o personalizada en Windows y Fedora? ¿`Ctrl Espacio` funciona solo con la app enfocada o como atajo global del sistema?
- [ ] **Ubicación de los datos:** ¿carpeta por defecto del sistema o elegida por el usuario al primer inicio (útil para llevarla en una nube o un USB)?
