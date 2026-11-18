# Rutas del frontend

> Se movió desde `CLAUDE.md` para que no se cargue en todas las sesiones. Leelo cuando la tarea toque este tema.

La fuente es `frontend/src/App.jsx`.

```
/                 → Landing.jsx          (pública, sólo en dominio raíz blisstracker.app sin subdominio)
                  → Dashboard.jsx        (PrivateRoute, en subdominio de workspace)
/login            → Login2.jsx
/register         → Register.jsx         (crear workspace)
/pricing          → Pricing.jsx          (pública) — planes, calculadora interactiva, tabla comparativa de 25+ filas, FAQ específico de pricing
/join             → JoinWorkspace.jsx    (aceptar invitación, ?token=)
/forgot-password  → ForgotPassword.jsx
/reset-password   → ResetPassword.jsx
/condiciones      → TermsPage.jsx        (pública) — Términos de servicio
/privacidad       → TermsPage.jsx        (pública) — Política de privacidad
/reportes       → Reportes.jsx        (PrivateRoute)
/proyectos      → Proyectos.jsx       (PrivateRoute)
/proyectos/:id  → ProjectDetail.jsx    (PrivateRoute)
/profile          → MyProfile.jsx        (PrivateRoute)
/preferences      → Preferences.jsx      (PrivateRoute)
/realtime         → RealTime.jsx         (PrivateRoute)
/docs             → Docs.jsx             (PrivateRoute)
/marketing        → Marketing.jsx        (PrivateRoute) — `?tab=&sub=&view=&projectId=`. Secciones (`marketingNav.js` NAV): Prioridades (panel de Conexiones + hallazgos) · GEO / SEO (Diagnóstico [vistas GEO/SEO/On-Page/Canibalización] · Keywords y oportunidades · Contenido SEO [Content Brief/Content Gap/Inventario del blog]) · Web · RRSS · Anuncios · **Mailing** (Campañas/Bases y contactos/Configuración, `?campaign=<id>` abre una; solo con el flag `mailing`, ver `docs/claude/mailing.md`) · Informes. Los ids viejos de sub-pestaña (`geo`, `seo`, `onpage`, `canibalizacion`, `content-gap`, `plan`) se reescriben vía `LEGACY_SUB_MAP`.
/contenido        → Contenido.jsx        (PrivateRoute) — requiere feature flag `contenido`. Calendario de contenido: vistas Calendario/Tabla/Kanban + modal de detalle, selector de proyecto y estado en la URL (`?view=&projectId=&month=&piece=&status=&network=`). El recorte de la vista es el **mes** (`?month=`, `none` = sin programar), no el estado: la Tabla navega por pestañas de mes y muestra todo junto, publicadas incluidas. — ver "Vistas y navegación" en `docs/claude/contenido.md`. El viejo `?view=inventario` redirige a Marketing → GEO / SEO → Contenido SEO → Inventario del blog
/calendario       → Calendario.jsx       (PrivateRoute) — requiere feature flag `calendario`. Disponibilidad del equipo: vistas Mi semana/Equipo/Mes en la URL (`?view=&date=&people=`), conexión personal con Google Calendar (push)
/baja/:token      → MailingUnsubscribe.jsx (pública) — baja de un mail de Mailing (link del pie; pide confirmar con un botón)
/report/:token    → ReportOrClientPortal.jsx  (pública, sin auth) — despacha por formato de `:token`: UUID → `ReportPublic.jsx` (informe mensual individual); slug corto → `ClientPortal.jsx` (portal de cliente: Informes, Briefs, Contenido, Datos en vivo)
/report-print/:printToken → ReportPrint.jsx (pública, sin UI de navegación) — portada + informe en formato A4; SOLO la abre el render de PDF del backend con un token de impresión de vida corta
/oauth            → OAuthPopup.jsx       (pública) — popup OAuth (Google/Meta/TikTok)
/auth             → AuthCallback.jsx     (pública) — callback de Google Sign-In
/oauth-result     → OAuthResult.jsx      (pública) — puente de callback OAuth: postMessage al opener y cierra popup
/billing          → Billing.jsx          (PrivateRoute) — visible para todos; acciones solo admin/owner
/reports             → Reports.jsx          (AdminRoute)
/admin               → Admin.jsx            (AdminRoute)  — ?tab= query param
/admin/rrhh          → RRHH.jsx             (RRHHRoute)   — secciones Hoy · Personas · Tiempo y asistencia (?view=quien-esta|solicitudes|saldos; fusiona las viejas Ausencias y Asistencia) · Desempeño (el Analizador de Personas de EOS; solo admin/owner con el flag `eos`) · Productividad; los ?tab= viejos se redirigen. Requiere feature flag `rrhh`; acceso configurable por rol (admin/owner siempre, ver "Acceso a módulos por rol") — a diferencia de EOS/Gamification.
/admin/eos           → EOS.jsx              (AdminRoute)  — 7 tabs: Visión, Personas, Datos, Asuntos, Procesos, Tracción, Evaluación. Requiere feature flag `eos`. Estrictamente isAdmin, sin acceso configurable por rol.
/chat                → Chat.jsx              (PrivateRoute) — chat interno en desktop (canales · conversación · contexto). `/chat/:slug` abre un canal, `?msg=<id>` lo deja parado en un mensaje. En mobile sigue siendo el panel flotante — ver `docs/claude/chat.md`
/juegos              → Juegos.jsx            (PrivateRoute) — juegos y desafíos para CUALQUIER miembro: el activo con su ranking completo y mi posición, votar, el quiz a pantalla completa, y el historial de terminados con sus ganadores. Requiere feature flag `gamification`.
/admin/gamification  → Gamification.jsx     (AdminRoute)  — CRUD de juegos/desafíos (admin). Requiere feature flag `gamification`. Estrictamente isAdmin, sin acceso configurable por rol.
/ventas              → Ventas.jsx           (SalesRoute — admin o user.isSales)  — CRM. Feature flag `ventas`. Tabs Dashboard/Empresas; vista del Lead vía ?lead=id
/admin/ventas        → Ventas.jsx           (AdminRoute)  — mismo componente, entrada de Ventas para admins (link en "Módulos")
/superadmin          → SuperAdmin.jsx        (SuperAdminRoute — requiere isSuperAdmin)
```
