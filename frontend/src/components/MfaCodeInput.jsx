// Input del segundo factor. Acepta tanto el TOTP de 6 dígitos como un código de
// recuperación (letras + guion), así que NO fuerza `inputMode: numeric` ni filtra
// a dígitos: el backend distingue cuál es.
//
// `autoComplete="one-time-code"` es lo que hace que iOS/Android ofrezcan pegar el
// código desde el teclado, y el `name` ayuda a los gestores de contraseñas que ya
// guardan el TOTP de la cuenta.
export default function MfaCodeInput({ value, onChange, autoFocus = false, className = '', ...rest }) {
  return (
    <input
      type="text"
      name="one-time-code"
      autoComplete="one-time-code"
      autoCorrect="off"
      autoCapitalize="characters"
      spellCheck={false}
      maxLength={12}
      autoFocus={autoFocus}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="123456"
      className={`w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-2.5 text-center text-lg tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${className}`}
      {...rest}
    />
  )
}
