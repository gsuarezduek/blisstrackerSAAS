# Finanzas

> Parte de la documentación modular de BlissTracker. No se carga automáticamente en cada sesión de Claude Code — este archivo se lee bajo demanda cuando la tarea toca este módulo. Índice completo en `CLAUDE.md` (raíz).

**Finanzas (feature flag `finanzas`, stage `testing`):** administración interna de la agencia — ingresos, egresos, saldos por cuenta y moneda, cuenta corriente de clientes, facturación electrónica AFIP/ARCA y un tablero de Pendientes. Página `frontend/src/pages/Finanzas.jsx` (ruta `/finanzas`, pestañas `?tab=ingresos|egresos|saldos|resumen|clientes|pendientes`), componentes en `frontend/src/components/finanzas/`. Backend: `backend/src/controllers/finanzas/*`, router `routes/finanzas.routes.js` montado en `/api/finanzas` (auth + resolveWorkspace + `requireFeatureFlag('finanzas')` + `moduleAccessGuard('finanzas')` a nivel router). Acceden admin/owner + el rol configurado en Preferencias → Módulos → Finanzas (ver "Acceso a módulos por rol" en `billing-admin.md`). La **Configuración** (cuentas, categorías, impuestos, emisores) se lee abierta pero se escribe solo admin/owner; los items se pueden crear/editar desde la operación diaria (borrar es admin-only).

## Convenciones generales

- **Dinero siempre con `Prisma.Decimal`** (`lib/financeMoney.js`), nunca `Number`: columnas `Decimal(20, 8)` (hasta 8 decimales para BTC). `roundForCurrency` redondea a 2 decimales (8 en BTC) solo donde se **calcula** algo (impuestos, cuotas de extras); lo que el usuario carga se guarda tal cual.
- **Mostrar montos:** `fmtMoney(amount, currency)` de `frontend/src/utils/format.js` — ARS/USD **siempre con 2 decimales** ("$ 1.500,00", nunca redondea a entero), BTC hasta 8 recortando ceros. Mismo criterio en el log de auditoría (`fmtAuditMoney`) y los mails de facturas.
- **Catálogos tipo enum** (tipos de cuenta, estados, orígenes de tareas, etc.) en `backend/src/lib/financeCatalog.js`, espejo en `frontend/src/components/finanzas/financeCatalog.js` (mantener en sync). Cuentas/Categorías/Items/Impuestos son filas editables, no catálogos de código.
- **Soft-delete** (`deletedAt`/`deletedById`) en todo lo transaccional (movimientos, cheques, transferencias, valuaciones, ajustes, facturas, extras, tareas); los catálogos de configuración se **desactivan** (`active`), no se borran si tienen uso.
- **Auditoría genérica** `FinanceAuditLog` vía `logFinanceAudit` (`lib/financeAudit.js`, best-effort, nunca lanza): `entityType` del catálogo `AUDIT_ENTITY_TYPES`, diff campo a campo en `update` + una línea legible (`summary`). El panel "Historial" (`AuditTimeline.jsx`) pega a `GET /finanzas/audit?entityType=&entityId=`.

## Cuentas, saldos y ajustes

- `FinanceAccount` (`bank`/`wallet`/`cash`/`crypto_wallet`, moneda abierta ARS/USD/BTC, `initialBalance`, `hasInvestments`). No se borra si tiene uso (movimientos, transferencias, valuaciones, cheques acreditados o ajustes) — se desactiva.
- **Disponible** (`balances.controller.js`) = saldo inicial + ingresos − egresos ± transferencias de/hacia disponible **± ajustes de saldo**, sin contar ingresos con cheque todavía `pending`. Es el saldo ACTUAL (todo el histórico); ingresos/egresos/internos/ajustes de la tarjeta son del período filtrado.
- **Fondos:** valor de la última `FinanceFundValuation` (snapshot absoluto; `periodResult` = valor − anterior − aportes + rescates), o aportes − rescates si todavía no hay valuación.
- **Ajuste de saldo** (`FinanceBalanceAdjustment`, `adjustments.controller.js`): botón "Ajustar saldo" en el detalle de la cuenta (`AccountDetailPanel.jsx` → `AdjustBalanceModal.jsx`). El usuario carga **el monto del ajuste** (Sumar/Restar → se guarda con signo), no el saldo real; motivo obligatorio. Mueve el Disponible pero **no es ingreso ni egreso**: no aparece en Ingresos/Egresos ni en Resumen. Se lista en el detalle de la cuenta (con borrar = soft-delete) y la tarjeta muestra "Ajustes" del período si ≠ 0. Auditoría `entityType: 'adjustment'`.

## Movimientos, impuestos y cheques

- `FinanceMovement` (`income`/`expense`) siempre con item + categoría (del mismo tipo) + cuenta. Carga desde el modal global "+ Cargar" (`LoadMovementModal.jsx`, también "Entre cuentas" = `FinanceTransfer`, que no es ingreso/egreso).
- **Impuestos:** cada cuenta ofrece un set de `FinanceTax` (`FinanceAccountTax`); los tildados generan líneas `FinanceMovementTax` (snapshot de nombre/%) y un **egreso hijo** por impuesto (`sourceMovementId`, categoría "Impuestos bancarios") que no se edita directo — se recalcula al editar el padre. Un impuesto puede calcularse sobre otro (`baseTaxId`, sin ciclos, tope de niveles).
- **Ingreso de un cliente** (`item.tracksAccount`): `accountApplication` = `invoice` (se aplica a una factura puntual, no puede superar su pendiente) | `on_account` (a cuenta; opcionalmente vinculado a una cuota de un Extra con `extraPaymentId`) | `no_effect`.
- **Cheques** (`FinanceCheck`, `paymentMethod: 'check'`): número + fecha estimada de cobro. El ingreso no suma al disponible ni genera impuestos hasta **acreditarlo** (`PATCH /checks/:id/credit`: fecha real + cuenta + impuestos, actualiza el movimiento); **rechazarlo** soft-deletea el movimiento (restaura el saldo del cliente). **Factura asociada:** con un cliente se elige dentro del bloque del cheque (facturas pendientes / "Sin factura — a cuenta" / "No afecta la cuenta") y se guarda como el `invoiceId` del movimiento; con un item sin cuenta corriente es texto libre `FinanceCheck.invoiceNumber` (editable desde Editar movimiento, `checkInvoiceNumber`). `checkInvoiceLabel()` (catálogo del frontend) resuelve qué mostrar en la lista de cheques, al acreditar y al editar. `issuingBank` (banco emisor) ya no se pide: queda nullable/legacy.
- Borrar un movimiento que era el cobro de una cuota de un Extra **desvincula la cuota** (vuelve a pendiente y el extra "cobrado" vuelve a "terminado"); restaurarlo no la re-vincula.

## Clientes (cuenta corriente) y facturación

- Un **cliente** es un `FinanceItem` con `tracksAccount: true` (alta desde Clientes → "+ Nuevo cliente", `NewCustomerModal.jsx`). Datos: **razón social** (`legalName`), contacto, teléfono, mail, CUIT, dirección, servicio contratado, condición de IVA, emisor habitual, proyecto vinculado, notas (autoguardado).
- **Razón social:** "Buscar" el CUIT en el padrón de ARCA (`GET /padron/:cuit`) la completa sola (además de dirección y condición de IVA). Es lo que se imprime como **receptor** en el PDF oficial de la factura (`arcaVoucherDocument.js`, fallback a `name`); `name` sigue siendo el nombre interno con el que se lo ve en la app. La búsqueda de Clientes matchea nombre o razón social.
- **Lista de Clientes:** orden **A-Z por defecto** (`GET /customers?sort=name`), o "por saldo" (`sort=balance`: vencidos primero, después por saldo); la elección se recuerda en `localStorage` (`bliss_finanzas_customers_sort`). Facturado/cobrado/saldo/estado se calculan siempre (nunca se persisten): las notas de crédito restan, las rechazadas por ARCA no pesan.
- **Facturas** (`FinanceInvoice`): informativas (número a mano) o electrónicas vía ARCA con un `FinanceIssuer` (certificado/clave cifrados, homologación/producción), PDF oficial con CAE + QR, notas de crédito/débito (`kind`), "Reconciliar" para emisiones `indeterminate`/`conflict`, adjuntos en R2, envío por mail y ZIP. `Workspace.financeIvaMode` define si el monto tipeado es neto o ya incluye IVA.

## Extras

`FinanceExtra` = trabajo adicional cobrado a un cliente, repartido en empresa / proveedores / equipo (equipo = total − empresa − proveedores, nunca a mano), cobrado en 1-4 cuotas (`FinanceExtraPayment`, iguales por defecto; editar montos reparte la diferencia entre las cuotas sin cobrar). Estados `in_progress` → `finished` → `collected`. UI en Pendientes (`ExtrasList.jsx` + `ExtraModal.jsx`).
- **Cliente:** solo clientes (`tracksAccount`); el modal permite dar de alta uno nuevo ahí mismo ("+ Nuevo", reusa `NewCustomerModal`).
- **"Terminado" no mueve plata**: marca el trabajo como entregado y dispara la tarea "Cobrar N° pago a X". La plata entra con **"Registrar cobro"** en cada cuota pendiente (dentro del extra o desde la tarea de Pendientes): abre `LoadMovementModal` con `prefill { item, amount, extraPaymentId }` — se elige banco y fecha, queda aplicado "A cuenta" y vinculado a la cuota. Con la última cuota cobrada el extra pasa solo a `collected`.
- **"Pagar al equipo"** (`TeamPayoutModal.jsx` → `POST /extras/:id/team-payouts`): a quién del equipo (miembros activos del workspace) se le deposita cuánto, desde qué cuenta, con qué categoría de egreso y fecha. Cada persona genera un **egreso real** (item = el cliente del extra, nota "Pago al equipo — Nombre: acción") + una fila `FinanceExtraTeamPayout` (`extraId`, `userId`, `movementId` único). Lo pagado se lee siempre de los egresos vivos (`lib/financeExtras.js` `teamPaidAmount`), así editar/borrar/restaurar el egreso desde Egresos se refleja solo; no se puede pagar más de la parte del equipo. `FinanceExtra.teamPaid` se recalcula (`recomputeTeamPaid`) al pagar, deshacer (`DELETE .../team-payouts/:payoutId`, soft-delete del egreso) o tocar el egreso; un extra sin pagos registrados conserva el tilde manual legacy ("Ya se le pagó por fuera").

## Pendientes (tareas)

`FinanceTask` manuales o **generadas por reglas** (motor on-demand en `tasks.controller.js` `syncGeneratedTasks`, se recalcula en cada `GET /tasks`, sin cron): (1) cheques por vencer (≤ hoy + 2 días), (2) cheques rechazados, (3) facturas vencidas agrupadas por cliente, (4) extra terminado con cuotas pendientes ("Cobrar N° pago a X"), (5) extra cobrado con equipo sin pagar ("Pagar al equipo: …", monto = lo que falta), (6) próximas acciones vencidas, (7) facturas ARCA sin confirmar. Completar/posponer a mano es definitivo mientras la condición siga viva; cuando deja de cumplirse, la tarea se cierra sola. Las tareas de un extra muestran "Registrar cobro"/"Pagar" en vez de "Hecho". Cada tarea se puede asignar a un responsable (equipo con acceso al módulo, `GET /team`) y llega a su dashboard como `Task` en el proyecto `Workspace.financeTaskProjectId` (`lib/financeTaskDashboard.js`, mismo patrón que los to-dos de Reuniones). La pestaña suma una nota libre del workspace y un resumen semanal con IA.

## Rutas (`/api/finanzas`)

| Recurso | Rutas |
|---|---|
| Cuentas | `GET/POST /accounts`, `GET/PATCH/DELETE /accounts/:id`, `PUT /accounts/:id/taxes` (escrituras admin) |
| Emisores / Categorías / Impuestos | `/issuers`, `/categories`, `/taxes` (CRUD, escrituras admin) |
| Items | `GET/POST /items`, `GET/PATCH /items/:id`, `DELETE /items/:id` (admin) · `GET /padron/:cuit` |
| Movimientos | `GET/POST /movements`, `GET/PATCH/DELETE /movements/:id`, `POST /movements/:id/restore` |
| Transferencias | `GET/POST /transfers` |
| Saldos | `GET /balances?from=&to=` · `GET /checks?status=`, `PATCH /checks/:id/credit`, `PATCH /checks/:id/reject` · `GET/POST /fund-valuations` · `GET/POST /adjustments`, `DELETE /adjustments/:id` |
| Resumen | `GET /summary/breakdown`, `GET /summary/chart` |
| Clientes | `GET /customers?search=&onlyWithBalance=&sort=name\|balance`, `GET /customers/:id`, `GET /customers/:id/ledger` |
| Facturas | `GET/POST /invoices`, `PATCH/DELETE /invoices/:id`, `POST .../restore`, `GET .../pdf`, `POST .../credit-note`, `.../debit-note`, `.../reconcile`, adjuntos (`presign`/`confirm`/`download`/`DELETE`), `POST /invoices/download-zip`, `POST /invoices/send-email` |
| Próximas acciones | `GET/POST /next-actions`, `PATCH/DELETE /next-actions/:id` |
| Extras | `GET/POST /extras`, `PATCH/DELETE /extras/:id`, `POST /extras/:id/team-payouts`, `DELETE /extras/:id/team-payouts/:payoutId` |
| Pendientes | `GET/POST /tasks`, `PATCH/DELETE /tasks/:id`, `GET /team` · `GET/PATCH /workspace-note` · `GET /ai-summary`, `POST /ai-summary/refresh` |
| Historial | `GET /audit?entityType=&entityId=` |

## Scripts

`backend/scripts/reset-finanzas-data.js <slug> [--confirm]` borra todos los datos operativos de Finanzas de un workspace (movimientos, cheques, transferencias, valuaciones, ajustes, facturas, extras y sus pagos, tareas, etc.) conservando la Configuración. Sin `--confirm` es simulación.
