// Píldora roja con un contador. Nació en la barra lateral (Navbar.jsx) y se movió acá
// cuando la pestaña WhatsApp de Ventas fue su segundo consumidor: el número que la
// barra muestra en "Ventas" y el que muestra la pestaña adentro son el mismo dato, y
// tienen que verse igual (mismo corte en 9+).
export default function Badge({ n }) {
  return (
    <span className="min-w-[18px] h-[18px] px-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
      {n > 9 ? '9+' : n}
    </span>
  )
}
