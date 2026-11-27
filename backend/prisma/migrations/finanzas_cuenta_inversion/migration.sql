-- Finanzas: en qué total de Saldos cae la plata de una cuenta. 'available'
-- (disponible, el comportamiento de siempre) | 'investment' (largo plazo,
-- total aparte "Inversión en <moneda>"). Toda cuenta existente queda como
-- disponible: nada cambia hasta que alguien marque una como inversión.
ALTER TABLE "FinanceAccount" ADD COLUMN "balanceGroup" TEXT NOT NULL DEFAULT 'available';
