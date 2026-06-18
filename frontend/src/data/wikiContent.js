// Contenido del Wiki de BlissTracker. Estático y versionado junto al código:
// el Wiki evoluciona en el mismo commit donde se agrega/cambia cada feature.
//
// Estructura:
//   WIKI_CATEGORIES = [{ id, label, icon, articles: [Article] }]
//   Article = {
//     id,                 // único en todo el Wiki (usado en la URL ?article=<id>)
//     title,
//     audience,           // 'todos' | 'admin'
//     module,             // null | 'marketing' | 'eos'  (badge informativo)
//     summary,            // una línea (buscador + lista)
//     body,               // markdown (ver components/docs/wikiMarkdown.jsx)
//     tips?,              // string[]  → callout "Para empezar"
//     params?,           // [{ name, desc }] → tabla de parámetros
//     related?,          // string[] de ids de otros artículos
//   }

// Fecha de última actualización del Wiki (YYYY-MM-DD). Actualizar al cambiar el contenido.
// Se muestra al inicio del Wiki como referencia para el equipo.
export const WIKI_LAST_UPDATED = '2026-06-17'

export const WIKI_CATEGORIES = [
  // ── Primeros pasos ────────────────────────────────────────────────────────
  {
    id: 'primeros-pasos',
    label: 'Primeros pasos',
    icon: '🚀',
    articles: [
      {
        id: 'que-es-blisstracker',
        title: '¿Qué es BlissTracker?',
        audience: 'todos',
        module: null,
        summary: 'El sistema operativo de tu agencia: tareas con foco, proyectos, marketing, RRHH y EOS en un solo lugar.',
        body: `BlissTracker es una plataforma para equipos —pensada especialmente para agencias de marketing— que combina un gestor de tareas con foco diario, fichas de proyectos, métricas de marketing, RRHH y el sistema de gestión EOS.

La idea central es simple: en lugar de llenar listas infinitas con prioridades artificiales y fechas que generan ansiedad, BlissTracker te ayuda a responder una sola pregunta cada mañana: **¿qué es lo importante que tengo que hacer hoy?**

## Las piezas grandes

- **Tareas y foco diario** — creás tareas concretas, destacás hasta 3 como tu foco del día y ejecutás de a una por vez.
- **Proyectos** — cada cliente o iniciativa es un proyecto con su ficha, links, situación y briefs.
- **Marketing** — métricas reales de GA4, SEO, redes sociales y Ads, con informes mensuales para el cliente *(módulo opcional)*.
- **EOS** — el sistema de gestión empresarial de *Traction* completo *(módulo opcional)*.
- **RRHH** — legajos, vacaciones, puntualidad e historial de ingresos.
- **IA** — un asistente que te da un insight diario y resúmenes semanales.

## Multi-tenant

Cada empresa es un **workspace** con su propio subdominio (\`tuempresa.blisstracker.app\`). Tus datos nunca se mezclan con los de otro workspace.`,
        tips: [
          'Arrancá por el Dashboard: ahí vive tu día.',
          'Leé el artículo "Tu primer día" para entender el flujo básico en 2 minutos.',
        ],
        related: ['tu-primer-dia', 'glosario'],
      },
      {
        id: 'tu-primer-dia',
        title: 'Tu primer día',
        audience: 'todos',
        module: null,
        summary: 'El Dashboard, la jornada laboral (WorkDay) y el carry-over de tareas explicados paso a paso.',
        body: `Cuando entrás al **Dashboard**, BlissTracker abre automáticamente tu **jornada del día** (WorkDay): una por persona, por workspace y por día calendario.

## El flujo de la mañana

1. **Revisá el Dashboard** — ahí ves tus tareas de hoy.
2. **Mirá las pendientes** — lo que quedó de días anteriores aparece arrastrado (carry-over).
3. **Elegí tus 3 tareas clave** y destacalas — son tu foco real del día.

Si no definís tu foco, el día se desordena solo.

## Carry-over

Las tareas que ayer quedaron en \`PENDING\`, \`PAUSED\` o \`BLOCKED\` se trasladan solas al día siguiente. No se pierde nada y no tenés que recrearlas. Las completadas quedan en el historial.

## Cerrar la jornada

Cuando terminás el día podés **cerrar la jornada**. Eso cierra tu sesión. Al día siguiente, al entrar de nuevo al Dashboard, se abre una jornada nueva con tus pendientes ya arrastradas.`,
        tips: [
          'No cargues más de 10 tareas por día: el resto va al Backlog.',
          'Una sola tarea puede estar "En progreso" a la vez — es a propósito.',
        ],
        related: ['que-es-blisstracker', 'estados-de-tarea', 'tareas-destacadas', 'backlog'],
      },
      {
        id: 'glosario',
        title: 'Glosario',
        audience: 'todos',
        module: null,
        summary: 'Workspace, proyecto, tarea, backlog, jornada, rol… los términos clave en una línea.',
        body: `- **Workspace** — tu empresa dentro de BlissTracker. Tiene su subdominio, miembros y datos aislados.
- **Miembro** — una persona dentro del workspace. Tiene un rol de permisos y un rol de equipo.
- **Rol de workspace** — \`owner\`, \`admin\` o \`member\`. Define qué puede administrar.
- **Rol de equipo** — el rol funcional (ej. Diseñador, Project Manager). Es solo una etiqueta, no da permisos.
- **Proyecto** — un cliente o iniciativa. Agrupa tareas, ficha, links y briefs.
- **Tarea** — una acción concreta a ejecutar. Tiene un estado y opcionalmente está destacada.
- **Jornada (WorkDay)** — tu día de trabajo. Una por persona y por día.
- **Backlog** — planificación futura: lo que no es prioridad hoy.
- **Destacada** — una de tus (máximo 3) tareas foco del día.
- **Insight diario** — la sugerencia que te da la IA cada día.
- **Módulo** — una sección opcional que el admin activa (Marketing, EOS).`,
        related: ['que-es-blisstracker', 'modelo-acceso-proyectos'],
      },
    ],
  },

  // ── Tareas ────────────────────────────────────────────────────────────────
  {
    id: 'tareas',
    label: 'Tareas',
    icon: '✅',
    articles: [
      {
        id: 'escribir-una-tarea',
        title: 'Escribir una buena tarea',
        audience: 'todos',
        module: null,
        summary: 'Una tarea tiene que poder ejecutarse sin pensar. Acción concreta, no un tema vago.',
        body: `Una buena tarea es una **acción concreta** que podés ejecutar sin tener que volver a pensar qué significa.

## Mal ❌

- Ver campaña
- Trabajar en web
- Revisar cliente

Son temas, no acciones. Cuando las leés mañana no sabés qué hacer exactamente.

## Bien ✅

- Ajustar presupuesto campaña Meta cliente X
- Diseñar 3 placas para Instagram cliente Y
- Enviar propuesta por mail a cliente Z

> Regla final: si una tarea no está clara, no se va a hacer.

## Asignar a otra persona

Al crear una tarea elegís a quién se la asignás. Podés asignarla a cualquier integrante **activo del workspace**, sea o no del equipo del proyecto. El selector los agrupa en "Equipo del proyecto" y "Otros del workspace".`,
        tips: [
          'Empezá cada tarea con un verbo en infinitivo: "Diseñar…", "Enviar…", "Ajustar…".',
          'Si una tarea tiene varios pasos grandes, partila en varias.',
        ],
        related: ['estados-de-tarea', 'tareas-destacadas', 'modelo-acceso-proyectos'],
      },
      {
        id: 'estados-de-tarea',
        title: 'Estados de una tarea',
        audience: 'todos',
        module: null,
        summary: 'PENDING → IN_PROGRESS → PAUSED / BLOCKED / COMPLETED. Cómo y cuándo usar cada uno.',
        body: `Cada tarea pasa por estados. La regla de oro: **no mentirte con los estados**.

## Los estados

- **Pendiente** (\`PENDING\`) — todavía no la empezaste.
- **En progreso** (\`IN_PROGRESS\`) — estás trabajando en esto ahora mismo. Solo **una** tarea puede estar en progreso a la vez.
- **Pausada** (\`PAUSED\`) — pausa temporal, la vas a retomar.
- **Bloqueada** (\`BLOCKED\`) — no podés avanzar por algo externo. Hay que registrar el **motivo**, y se notifica a los miembros del proyecto.
- **Completada** (\`COMPLETED\`) — terminado.

## Las transiciones

1. Una tarea \`PENDING\` la **iniciás** → pasa a \`IN_PROGRESS\`.
2. Desde \`IN_PROGRESS\` podés **pausar**, **bloquear** o **completar**.
3. Una \`PAUSED\` se **retoma** y una \`BLOCKED\` se **desbloquea** → vuelven a \`IN_PROGRESS\`.

## Por qué una sola "En progreso"

Para evitar la multitarea. Si arrancás una tarea y ya tenías otra en progreso, el sistema no te deja: primero cerrá o pausá la anterior.`,
        params: [
          { name: 'motivo (bloqueo)', desc: 'Obligatorio al bloquear. Se notifica a los miembros del proyecto.' },
        ],
        tips: [
          'Si no podés avanzar, bloqueá con motivo en vez de simular progreso.',
          'Bloquear no es malo: hace visible qué te está frenando.',
        ],
        related: ['escribir-una-tarea', 'atajos-de-teclado', 'tareas-destacadas'],
      },
      {
        id: 'tareas-destacadas',
        title: 'Tareas destacadas (foco del día)',
        audience: 'todos',
        module: null,
        summary: 'Hasta 3 tareas destacadas. La estrella verde/amarilla/roja es el único indicador de prioridad.',
        body: `Podés destacar hasta **3 tareas a la vez**. Son tu foco real del día y aparecen en la sección "Destacadas: Foco del día".

La estrella tiene 3 niveles de color que vos elegís según urgencia/importancia:

- 🟢 **Verde** (1)
- 🟡 **Amarilla** (2)
- 🔴 **Roja** (3)

No hay un campo de "prioridad" aparte: la estrella **es** el indicador de prioridad. Mantener el límite de 3 te obliga a elegir qué importa de verdad hoy.`,
        params: [
          { name: 'starred', desc: 'Entero 0–3. 0 = sin destacar, 1 = verde, 2 = amarilla, 3 = roja. Máximo 3 tareas destacadas simultáneas.' },
        ],
        tips: ['Si querés destacar una cuarta tarea, primero sacá una de las 3 actuales.'],
        related: ['estados-de-tarea', 'backlog'],
      },
      {
        id: 'backlog',
        title: 'Backlog',
        audience: 'todos',
        module: null,
        summary: 'Planificación futura: lo que no es prioridad hoy. No es un cementerio de tareas olvidadas.',
        body: `El Backlog **no es** una acumulación de tareas ni un lugar donde van a morir las cosas que no hiciste. **Sí es** planificación: lo que no es prioridad hoy pero querés tener anotado.

Las tareas de backlog no aparecen en tu foco del día. Cuando llega el momento, las traés al día de hoy con "Agregar a hoy" y se enganchan a tu jornada.

La IA entiende el backlog como "planificación semanal, no prioridad inmediata" y por eso nunca te sugiere borrarlas.`,
        tips: [
          'Usá el backlog para sacarte cosas de la cabeza sin sobrecargar el día.',
          'Revisá el backlog una vez por semana para subir lo que ya es prioridad.',
        ],
        related: ['tu-primer-dia', 'tareas-futuras-recurrentes'],
      },
      {
        id: 'tareas-futuras-recurrentes',
        title: 'Tareas futuras y recurrentes',
        audience: 'todos',
        module: null,
        summary: 'Programá una tarea para una fecha futura, o creá una serie que se repite (diaria, semanal, mensual, anual).',
        body: `Al crear una tarea tenés dos opciones extra, debajo del botón, que son mutuamente excluyentes.

## Tarea futura (una sola vez)

Le ponés una **fecha de aparición**. Hasta que llega esa fecha, la tarea no aparece en tu foco, backlog ni en el proyecto: queda guardada en la sección **Futuras** del Dashboard (colapsable, al final). Cuando querés adelantarla usás "Traer a hoy".

Si elegís una fecha de hoy o anterior, se trata como una tarea normal.

## Tarea recurrente

Creás una plantilla que se repite:

- **Diaria**, **semanal** (podés elegir varios días de la semana), **mensual** o **anual**.
- Opcionalmente una fecha de fin (si no, no termina nunca).

Cada repetición es una tarea normal con un badge 🔁. La próxima ocurrencia aparece sola el día que corresponde —sin que tengas que hacer nada— y si una no la completaste, queda como carry-over normal: la siguiente igual se genera.

## Editar o borrar una serie

Cuando tocás una tarea recurrente, te pregunta el alcance:

- **Solo esta** — afecta únicamente esa ocurrencia.
- **Esta y todas las siguientes** — actualiza la plantilla y las futuras no completadas (o las borra).

Las ocurrencias ya completadas conservan su historial.`,
        params: [
          { name: 'frecuencia', desc: 'daily | weekly | monthly | annual.' },
          { name: 'días de la semana', desc: 'Solo en semanal. Podés elegir varios (multi-día).' },
          { name: 'fecha de fin', desc: 'Opcional. Vacío = se repite indefinidamente.' },
        ],
        tips: ['Usá recurrentes para rituales: reporte semanal, revisión mensual de campañas, etc.'],
        related: ['backlog', 'estados-de-tarea'],
      },
      {
        id: 'comentarios-menciones',
        title: 'Comentarios y menciones',
        audience: 'todos',
        module: null,
        summary: 'Cualquier miembro puede comentar cualquier tarea. Mencioná con @ para notificar.',
        body: `Cualquier integrante del workspace puede comentar cualquier tarea, sea o no suya.

## Notificaciones

- Cuando comentás, se notifica al **dueño de la tarea** y a quienes ya habían comentado.
- Si mencionás a alguien con **@nombre**, esa persona recibe una notificación de mención (sin duplicar con la del comentario).

Cada tarjeta de tarea muestra la cantidad de comentarios. Hacé click para abrir el hilo.`,
        tips: ['Usá @ para pedir algo puntual a un compañero sin sacarlo de su foco.'],
        related: ['notificaciones'],
      },
      {
        id: 'atajos-de-teclado',
        title: 'Atajos de teclado',
        audience: 'todos',
        module: null,
        summary: 'Navegá y operá tareas sin el mouse. N para nueva tarea, Shift+letra para navegar y para acciones.',
        body: `BlissTracker tiene atajos globales (en cualquier página dentro del workspace) y atajos de acciones (solo en el Dashboard).

## Globales

- **N** — nueva tarea.
- **Shift + D** — Dashboard
- **Shift + Y** — Mis Proyectos
- **Shift + A** — Actividad (tiempo real)
- **Shift + M** — Marketing
- **Shift + R** — Reportes (o Mis reportes si no sos admin)
- **?** — ayuda con todos los atajos
- **Esc** — cierra la ventana abierta

## Acciones de tarea (en el Dashboard)

Con una tarea **en progreso**:

- **Shift + C** — completar
- **Shift + P** — pausar
- **Shift + B** — bloquear (te pide el motivo)

Sin tarea en progreso:

- **Shift + I** — inicia/retoma la primera tarea destacada disponible.

Los atajos de una sola letra no se disparan mientras estás escribiendo en un campo.`,
        tips: ['Tocá ? en cualquier momento para ver el catálogo completo.'],
        related: ['estados-de-tarea'],
      },
    ],
  },

  // ── Proyectos ───────────────────────────────────────────────────────────
  {
    id: 'proyectos',
    label: 'Proyectos',
    icon: '📁',
    articles: [
      {
        id: 'modelo-acceso-proyectos',
        title: 'Proyectos y modelo de acceso',
        audience: 'todos',
        module: null,
        summary: 'El equipo del proyecto es una etiqueta, no una barrera. Cualquiera del workspace puede ver y asignar tareas.',
        body: `Un **proyecto** agrupa el trabajo de un cliente o iniciativa: sus tareas, su ficha (info, links, situación), sus briefs y, si está activo el módulo Marketing, sus métricas.

## El equipo es una etiqueta, no un candado

El "equipo del proyecto" marca **quiénes trabajan principalmente** en él, pero no limita el acceso:

- Cualquier integrante del workspace puede **ver cualquier proyecto**.
- Cualquiera puede **crear y asignar tareas** en cualquier proyecto, sin pasar a ser del equipo.

Lo que sí es solo para miembros del proyecto (o admins) es **editar la ficha**: links, situación, info y briefs.`,
        tips: ['Si colaborás puntualmente en un proyecto ajeno, asignate la tarea sin sumarte al equipo.'],
        related: ['mis-proyectos', 'ficha-proyecto', 'glosario'],
      },
      {
        id: 'mis-proyectos',
        title: 'Mis Proyectos',
        audience: 'todos',
        module: null,
        summary: 'Tu vista personal de proyectos, en 3 grupos: destacados, los tuyos y el resto del workspace.',
        body: `La página **Mis Proyectos** organiza todo en tres secciones, en orden:

1. **Proyectos destacados** — los que marcaste con la estrella (preferencia personal).
2. **Mis proyectos** — donde sos parte del equipo.
3. **Otros proyectos del workspace** — el resto, que también podés ver.

La estrella es por usuario: marcar un proyecto como destacado solo afecta tu vista. Un puntito rojo indica que el proyecto tiene tareas bloqueadas.`,
        params: [
          { name: 'destacado (estrella)', desc: 'Preferencia personal booleana. No afecta a otros usuarios.' },
        ],
        related: ['modelo-acceso-proyectos', 'ficha-proyecto'],
      },
      {
        id: 'ficha-proyecto',
        title: 'Ficha del proyecto: Info, Links, Situación y Briefs',
        audience: 'todos',
        module: null,
        summary: 'Toda la documentación del proyecto: datos, enlaces, contexto y los cuestionarios de relevamiento.',
        body: `Dentro de cada proyecto hay varias pestañas de documentación.

## Info

Datos del proyecto: el **sitio web** (se usa para los análisis de marketing) y las **conexiones** de redes sociales (Instagram, Facebook, LinkedIn, Twitter, TikTok, YouTube).

## Links

Enlaces útiles del proyecto (drive, documentos, etc.). Cualquier miembro puede agregar o borrar.

## Situación

Notas de contexto sobre el estado del cliente/proyecto.

## Briefs

Cuestionarios de relevamiento del cliente. Son **modulares**: no hace falta completar todos. Hay seis tipos:

- **Marca** — el documento madre, transversal. Se completa una sola vez.
- **Orgánico**, **Meta Ads**, **Web**, **SEO/SEM**, **CRM** — uno por servicio.

Cada brief muestra su progreso (X/Y campos) y un estado: Sin empezar / En progreso / Completo (≥80% de campos). El admin puede apagar la sección Briefs globalmente desde Preferencias.`,
        tips: [
          'Cargá el sitio web en Info: sin él no funcionan GEO, SEO ni el Health Score.',
          'Arrancá siempre por el brief de Marca: el resto asume que ya está completo.',
        ],
        related: ['marketing-intro', 'preferencias'],
      },
    ],
  },

  // ── Tu día a día ──────────────────────────────────────────────────────────
  {
    id: 'dia-a-dia',
    label: 'Tu día a día',
    icon: '📊',
    articles: [
      {
        id: 'dashboard',
        title: 'Dashboard y foco del día',
        audience: 'todos',
        module: null,
        summary: 'Tu pantalla principal: tareas de hoy, destacadas, completadas y futuras.',
        body: `El Dashboard es donde transcurre tu día. Muestra, en orden:

- **Destacadas: Foco del día** — tus (máx. 3) tareas foco.
- **Tareas de hoy** — el resto de las pendientes y en curso.
- **Completadas** — lo que terminaste.
- **Futuras** — tareas programadas para más adelante (colapsable).

Desde acá iniciás, pausás, completás y bloqueás tareas, y agregás nuevas con el botón "+ Agregar tarea" o el atajo **N**.`,
        related: ['tu-primer-dia', 'tareas-destacadas', 'atajos-de-teclado'],
      },
      {
        id: 'pizarra-notas',
        title: 'Pizarra de notas',
        audience: 'todos',
        module: null,
        summary: 'Notas rápidas personales que viven en tu navegador. Se puede ocultar desde Preferencias.',
        body: `La pizarra de notas es un espacio personal para anotaciones rápidas. Las notas se guardan localmente por usuario (en tu navegador).

Si no la usás, podés ocultarla desde **Preferencias → Personales → Interfaz**. Apagarla no borra las notas: quedan guardadas y reaparecen si la volvés a activar.`,
        params: [
          { name: 'notesBoardEnabled', desc: 'Preferencia personal. Default activada. Controla si se muestra la pizarra.' },
        ],
        related: ['preferencias'],
      },
      {
        id: 'insight-ia-reporte-semanal',
        title: 'Insight diario IA y reporte semanal',
        audience: 'todos',
        module: null,
        summary: 'Un análisis diario de tu trabajo y un email de resumen los viernes. Configurable desde Preferencias.',
        body: `BlissTracker usa IA para ayudarte a trabajar mejor, sin reemplazar tu criterio.

## Insight diario

Una vez por día recibís un insight: un análisis corto de tu jornada con un título, un mensaje, una sugerencia y, si corresponde, una alerta sobre tu rol o sobre tareas mal definidas. Se basa en tus tareas, tu carry-over, las expectativas de tu rol y tu perfil de memoria.

Podés regenerarlo (con un cooldown de 1 hora).

## Reporte semanal por email

Todos los viernes recibís un email con un análisis de tu productividad de la semana.

## Cómo aprovecharlo

- Leelo todos los días.
- Aplicá al menos una sugerencia.
- Prestá atención a las tareas mal definidas y a los patrones repetidos.

Ignorarlo es perder valor del sistema. Si no lo querés, podés apagar todo el sistema de IA desde Preferencias.`,
        tips: ['Si te resulta ruidoso, apagá solo el coaching de tareas y dejá el insight general.'],
        related: ['como-usa-la-ia', 'preferencias', 'notificaciones'],
      },
      {
        id: 'mis-reportes',
        title: 'Mis reportes',
        audience: 'todos',
        module: null,
        summary: 'Tu actividad y productividad personal. Los admins además tienen los reportes del equipo.',
        body: `**Mis reportes** muestra tu actividad: tareas completadas, tiempo trabajado y evolución.

Si sos admin, además tenés acceso a **Reportes** del equipo completo (por proyecto y por persona) y a la vista de **Actividad** en tiempo real de quién está trabajando en qué.`,
        related: ['insight-ia-reporte-semanal'],
      },
    ],
  },

  // ── Administración ──────────────────────────────────────────────────────
  {
    id: 'administracion',
    label: 'Administración',
    icon: '⚙️',
    articles: [
      {
        id: 'equipo',
        title: 'Equipo: invitaciones, roles y horarios',
        audience: 'admin',
        module: null,
        summary: 'Sumá gente por invitación, asigná roles de permiso y de equipo, y configurá el horario laboral.',
        body: `Los miembros se agregan **solo por invitación** (no se crean contraseñas desde el panel).

## Invitar

Desde **Admin → Equipo** mandás una invitación por email. Se crea un token válido por 7 días; la persona entra a \`/join?token=...\`, acepta y define su propia contraseña.

## Roles

Cada miembro tiene dos roles independientes:

- **Rol de workspace** — \`owner\`, \`admin\` o \`member\`. Define los permisos (quién administra).
- **Rol de equipo** — el rol funcional (ej. Diseñador). Es una etiqueta; lo configurás como texto que referencia los roles definidos.

## Horario laboral

A cada persona le podés cargar un **horario de entrada y salida** (formato 24h, ej. 09:00 / 18:00). Sirve para el cálculo de puntualidad en RRHH. Es opcional: sin horario, esa persona no genera tardanzas.`,
        params: [
          { name: 'role', desc: 'owner | admin | member (permisos del workspace).' },
          { name: 'teamRole', desc: 'Texto que referencia el nombre de un rol de equipo (ej. DESIGNER).' },
          { name: 'workStartTime / workEndTime', desc: 'Horario laboral "HH:MM" (24h). Opcional. Único para todos los días.' },
        ],
        tips: [
          'Reservá "owner" para quien es dueño de la cuenta; usá "admin" para el resto del equipo de gestión.',
          'Cargá horarios solo si vas a usar el seguimiento de puntualidad.',
        ],
        related: ['roles-ia', 'puntualidad-horarios', 'legajo-configurable'],
      },
      {
        id: 'roles-ia',
        title: 'Roles e IA (expectativas de rol)',
        audience: 'admin',
        module: null,
        summary: 'Definí qué se espera de cada rol: resultados, responsabilidades y tareas recurrentes. La IA lo usa.',
        body: `Desde la pestaña **🎯 Roles IA** del panel de Admin definís las expectativas de cada rol del equipo:

- **Descripción / propósito** del rol.
- **Resultados esperados**.
- **Responsabilidades operativas** (agrupadas por categoría).
- **Tareas recurrentes** con su frecuencia: diaria, semanal, mensual, primera semana, etc.

Esto cumple dos funciones: documenta el rol (visible en Docs → Roles) y **alimenta el insight diario de IA**, que compara lo que hacés contra lo que se espera de tu rol.`,
        tips: ['Cuanto mejor definas el rol, más útiles son las alertas de la IA.'],
        related: ['insight-ia-reporte-semanal', 'como-usa-la-ia'],
      },
      {
        id: 'legajo-configurable',
        title: 'Legajo configurable',
        audience: 'admin',
        module: null,
        summary: 'El formulario de datos personales del equipo es editable: ocultá, renombrá y agregá campos propios.',
        body: `El legajo es el formulario de datos personales de cada integrante. Desde **Admin → 📋 Legajo** lo configurás a medida de tu workspace.

## Dos tipos de campo

- **Campos base (builtin)** — los 14 estándar (teléfono, cumpleaños, dirección, DNI, CUIT, alias, banco, estado civil, hijos, educación, grupo sanguíneo, condiciones médicas, obra social, contacto de emergencia). No se pueden borrar, pero sí ocultar, renombrar, marcar obligatorios y reordenar.
- **Campos propios (custom)** — los que agregás vos (texto, número, fecha, selección, sí/no…).

## Quién completa los datos

Cada persona completa su propio legajo desde **Mi Perfil** (self-service). Un legajo está "completo" cuando todos los campos **obligatorios** están cargados.

Podés apagar toda la sección con \`legajoEnabled\`.`,
        params: [
          { name: 'campo obligatorio', desc: 'Define el cálculo de "legajo completo".' },
          { name: 'tipo de campo custom', desc: 'text | textarea | number | date | select | boolean.' },
          { name: 'legajoEnabled', desc: 'Toggle de la tarjeta/aviso de legajos en RRHH.' },
        ],
        tips: ['Marcá como obligatorios solo los campos que realmente necesitás para operar.'],
        related: ['rrhh-panel', 'equipo'],
      },
      {
        id: 'preferencias',
        title: 'Preferencias (globales y personales)',
        audience: 'admin',
        module: null,
        summary: 'Ajustes del workspace (globales) y tus propios toggles personales, incluyendo los módulos.',
        body: `La página de Preferencias tiene dos vistas para los admins.

## Globales (workspace)

Ajustes que afectan a todo el workspace:

- **Timezone**.
- **Configuración de proyectos** — activar/desactivar globalmente las secciones Links, Situación, Horas y Briefs.
- **Seguimiento de horarios y puntualidad** — enciende o apaga todo el bloque de asistencia de RRHH.
- **Proyecto demo** — borrar el proyecto de onboarding.

## Personales

- **Toggles de IA** — insight diario, memoria de aprendizaje, coaching de tareas, email semanal.
- **Interfaz** — mostrar/ocultar la pizarra de notas.
- **Módulos adicionales** — opt-out de los feature flags que el equipo de BlissTracker habilitó (podés apagar Marketing o EOS para tu workspace aunque estén disponibles).

Los no-admins ven solo la vista personal.`,
        params: [
          { name: 'attendanceTrackingEnabled', desc: 'Toggle global del bloque de asistencia/puntualidad.' },
          { name: 'briefsEnabled / linksEnabled / situationEnabled / hoursEnabled', desc: 'Toggles globales de secciones de proyecto.' },
        ],
        related: ['pizarra-notas', 'puntualidad-horarios', 'eos-intro', 'marketing-intro'],
      },
      {
        id: 'empresa-branding',
        title: 'Empresa y branding',
        audience: 'admin',
        module: null,
        summary: 'Datos de tu empresa, logo, banner, colores y tipografías de marca.',
        body: `Desde la configuración del workspace cargás la identidad de tu empresa:

- **Datos** — nombre, descripción, industria, sitio web.
- **Logo y banner** — imágenes (hasta 5 MB).
- **Colores de marca** — paleta con nombre opcional.
- **Tipografías** — con su rol (título, cuerpo, acento).

Estos datos se usan en la app y en los informes de marketing que ven tus clientes.`,
        related: ['marketing-informes'],
      },
      {
        id: 'facturacion',
        title: 'Facturación y plan',
        audience: 'admin',
        module: null,
        summary: 'Trial de 14 días, suscripción por seat vía Stripe y portal de facturación.',
        body: `Cada workspace nuevo arranca con un **trial de 14 días**. Cuando vence sin suscripción, pasa a \`past_due\`.

## Estados del workspace

- \`trialing\` — en período de prueba.
- \`active\` — suscripción al día.
- \`past_due\` — trial vencido o pago fallido.
- \`suspended\` / \`cancelled\`.

## Suscripción

La suscripción es **por seat (asiento) por mes**, gestionada con Stripe. Desde **Facturación** abrís el Checkout para suscribirte o el **Portal** de Stripe para gestionar tu método de pago y facturas.

Las acciones de facturación requieren rol \`admin\` u \`owner\`. Cuando quedan ≤7 días de trial (o el estado es \`past_due\`) aparece un aviso en la barra superior.`,
        tips: ['Suscribite antes de que venza el trial para no perder acceso.'],
        related: ['equipo'],
      },
      {
        id: 'zona-de-peligro',
        title: 'Zona de peligro (borrar workspace)',
        audience: 'admin',
        module: null,
        summary: 'El owner puede programar el borrado del workspace con 48h de gracia. Cualquier admin puede cancelarlo.',
        body: `Desde **Preferencias → Zona de peligro**, el **owner** puede programar la eliminación del workspace. Esto:

- Crea una solicitud con **48 horas de gracia**.
- Envía un email de aviso a todos los admins.
- Puede **cancelarse** por cualquier admin durante esas 48h.

Pasado el plazo, el workspace y todos sus datos se eliminan de forma permanente.`,
        tips: ['Si recibís el aviso por error, cualquier admin puede cancelar la eliminación desde la misma sección.'],
        related: ['facturacion'],
      },
    ],
  },

  // ── RRHH ──────────────────────────────────────────────────────────────────
  {
    id: 'rrhh',
    label: 'RRHH',
    icon: '👥',
    articles: [
      {
        id: 'rrhh-panel',
        title: 'Panel de RRHH',
        audience: 'admin',
        module: null,
        summary: 'MiniDashboard del equipo, legajos por persona e historial de ingresos.',
        body: `El panel de RRHH (\`/admin/rrhh\`) tiene tres partes.

## MiniDashboard

Vista general: usuarios activos, antigüedad promedio, legajos incompletos, cumpleaños y aniversarios próximos (30 días), distribución por rol, último login por persona y —si hay horarios cargados— puntualidad del equipo y tardanzas de hoy.

## Legajos

Vista por persona: hora promedio de ingreso, puntualidad vs horario esperado, proyectos, días de vacaciones (ajustables con ±1) y la grilla de datos personales.

## Ingresos

Historial de logins con filtro por rango de fechas y por persona, agrupado por usuario, con badge de tardanza por persona y por día.`,
        related: ['vacaciones', 'puntualidad-horarios', 'legajo-configurable'],
      },
      {
        id: 'vacaciones',
        title: 'Vacaciones y licencias',
        audience: 'todos',
        module: null,
        summary: 'El equipo solicita licencias, el admin aprueba o rechaza. Saldo de días ajustable.',
        body: `El sistema de licencias cubre varios tipos: vacaciones, estudio, maternidad, paternidad, enfermedad, duelo, mudanza y otros.

## Flujo

1. El integrante **crea una solicitud** (debe ser con al menos **48 horas de anticipación**).
2. El admin la **aprueba o rechaza**.
3. Ambas partes reciben notificación y email.

## Saldo

El admin puede ajustar manualmente el saldo de días de vacaciones de cada persona, y queda registrado el historial de ajustes.`,
        params: [
          { name: 'tipo', desc: 'vacaciones | estudio | maternidad | paternidad | enfermedad | duelo | mudanza | otro.' },
          { name: 'anticipación', desc: 'La fecha de inicio debe ser ≥ 48h en el futuro.' },
          { name: 'estado', desc: 'pending | approved | rejected.' },
        ],
        related: ['rrhh-panel'],
      },
      {
        id: 'puntualidad-horarios',
        title: 'Puntualidad y horarios',
        audience: 'admin',
        module: null,
        summary: 'Tardanza = primer login del día posterior al horario de entrada. Sin tolerancia. Se calcula al vuelo.',
        body: `Si cargaste el **horario laboral** de las personas (en Admin → Equipo), BlissTracker calcula la puntualidad.

## Cómo se define una tardanza

La **tardanza** es cuando el **primer login del día** (la llegada) es posterior al horario de entrada configurado. Los logins siguientes del mismo día no cuentan.

- **Sin tolerancia**: un login 09:01 con horario 09:00 cuenta como +1 minuto tarde.
- Es **determinístico** y se recalcula en cada consulta (no se guarda).
- Las personas **sin horario** configurado no muestran tardanzas y no entran en el promedio.

## Dónde se ve

En el legajo (puntualidad por persona), en la pestaña Ingresos (badge por día) y en el MiniDashboard (puntualidad del equipo + tardanzas de hoy).

Todo el bloque se puede apagar con el toggle **Seguimiento de horarios** en Preferencias → Globales.`,
        params: [
          { name: 'expectedStart', desc: 'Horario de entrada (workStartTime) contra el que se mide.' },
          { name: 'attendanceTrackingEnabled', desc: 'Si está OFF, no se calcula puntualidad en ningún lado.' },
        ],
        tips: ['Si tenés freelancers o gente en otra franja horaria, dejalos sin horario para que no figuren como tarde.'],
        related: ['equipo', 'preferencias', 'rrhh-panel'],
      },
    ],
  },

  // ── EOS ─────────────────────────────────────────────────────────────────
  {
    id: 'eos',
    label: 'EOS',
    icon: '🎯',
    articles: [
      {
        id: 'eos-intro',
        title: 'Qué es EOS y cómo activarlo',
        audience: 'admin',
        module: 'eos',
        summary: 'El sistema de gestión empresarial de Traction (Gino Wickman), con sus 6 componentes.',
        body: `El módulo **EOS** implementa el *Entrepreneurial Operating System* del libro *Traction* de Gino Wickman: un sistema para alinear la visión, las personas y la ejecución de la empresa.

## Activarlo

EOS es un **módulo opcional**. El equipo de BlissTracker lo habilita para tu workspace; luego aparece en \`/admin/eos\`. Si no lo ves, pedí que te activen el módulo EOS.

## Los 6 componentes (+ evaluación)

1. **Visión** — valores, misión, BHAG, estrategia y metas.
2. **Personas** — People Analyzer (GWC) y organigrama de responsabilidades.
3. **Datos** — Scorecard semanal de métricas.
4. **Asuntos** — Issues a resolver (IDS).
5. **Procesos** — documentación de los procesos del negocio.
6. **Tracción** — Rocks trimestrales y reuniones L10 semanales.

Más una **Evaluación organizacional** periódica con análisis de IA.

El acceso a EOS requiere rol admin.`,
        tips: ['Si recién empezás con EOS, arrancá por Visión y después Tracción (Rocks).'],
        related: ['eos-componentes', 'preferencias'],
      },
      {
        id: 'eos-componentes',
        title: 'Los 6 componentes en detalle',
        audience: 'admin',
        module: 'eos',
        summary: 'Visión, Personas, Datos, Asuntos, Procesos, Tracción y la Evaluación, qué hace cada uno.',
        body: `## Visión

Los datos estratégicos del workspace (valores centrales, foco, misión, BHAG de 10 años, estrategia de marketing, metas a 1 y 3 años). Un toggle muestra el VTO (Vision/Traction Organizer) en el formato del libro.

## Personas

- **People Analyzer** — calificás a cada persona en GWC (Gets it, Wants it, Capacity): ¿entiende, quiere y puede su rol?
- **Accountability Chart** — el organigrama de responsabilidades (jerárquico).
- **Strikes** — registro de llamados de atención.

## Datos

El **Scorecard** semanal: métricas numéricas con su responsable y objetivo, semana a semana (períodos por semana ISO).

## Asuntos

Issues con el método **IDS** (Identify–Discuss–Solve). Pueden ser semanales o trimestrales, con prioridad alta/media/baja y estado abierto/resuelto.

## Procesos

Documentación de los procesos del negocio con pasos ordenados. Cada proceso tiene un **rol responsable**. Estos procesos aparecen también en Docs → Procesos.

## Tracción

- **Rocks** — las prioridades del trimestre (\`YYYY-Q1..Q4\`).
- **Reuniones L10** — la reunión semanal de nivel 10, con sus To-Dos.

## Evaluación

18 preguntas (6 componentes × 3) que cada admin califica 1–5. Genera un resultado grupal promediado con análisis de Claude.`,
        related: ['eos-intro'],
      },
    ],
  },

  // ── Marketing ─────────────────────────────────────────────────────────────
  {
    id: 'marketing',
    label: 'Marketing',
    icon: '📈',
    articles: [
      {
        id: 'marketing-intro',
        title: 'Introducción a Marketing y conexiones',
        audience: 'admin',
        module: 'marketing',
        summary: 'Métricas reales de GA4, SEO, redes y Ads por proyecto. Cómo conectar las integraciones.',
        body: `El módulo **Marketing** trae a un solo lugar las métricas reales de cada proyecto: web (GA4 y PageSpeed), SEO (Search Console, keywords, Domain Rating), redes sociales (Instagram, TikTok, LinkedIn), publicidad (Meta Ads, Google Ads), análisis GEO (visibilidad en buscadores de IA) y un Health Score que lo unifica.

## Activarlo

Es un **módulo opcional** que habilita el equipo de BlissTracker. Aparece en \`/marketing\`.

## Requisito previo

Cargá el **sitio web** del proyecto en su pestaña Info: sin él no funcionan GEO, SEO ni PageSpeed.

## Conectar integraciones

Cada fuente se conecta por proyecto, normalmente con OAuth (Google, Meta, TikTok, LinkedIn). Algunas admiten token manual. Si un token expira, la integración queda marcada como "expirada" y la UI te pide reconectar (sin desloguearte).

## Las pestañas

GEO · Web · SEO · Keywords · Canibalización · Instagram · TikTok · LinkedIn · Competidores · Meta Ads · Google Ads · Salud · Informes.`,
        tips: [
          'Conectá primero GA4 y Search Console: son la base del resto.',
          'Si una pestaña dice que el token expiró, reconectá la integración desde ahí mismo.',
        ],
        related: ['marketing-informes', 'marketing-objetivos', 'ficha-proyecto'],
      },
      {
        id: 'marketing-informes',
        title: 'Informes mensuales y link público',
        audience: 'admin',
        module: 'marketing',
        summary: 'Generá un informe mensual por proyecto eligiendo qué secciones incluir, y compartilo por un link público.',
        body: `Los **informes mensuales** consolidan las métricas del proyecto en un documento presentable para el cliente.

## Generación a demanda

El informe **no** se arma solo al entrar: lo generás vos. En el modal "Generar informe" elegís **qué secciones incluir** (las que no elegís ni se consultan ni viajan al link público). El sistema te avisa si alguna integración está caída antes de generar.

Para regenerar volvés a elegir secciones; eso limpia el análisis y los datos cacheados y rearma solo lo elegido.

## Link público

Cada informe tiene un **link público** (\`/report/:token\`) que el cliente abre sin login. Ese link da acceso a **todos los informes generados** del proyecto (puede navegar entre meses), así que tené presente esa implicación de privacidad. El preview en WhatsApp/redes (Open Graph) muestra el banner del informe.

## Banner

Podés subirle un banner de portada a cada informe (hasta 5 MB).`,
        params: [
          { name: 'enabledSections', desc: 'Las secciones a incluir. Null = informe aún no generado.' },
        ],
        tips: ['Incluí solo las secciones con datos reales del mes: un informe corto y sólido vale más que uno lleno de vacíos.'],
        related: ['marketing-intro', 'marketing-objetivos', 'empresa-branding'],
      },
      {
        id: 'marketing-objetivos',
        title: 'Objetivos de marketing',
        audience: 'admin',
        module: 'marketing',
        summary: 'Objetivos medibles por proyecto que se comparan automáticamente contra los datos reales.',
        body: `Los **objetivos de marketing** son metas estructuradas y persistentes por proyecto. Se mantienen mes a mes hasta que las edites o borres, y BlissTracker calcula su cumplimiento **automáticamente** contra los datos reales.

## Cómo se arman

Cada objetivo se define en cascada: **categoría → métrica → periodicidad → parámetros → target**.

- **Categorías**: web, seo, rrss, ads.
- **Métricas**: leads/visitas/performance (web), posicionamiento (seo), seguidores/interacción/competidores (rrss), inversión/clicks/ctr (ads).
- **Periodicidad**: mensual, trimestral o anual (períodos calendario).

## Cómo se calcula

- Las métricas de **flujo** (visitas, leads, seguidores nuevos…) **acumulan** los meses del período.
- Las métricas de **stock** (performance, posición SEO, CTR) toman el **último valor** del período.
- La posición SEO usa dirección "menos es mejor".

Cada objetivo muestra su progreso con barra, etiqueta de período y un estado (cumplido, parcial, no cumplido, informativo, sin datos…). Los objetivos no se cachean: si editás el target, se refleja al instante. Aparecen en el informe (resultados, no el editor) si incluís la sección Objetivos.`,
        params: [
          { name: 'category', desc: 'web | seo | rrss | ads.' },
          { name: 'periodicity', desc: 'monthly | quarterly | annual (períodos calendario).' },
          { name: 'target', desc: 'El valor objetivo a alcanzar.' },
        ],
        tips: ['Definí pocos objetivos por proyecto pero claros: el cliente entiende mejor 3 metas que 10.'],
        related: ['marketing-informes', 'marketing-intro'],
      },
      {
        id: 'marketing-avanzado',
        title: 'GEO, Salud, SEO, Keywords, RRSS y Ads',
        audience: 'admin',
        module: 'marketing',
        summary: 'Resumen de las pestañas avanzadas de Marketing (en expansión).',
        body: `Resumen breve de las pestañas avanzadas. *(Este artículo se irá ampliando.)*

## GEO

Análisis de visibilidad en buscadores de IA (ChatGPT, Perplexity, Gemini…). Da un score 0–100, detecta señales negativas y permite generar un \`llms.txt\` y Schema.org sugerido.

## Salud (Health Score)

Combina GEO, keywords, GA4 y PageSpeed en un único score de salud del proyecto.

## SEO

Datos de Google Search Console (impresiones, clicks, posición), **Domain Rating** de Ahrefs y snapshots mensuales.

## Keywords

Seguimiento de posiciones por keyword, heatmap, sugerencias y snapshots SERP (posición, features, competidores, "People Also Ask").

## Canibalización

Detecta páginas del mismo sitio que compiten por la misma keyword.

## Redes sociales

Instagram, TikTok y LinkedIn: seguidores, engagement, mejores posts del mes y snapshots mensuales. Instagram puede conectarse por scraping (solo cuentas públicas). También hay seguimiento de **competidores**.

## Ads

Meta Ads y Google Ads: inversión, impresiones, clicks, CTR y conversiones, con snapshots mensuales.`,
        related: ['marketing-intro', 'marketing-informes'],
      },
    ],
  },

  // ── IA y notificaciones ────────────────────────────────────────────────────
  {
    id: 'ia-notificaciones',
    label: 'IA y notificaciones',
    icon: '🤖',
    articles: [
      {
        id: 'como-usa-la-ia',
        title: 'Cómo usa BlissTracker la IA',
        audience: 'todos',
        module: null,
        summary: 'Insight diario, memoria de aprendizaje, reporte semanal y el presupuesto mensual de tokens.',
        body: `BlissTracker usa modelos de Claude para asistirte, siempre como apoyo y nunca de forma intrusiva.

## Dónde aparece

- **Insight diario** — análisis corto de tu jornada.
- **Memoria de aprendizaje** — un perfil semanal que recuerda tus tendencias, fortalezas y áreas de atención, y que hace los insights más precisos con el tiempo.
- **Reporte semanal** — email de productividad los viernes.
- **Marketing** — análisis de métricas, GEO, SEO y generación de informes.

## Controlar la IA

Desde **Preferencias → Personales** prendés/apagás: insight diario (toggle maestro), memoria, coaching de tareas y email semanal. La memoria y el coaching dependen del toggle maestro.

## Presupuesto de tokens

Cada workspace tiene un **presupuesto mensual de tokens** de IA. Cuando se acerca al límite aparecen avisos (90% / 95%) y, si se supera, las funciones de IA se pausan hasta el mes siguiente. El equipo de BlissTracker puede ajustar el límite por workspace.`,
        params: [
          { name: 'dailyInsightEnabled', desc: 'Toggle maestro del sistema de IA. Apagar baja también memoria y coaching.' },
          { name: 'monthlyTokenLimit', desc: 'Presupuesto mensual de tokens del workspace. 0 = ilimitado.' },
        ],
        related: ['insight-ia-reporte-semanal', 'preferencias'],
      },
      {
        id: 'notificaciones',
        title: 'Notificaciones',
        audience: 'todos',
        module: null,
        summary: 'Campanita con filtros por tipo: comentarios, menciones, bloqueos, tareas completadas, vacaciones…',
        body: `La campanita agrupa tus notificaciones por tipo. Los tipos incluyen: tarea completada, tarea bloqueada, agregado a un proyecto, comentario en tarea, mención (@), y solicitudes/revisiones de vacaciones.

## Lectura por tipo

El panel marca como leído **solo el tipo que estás viendo**, no todo. Cada ícono lleva un badge con la cantidad sin leer de ese tipo, así sabés qué te falta revisar.

Cada notificación es un link que abre directamente la tarea o el comentario relacionado.`,
        related: ['comentarios-menciones', 'vacaciones'],
      },
    ],
  },
]

// Lista plana de todos los artículos (para búsqueda y resolución por id).
export const ALL_ARTICLES = WIKI_CATEGORIES.flatMap(c =>
  c.articles.map(a => ({ ...a, categoryId: c.id, categoryLabel: c.label, categoryIcon: c.icon }))
)

export function findArticle(id) {
  return ALL_ARTICLES.find(a => a.id === id) || null
}
