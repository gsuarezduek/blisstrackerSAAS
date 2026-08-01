// Pantalla mostrada cuando el workspace está suspendido/cancelado (backend devuelve
// 402 WORKSPACE_SUSPENDED en /auth/me para cualquier miembro, no sólo admins). No es
// una sesión inválida — evitamos el deslogueo silencioso y explicamos qué pasó.
export default function WorkspaceSuspendedScreen() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <p className="text-5xl mb-4">⏸️</p>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Este workspace está suspendido</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          El acceso está pausado, probablemente por un problema con la suscripción. Pedile al administrador o dueño del workspace que revise el estado de la facturación para reactivarlo.
        </p>
      </div>
    </div>
  )
}
