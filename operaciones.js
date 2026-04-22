/* ================================================================
   OPERACIONES MATEMÁTICAS · Finanzas Pro
   ----------------------------------------------------------------
   Contiene SOLO las funciones matemáticas puras, sin DOM ni UI.
     1. Transformación de tasas
     2. Interés simple   (VF, VP, i, n, VF_total, VP_total)
     3. Interés compuesto (VF, VP, i, n, VF_total, VP_total)
     4. Interés continuo  (VF, VP, i, n, VF_total, VP_total)
     5. Anualidades vencidas (VF, VP, cuota desde VP, cuota desde VF)
================================================================ */


/* ============================================================== */
/* 1. TRANSFORMACIÓN DE TASAS                                      */
/* ----------------------------------------------------------------
   Toda conversión usa la Efectiva Anual Vencida (EA) como puente.
   Cada tasa se describe con:
     valor      → número en % (ej. 24 para 24 %)
     tipo       → "nominal" | "efectiva"
     modalidad  → "vencida" | "anticipada"
     periodo    → "diario" | "semanal" | "quincenal" | "mensual" |
                  "bimestral" | "trimestral" | "cuatrimestral" |
                  "semestral" | "anual" | "personalizado"
     mesesPersonal → número de meses (solo si periodo = "personalizado")
================================================================ */

const PERIODOS_POR_ANIO = {
  diario:         365,
  semanal:         52,
  quincenal:       24,
  mensual:         12,
  bimestral:        6,
  trimestral:       4,
  cuatrimestral:    3,
  semestral:        2,
  anual:            1
};

/**
 * Devuelve cuántos periodos del tipo dado caben en un año.
 * Si periodo = "personalizado", usa mesesPersonal para calcularlo.
 */
function periodosPorAnio(periodo, mesesPersonal) {
  if (periodo === "personalizado") {
    const m = Number(mesesPersonal);
    if (!isFinite(m) || m <= 0) throw new Error("Periodo personalizado inválido.");
    return 12 / m;
  }
  const m = PERIODOS_POR_ANIO[periodo];
  if (!m) throw new Error(`Periodo desconocido: ${periodo}`);
  return m;
}

/**
 * PASO 1–3: Cualquier tasa → Efectiva Anual Vencida (EA) en decimal.
 *
 * Algoritmo:
 *   1. Si nominal  → i_per = valor% / m
 *      Si efectiva → i_per = valor%           (ya es periódica)
 *   2. Si anticipada → i_per_v = i_per / (1 - i_per)
 *   3. EA = (1 + i_per_v)^m - 1
 */
function tasaAEfectivaAnual(tasa) {
  const valor = tasa.valor / 100;
  const m = periodosPorAnio(tasa.periodo, tasa.mesesPersonal);

  let iPer = tasa.tipo === "nominal" ? valor / m : valor;

  if (tasa.modalidad === "anticipada") {
    if (iPer >= 1) throw new Error("Tasa anticipada >= 100%: no convertible.");
    iPer = iPer / (1 - iPer);                  // anticipada → vencida
  }

  return Math.pow(1 + iPer, m) - 1;            // → EA decimal
}

/**
 * PASO 4–6: EA (decimal) → tasa de salida deseada (devuelve en %).
 *
 * Algoritmo:
 *   4. i_per_v = (1 + EA)^(1/m_sal) - 1
 *   5. Si salida anticipada → i_per = i_per_v / (1 + i_per_v)
 *   6. Si salida nominal    → resultado = i_per * m_sal
 *      Si salida efectiva   → resultado = i_per
 */
function efectivaAnualATasa(ea, tasaSalida) {
  const m = periodosPorAnio(tasaSalida.periodo, tasaSalida.mesesPersonal);

  let iPerV = Math.pow(1 + ea, 1 / m) - 1;    // vencida del periodo de salida

  let iPer = iPerV;
  if (tasaSalida.modalidad === "anticipada") {
    iPer = iPerV / (1 + iPerV);                // vencida → anticipada
  }

  const valorDec = tasaSalida.tipo === "nominal" ? iPer * m : iPer;
  return valorDec * 100;                        // → %
}

/**
 * Conversión directa entre dos tasas cualesquiera.
 * Devuelve { ea, valor } donde ea = EA decimal y valor = tasa resultado en %.
 *
 * Ejemplo:
 *   convertirTasa(
 *     { valor: 24, tipo: "nominal", modalidad: "vencida",  periodo: "mensual"   },
 *     { tipo: "efectiva", modalidad: "vencida", periodo: "trimestral" }
 *   )
 */
function convertirTasa(entrada, salida) {
  const ea = tasaAEfectivaAnual(entrada);
  const valor = efectivaAnualATasa(ea, salida);
  return { ea, valor };
}

/**
 * Tasa efectiva equivalente al periodo de operación (compuesta).
 * Usada internamente por los simuladores de interés compuesto y continuo.
 *   i_eq = (1 + EA)^(1/m_op) - 1
 */
function tasaEfectivaAlPeriodo(tasa, periodoOperacion, mesesOpPersonal) {
  const ea  = tasaAEfectivaAnual(tasa);
  const mOp = periodosPorAnio(periodoOperacion, mesesOpPersonal);
  return Math.pow(1 + ea, 1 / mOp) - 1;        // decimal
}

/**
 * Tasa proporcional al periodo de operación (para interés simple).
 * La conversión es lineal, no exponencial.
 *   i_prop = i_anual_lineal / m_op
 */
function tasaProporcionalAlPeriodo(tasa, periodoOperacion, mesesOpPersonal) {
  const valor = tasa.valor / 100;
  const mCap = periodosPorAnio(tasa.periodo, tasa.mesesPersonal);
  const mOp  = periodosPorAnio(periodoOperacion, mesesOpPersonal);

  let iPer = tasa.tipo === "nominal" ? valor / mCap : valor;
  if (tasa.modalidad === "anticipada") {
    if (iPer >= 1) throw new Error("Tasa anticipada >= 100%: no válida.");
    iPer = iPer / (1 - iPer);
  }

  const anualLineal = iPer * mCap;             // tasa anual "proporcional"
  return anualLineal / mOp;                    // decimal
}


/* ============================================================== */
/* 2. INTERÉS SIMPLE                                               */
/* ============================================================== */

/**
 * VF = VP × (1 + i × n)
 * @param {number} vp  - Valor presente
 * @param {number} i   - Tasa proporcional por periodo (decimal)
 * @param {number} n   - Número de periodos
 */
function simpleVF(vp, i, n) {
  return vp * (1 + i * n);
}

/**
 * VP = VF / (1 + i × n)
 * @param {number} vf  - Valor futuro
 * @param {number} i   - Tasa proporcional por periodo (decimal)
 * @param {number} n   - Número de periodos
 */
function simpleVP(vf, i, n) {
  const denom = 1 + i * n;
  if (denom === 0) throw new Error("División por cero al calcular VP simple.");
  return vf / denom;
}

/**
 * i = ((VF / VP) - 1) / n   →  resultado en decimal por periodo
 * @param {number} vp  - Valor presente (> 0)
 * @param {number} vf  - Valor futuro   (> 0)
 * @param {number} n   - Número de periodos (> 0)
 */
function simpleTasa(vp, vf, n) {
  if (vp <= 0 || n <= 0) throw new Error("VP y n deben ser > 0.");
  return ((vf / vp) - 1) / n;                  // decimal
}

/**
 * n = ((VF / VP) - 1) / i
 * @param {number} vp  - Valor presente (> 0)
 * @param {number} vf  - Valor futuro   (> 0)
 * @param {number} i   - Tasa proporcional por periodo (decimal, ≠ 0)
 */
function simpleN(vp, vf, i) {
  if (i === 0) throw new Error("La tasa no puede ser 0 para calcular n.");
  return ((vf / vp) - 1) / i;
}

/**
 * VF total con múltiples desembolsos/aportes (interés simple).
 * VF = Σ [ Cₖ × (1 + i × (n - tₖ)) ]
 *
 * @param {number} n              - Periodo focal (tiempo total)
 * @param {number} i              - Tasa proporcional por periodo (decimal)
 * @param {Array}  movimientos    - [{ monto, periodo }]  tₖ ≤ n
 */
function simpleVFTotal(n, i, movimientos) {
  return movimientos.reduce((suma, m) => {
    return suma + m.monto * (1 + i * (n - m.periodo));
  }, 0);
}

/**
 * VP total con múltiples desembolsos/aportes (interés simple).
 * VP = Σ [ Cₖ / (1 + i × tₖ) ]
 *
 * @param {number} i              - Tasa proporcional por periodo (decimal)
 * @param {Array}  movimientos    - [{ monto, periodo }]
 */
function simpleVPTotal(i, movimientos) {
  return movimientos.reduce((suma, m) => {
    return suma + m.monto / (1 + i * m.periodo);
  }, 0);
}


/* ============================================================== */
/* 3. INTERÉS COMPUESTO                                            */
/* ============================================================== */

/**
 * VF = VP × (1 + i)^n
 * @param {number} vp  - Valor presente
 * @param {number} i   - Tasa efectiva equivalente al periodo (decimal)
 * @param {number} n   - Número de periodos
 */
function compuestoVF(vp, i, n) {
  return vp * Math.pow(1 + i, n);
}

/**
 * VP = VF / (1 + i)^n
 * @param {number} vf  - Valor futuro
 * @param {number} i   - Tasa efectiva equivalente al periodo (decimal)
 * @param {number} n   - Número de periodos
 */
function compuestoVP(vf, i, n) {
  return vf / Math.pow(1 + i, n);
}

/**
 * i = (VF / VP)^(1/n) - 1   →  resultado en decimal por periodo
 * @param {number} vp  - Valor presente (> 0)
 * @param {number} vf  - Valor futuro   (> 0)
 * @param {number} n   - Número de periodos (> 0)
 */
function compuestoTasa(vp, vf, n) {
  if (vp <= 0 || vf <= 0 || n <= 0) throw new Error("VP, VF y n deben ser > 0.");
  return Math.pow(vf / vp, 1 / n) - 1;         // decimal
}

/**
 * n = ln(VF / VP) / ln(1 + i)
 * @param {number} vp  - Valor presente (> 0)
 * @param {number} vf  - Valor futuro   (> 0)
 * @param {number} i   - Tasa efectiva por periodo (decimal, > -1 y ≠ 0)
 */
function compuestoN(vp, vf, i) {
  if (vp <= 0 || vf <= 0 || 1 + i <= 0) throw new Error("Valores inválidos para calcular n.");
  return Math.log(vf / vp) / Math.log(1 + i);
}

/**
 * VF total con múltiples desembolsos/aportes (interés compuesto).
 * VF = Σ [ Cₖ × (1 + i)^(n - tₖ) ]
 *
 * @param {number} n              - Periodo focal
 * @param {number} i              - Tasa efectiva por periodo (decimal)
 * @param {Array}  movimientos    - [{ monto, periodo }]
 */
function compuestoVFTotal(n, i, movimientos) {
  return movimientos.reduce((suma, m) => {
    return suma + m.monto * Math.pow(1 + i, n - m.periodo);
  }, 0);
}

/**
 * VP total con múltiples desembolsos/aportes (interés compuesto).
 * VP = Σ [ Cₖ / (1 + i)^tₖ ]
 *
 * @param {number} i              - Tasa efectiva por periodo (decimal)
 * @param {Array}  movimientos    - [{ monto, periodo }]
 */
function compuestoVPTotal(i, movimientos) {
  return movimientos.reduce((suma, m) => {
    return suma + m.monto / Math.pow(1 + i, m.periodo);
  }, 0);
}


/* ============================================================== */
/* 4. INTERÉS CONTINUO                                             */
/* ============================================================== */

/**
 * VF = VP × e^(r × n)
 * @param {number} vp  - Valor presente
 * @param {number} r   - Tasa continua por periodo: r = ln(1 + i_comp)
 * @param {number} n   - Número de periodos
 */
function continuoVF(vp, r, n) {
  return vp * Math.exp(r * n);
}

/**
 * VP = VF × e^(-r × n)
 * @param {number} vf  - Valor futuro
 * @param {number} r   - Tasa continua por periodo (decimal)
 * @param {number} n   - Número de periodos
 */
function continuoVP(vf, r, n) {
  return vf * Math.exp(-r * n);
}

/**
 * r = ln(VF / VP) / n   →  resultado en decimal por periodo
 * @param {number} vp  - Valor presente (> 0)
 * @param {number} vf  - Valor futuro   (> 0)
 * @param {number} n   - Número de periodos (> 0)
 */
function continuoTasa(vp, vf, n) {
  if (vp <= 0 || vf <= 0 || n <= 0) throw new Error("VP, VF y n deben ser > 0.");
  return Math.log(vf / vp) / n;                // decimal
}

/**
 * n = ln(VF / VP) / r
 * @param {number} vp  - Valor presente (> 0)
 * @param {number} vf  - Valor futuro   (> 0)
 * @param {number} r   - Tasa continua por periodo (decimal, ≠ 0)
 */
function continuoN(vp, vf, r) {
  if (vp <= 0 || vf <= 0 || r === 0) throw new Error("Valores inválidos para calcular n.");
  return Math.log(vf / vp) / r;
}

/**
 * VF total con múltiples desembolsos/aportes (interés continuo).
 * VF = Σ [ Cₖ × e^(r × (n - tₖ)) ]
 *
 * @param {number} n              - Periodo focal
 * @param {number} r              - Tasa continua por periodo (decimal)
 * @param {Array}  movimientos    - [{ monto, periodo }]
 */
function continuoVFTotal(n, r, movimientos) {
  return movimientos.reduce((suma, m) => {
    return suma + m.monto * Math.exp(r * (n - m.periodo));
  }, 0);
}

/**
 * VP total con múltiples desembolsos/aportes (interés continuo).
 * VP = Σ [ Cₖ × e^(-r × tₖ) ]
 *
 * @param {number} r              - Tasa continua por periodo (decimal)
 * @param {Array}  movimientos    - [{ monto, periodo }]
 */
function continuoVPTotal(r, movimientos) {
  return movimientos.reduce((suma, m) => {
    return suma + m.monto * Math.exp(-r * m.periodo);
  }, 0);
}

/**
 * Convierte tasa efectiva compuesta al periodo → tasa continua equivalente.
 * r = ln(1 + i_comp)
 * Relación inversa: i_comp = e^r - 1
 */
function compuestaAContinua(iComp) {
  return Math.log(1 + iComp);
}


/* ============================================================== */
/* 5. ANUALIDADES VENCIDAS                                         */
/* ----------------------------------------------------------------
   La tasa i debe ser la tasa efectiva equivalente al PERIODO DE
   PAGO, obtenida mediante tasaEfectivaAlPeriodo().
   Los pagos extraordinarios son [{ monto, periodo, tipo }]
     tipo: "aporte" → suma al total
     tipo: "abono"  → reduce el saldo
================================================================ */

/**
 * Factor VF de la anualidad vencida ordinaria.
 * s̄ = [(1 + i)^n - 1] / i        (si i = 0 → n)
 */
function factorVFAnualidad(i, n) {
  if (i === 0) return n;
  return (Math.pow(1 + i, n) - 1) / i;
}

/**
 * Factor VP de la anualidad vencida ordinaria.
 * ā = [(1 + i)^n - 1] / [i × (1 + i)^n]    (si i = 0 → n)
 */
function factorVPAnualidad(i, n) {
  if (i === 0) return n;
  return (Math.pow(1 + i, n) - 1) / (i * Math.pow(1 + i, n));
}

/**
 * VF de la anualidad.
 * VF = A × s̄   (+  extras capitalizados si los hay)
 *
 * @param {number} A              - Cuota periódica vencida
 * @param {number} i              - Tasa efectiva al periodo de pago (decimal)
 * @param {number} n              - Número de periodos
 * @param {Array}  extras         - [{ monto, periodo, tipo }]  (opcional)
 */
function anualidadVF(A, i, n, extras = []) {
  const sn = factorVFAnualidad(i, n);
  const extrasVF = extras.reduce((s, e) => {
    const signo = e.tipo === "abono" ? -1 : 1;
    return s + signo * e.monto * Math.pow(1 + i, n - e.periodo);
  }, 0);
  return A * sn + extrasVF;
}

/**
 * VP de la anualidad.
 * VP = A × ā   (+  extras descontados si los hay)
 *
 * @param {number} A              - Cuota periódica vencida
 * @param {number} i              - Tasa efectiva al periodo de pago (decimal)
 * @param {number} n              - Número de periodos
 * @param {Array}  extras         - [{ monto, periodo, tipo }]  (opcional)
 */
function anualidadVP(A, i, n, extras = []) {
  const an = factorVPAnualidad(i, n);
  const extrasVP = extras.reduce((s, e) => {
    const signo = e.tipo === "abono" ? -1 : 1;
    return s + signo * e.monto / Math.pow(1 + i, e.periodo);
  }, 0);
  return A * an + extrasVP;
}

/**
 * Cuota A desde un Valor Presente (VP).
 * A = VP / ā    →    A = VP × i × (1+i)^n / [(1+i)^n - 1]
 *
 * @param {number} VP             - Valor presente del crédito o préstamo
 * @param {number} i              - Tasa efectiva al periodo de pago (decimal)
 * @param {number} n              - Número de periodos
 * @param {Array}  extras         - [{ monto, periodo, tipo }]  (opcional)
 */
function anualidadCuotaDesdeVP(VP, i, n, extras = []) {
  const an = factorVPAnualidad(i, n);
  if (an === 0) throw new Error("El factor VP de la anualidad es 0: revisa i y n.");
  const extrasVP = extras.reduce((s, e) => {
    const signo = e.tipo === "abono" ? -1 : 1;
    return s + signo * e.monto / Math.pow(1 + i, e.periodo);
  }, 0);
  return (VP - extrasVP) / an;
}

/**
 * Cuota A desde un Valor Futuro (VF).
 * A = VF / s̄    →    A = VF × i / [(1+i)^n - 1]
 *
 * @param {number} VF             - Meta de ahorro o valor futuro deseado
 * @param {number} i              - Tasa efectiva al periodo de pago (decimal)
 * @param {number} n              - Número de periodos
 * @param {Array}  extras         - [{ monto, periodo, tipo }]  (opcional)
 */
function anualidadCuotaDesdeVF(VF, i, n, extras = []) {
  const sn = factorVFAnualidad(i, n);
  if (sn === 0) throw new Error("El factor VF de la anualidad es 0: revisa i y n.");
  const extrasVF = extras.reduce((s, e) => {
    const signo = e.tipo === "abono" ? -1 : 1;
    return s + signo * e.monto * Math.pow(1 + i, n - e.periodo);
  }, 0);
  return (VF - extrasVF) / sn;
}
