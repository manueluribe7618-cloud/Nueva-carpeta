/* ================================================================
   FINANZAS PRO · lógica unificada (Segundo Corte)
   ----------------------------------------------------------------
   Contiene:
     1. Utilidades de formato (moneda COP y decimales)
     2. Motor universal de conversión de tasas
     3. Simulador de intereses (simple / compuesto / continuo)
        con conversión automática de la tasa al periodo de la operación
     4. Conversor universal visual (UI)
     5. Simulador de anualidades vencidas con pagos extraordinarios
     6. Navegación por pestañas del simulador
   ================================================================ */


/* ============================================================== */
/* 1. FORMATEO DE NÚMEROS                                          */
/* ============================================================== */

function parseColombianNumber(value) {
  if (value == null) return NaN;
  const normalized = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/%/g, "")
    .replace(/\$/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return normalized === "" ? NaN : Number(normalized);
}

function formatColombianNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

function formatMoney(value) {
  return "$ " + formatColombianNumber(value, 2);
}

function formatPercent(value, decimals = 4) {
  return formatColombianNumber(value, decimals) + " %";
}

function cleanEditableMoney(value) {
  return String(value || "")
    .replace(/[^\d,]/g, "")
    .replace(/(,.*),/g, "$1");
}

function attachMoneyFormatter(input) {
  if (!input || input.dataset.formatBound === "true") return;
  input.dataset.formatBound = "true";

  input.addEventListener("focus", () => {
    const n = parseColombianNumber(input.value);
    if (Number.isFinite(n)) input.value = String(n).replace(".", ",");
  });

  input.addEventListener("input", () => {
    input.value = cleanEditableMoney(input.value);
  });

  input.addEventListener("blur", () => {
    const n = parseColombianNumber(input.value);
    input.value = Number.isFinite(n) ? formatColombianNumber(n, 2) : "";
  });
}

function attachDecimalFormatter(input) {
  if (!input || input.dataset.decimalBound === "true") return;
  input.dataset.decimalBound = "true";
  input.addEventListener("input", () => {
    input.value = String(input.value)
      .replace(/[^\d,\-]/g, "")
      .replace(/(,.*),/g, "$1");
  });
}


/* ============================================================== */
/* 2. MOTOR UNIVERSAL DE CONVERSIÓN DE TASAS                       */
/* ----------------------------------------------------------------
   La tasa se describe con 4 atributos:
     - valor     (porcentaje, ej: 24 para 24%)
     - tipo      "nominal" | "efectiva"
     - modalidad "vencida" | "anticipada"
     - periodo   "mensual", "trimestral", etc, o número = meses
   Internamente todo pasa por Efectiva Anual Vencida (EA).
================================================================= */

const PERIODOS_POR_ANIO = {
  diario: 365,
  semanal: 52,
  quincenal: 24,
  mensual: 12,
  bimestral: 6,
  trimestral: 4,
  cuatrimestral: 3,
  quintumestral: 12 / 5,
  semestral: 2,
  decamestral: 12 / 10,
  anual: 1
};

const NOMBRE_PERIODO = {
  diario: "diaria",
  semanal: "semanal",
  quincenal: "quincenal",
  mensual: "mensual",
  bimestral: "bimestral",
  trimestral: "trimestral",
  cuatrimestral: "cuatrimestral",
  quintumestral: "quintumestral",
  semestral: "semestral",
  decamestral: "decamestral",
  anual: "anual"
};

function periodosPorAnioDesde(periodoKey, mesesPersonalizados) {
  if (periodoKey === "personalizado") {
    const m = Number(mesesPersonalizados);
    if (!Number.isFinite(m) || m <= 0) return NaN;
    return 12 / m;
  }
  return PERIODOS_POR_ANIO[periodoKey];
}

function nombrePeriodoHumano(periodoKey, mesesPersonalizados) {
  if (periodoKey === "personalizado") {
    return `cada ${mesesPersonalizados} mes(es)`;
  }
  return NOMBRE_PERIODO[periodoKey] || periodoKey;
}

/* Convierte una tasa de entrada a EA (efectiva anual vencida, decimal). */
function tasaEntradaAEfectivaAnual(tasa) {
  const valor = Number(tasa.valor) / 100;
  const m = periodosPorAnioDesde(tasa.periodo, tasa.mesesPersonal);
  if (!Number.isFinite(m) || m <= 0) {
    throw new Error("Periodo de capitalización inválido.");
  }

  // 1. Llegar a tasa periódica (vencida o anticipada según modalidad)
  let iPer = tasa.tipo === "nominal" ? valor / m : valor;

  // 2. Si la tasa periódica está en anticipada, pasarla a vencida
  if (tasa.modalidad === "anticipada") {
    if (iPer >= 1) throw new Error("Una tasa periódica anticipada ≥ 100% no es convertible.");
    iPer = iPer / (1 - iPer);
  }

  // 3. Subir a efectiva anual vencida
  return Math.pow(1 + iPer, m) - 1;
}

/* Convierte una EA a la tasa de salida deseada (devuelve %). */
function efectivaAnualATasaSalida(ea, tasaSalida) {
  const m = periodosPorAnioDesde(tasaSalida.periodo, tasaSalida.mesesPersonal);
  if (!Number.isFinite(m) || m <= 0) {
    throw new Error("Periodo de capitalización inválido.");
  }

  // 1. Bajar a tasa periódica vencida
  let iPerV = Math.pow(1 + ea, 1 / m) - 1;

  // 2. Ajustar modalidad
  let iPer = iPerV;
  if (tasaSalida.modalidad === "anticipada") {
    iPer = iPerV / (1 + iPerV);
  }

  // 3. Tipo
  const valorDec = tasaSalida.tipo === "nominal" ? iPer * m : iPer;
  return valorDec * 100;
}

/* Conversor end-to-end (expone el resultado en %) con pasos intermedios. */
function convertirTasaUniversal(entrada, salida) {
  const ea = tasaEntradaAEfectivaAnual(entrada);
  const valor = efectivaAnualATasaSalida(ea, salida);
  return { ea, valor };
}

/* Convierte una tasa (descriptor completo) a la tasa EFECTIVA VENCIDA
   del periodo de la operación (en %) — usado por los simuladores. */
function tasaACompuestaPeriodoOperacion(tasa, periodoOperacion, mesesOpPersonal) {
  const ea = tasaEntradaAEfectivaAnual(tasa);
  const mOp = periodosPorAnioDesde(periodoOperacion, mesesOpPersonal);
  if (!Number.isFinite(mOp) || mOp <= 0) {
    throw new Error("Periodo de operación inválido.");
  }
  return Math.pow(1 + ea, 1 / mOp) - 1; // decimal
}

/* Para interés simple: la conversión es proporcional.
   Llevamos cualquier tasa a "anual simple" y luego la proporcionamos
   al periodo de operación. */
function tasaASimpleProporcionalAlPeriodo(tasa, periodoOperacion, mesesOpPersonal) {
  const valor = Number(tasa.valor) / 100;
  const mCap = periodosPorAnioDesde(tasa.periodo, tasa.mesesPersonal);
  const mOp  = periodosPorAnioDesde(periodoOperacion, mesesOpPersonal);
  if (!Number.isFinite(mCap) || mCap <= 0 || !Number.isFinite(mOp) || mOp <= 0) {
    throw new Error("Periodo inválido.");
  }

  // Tasa periódica de capitalización (vencida o anticipada)
  let iPer = tasa.tipo === "nominal" ? valor / mCap : valor;

  // Si es anticipada, convertir a vencida (sólo para poder tratarla uniformemente)
  if (tasa.modalidad === "anticipada") {
    if (iPer >= 1) throw new Error("Tasa anticipada ≥ 100% no es válida.");
    iPer = iPer / (1 - iPer);
  }

  // Convertir a anual proporcional y luego al periodo de operación proporcional
  const anualSimple = iPer * mCap;            // tasa anual "lineal"
  return anualSimple / mOp;                    // tasa proporcional al periodo de operación
}


/* ============================================================== */
/* 3. UTILIDADES DE TIEMPO / UNIDADES                              */
/* ============================================================== */

const NOMBRE_UNIDAD_TIEMPO = {
  diario: "días",
  semanal: "semanas",
  quincenal: "quincenas",
  mensual: "meses",
  bimestral: "bimestres",
  trimestral: "trimestres",
  cuatrimestral: "cuatrimestres",
  semestral: "semestres",
  anual: "años"
};


/* ============================================================== */
/* 4. SIMULADOR DE INTERÉS (SIMPLE / COMPUESTO / CONTINUO)          */
/* ============================================================== */

const $sim = {
  form: () => document.getElementById("simuladorForm"),
  tipoOperacion: () => document.getElementById("tipoOperacion"),
  tipoInteres: () => document.getElementById("tipoInteres"),
  necesidadCalculo: () => document.getElementById("necesidadCalculo"),
  vp: () => document.getElementById("vp"),
  vf: () => document.getElementById("vf"),
  tasa: () => document.getElementById("tasa"),
  tipoTasa: () => document.getElementById("tipoTasa"),
  modalidadTasa: () => document.getElementById("modalidadTasa"),
  periodoTasa: () => document.getElementById("periodoTasa"),
  periodoTasaPersonal: () => document.getElementById("periodoTasaPersonal"),
  unidadTiempo: () => document.getElementById("unidadTiempo"),
  tiempo: () => document.getElementById("tiempo"),
  movimientosContainer: () => document.getElementById("movimientosContainer"),
  agregarMovBtn: () => document.getElementById("agregarMovimientoBtn"),
  limpiarBtn: () => document.getElementById("limpiarBtn"),
  textoExpl: () => document.getElementById("textoExplicativoDinamico"),
  resultadoTexto: () => document.getElementById("resultadoTexto"),
  movimientosTitulo: () => document.getElementById("movimientosTitulo"),
  movimientosDescripcion: () => document.getElementById("movimientosDescripcion"),
  movimientosLabel: () => document.getElementById("movimientosLabel")
};

function $dataField(name) {
  return document.querySelector(`[data-field="${name}"]`);
}

function showSimField(name) { $dataField(name)?.classList.remove("hidden"); }
function hideSimField(name) { $dataField(name)?.classList.add("hidden"); }

function getPalabraMovimiento() {
  return $sim.tipoOperacion().value === "credito"
    ? { singular: "desembolso", plural: "desembolsos" }
    : { singular: "aporte", plural: "aportes" };
}

function textoExplicativoSimulador(option) {
  const { plural } = getPalabraMovimiento();
  const map = {
    vf: "Estás calculando el Valor Futuro. Ingresa VP, tasa (con su tipo, modalidad y capitalización) y tiempo.",
    vp: "Estás calculando el Valor Presente. Ingresa VF, tasa y tiempo.",
    i:  "Estás calculando la tasa efectiva por periodo de la operación. Ingresa VP, VF y tiempo.",
    n:  "Estás calculando el número de periodos. Ingresa VP, VF y tasa.",
    vf_total: `Estás calculando el VF total con múltiples ${plural}. La tasa se convierte automáticamente al periodo de la operación.`,
    vp_total: `Estás calculando el VP total con múltiples ${plural}. La tasa se convierte automáticamente al periodo de la operación.`
  };
  return map[option] || "Completa solo los datos conocidos.";
}

function updateFormVisibility() {
  const opt = $sim.necesidadCalculo().value;

  ["vp","vf","tasa","tipoTasa","modalidadTasa","periodoTasa","tiempoUnidad","tiempo","movimientos"]
    .forEach(hideSimField);

  // Siempre mostramos los atributos de la tasa y el tiempo, excepto cuando se oculta la variable buscada
  if (opt === "vf") {
    showSimField("vp"); showSimField("tasa"); showSimField("tipoTasa");
    showSimField("modalidadTasa"); showSimField("periodoTasa");
    showSimField("tiempoUnidad"); showSimField("tiempo");
  } else if (opt === "vp") {
    showSimField("vf"); showSimField("tasa"); showSimField("tipoTasa");
    showSimField("modalidadTasa"); showSimField("periodoTasa");
    showSimField("tiempoUnidad"); showSimField("tiempo");
  } else if (opt === "i") {
    showSimField("vp"); showSimField("vf");
    showSimField("tiempoUnidad"); showSimField("tiempo");
  } else if (opt === "n") {
    showSimField("vp"); showSimField("vf"); showSimField("tasa");
    showSimField("tipoTasa"); showSimField("modalidadTasa"); showSimField("periodoTasa");
    showSimField("tiempoUnidad");
  } else if (opt === "vf_total" || opt === "vp_total") {
    showSimField("tasa"); showSimField("tipoTasa");
    showSimField("modalidadTasa"); showSimField("periodoTasa");
    showSimField("tiempoUnidad"); showSimField("tiempo");
    showSimField("movimientos");
  }

  togglePeriodoTasaPersonal();
  $sim.textoExpl().textContent = textoExplicativoSimulador(opt);
  updateMovementTexts();
}

function togglePeriodoTasaPersonal() {
  const periodo = $sim.periodoTasa().value;
  const field = $dataField("periodoTasaPersonal");
  if (!field) return;
  if (periodo === "personalizado") field.classList.remove("hidden");
  else field.classList.add("hidden");
}

function renderMovementEmptyState() {
  const { plural } = getPalabraMovimiento();
  const cont = $sim.movimientosContainer();
  if (!cont) return;
  const hasRows = cont.querySelector(".movement-row");
  if (!hasRows) {
    cont.innerHTML = `
      <div class="movement-empty">
        Aún no has agregado ${plural}. Usa el botón <strong>+ Agregar movimiento</strong>.
      </div>
    `;
  }
}

function updateMovementTexts() {
  const { singular, plural } = getPalabraMovimiento();
  $sim.movimientosTitulo().textContent = plural[0].toUpperCase() + plural.slice(1);
  $sim.movimientosLabel().textContent = "Detalle de " + plural;
  $sim.movimientosDescripcion().textContent =
    `Agrega cada ${singular} con su monto y el periodo desde el que empieza a contar.`;

  const rows = $sim.movimientosContainer().querySelectorAll(".movement-row");
  rows.forEach((row, idx) => {
    const lbl = row.querySelector(".movement-amount-label");
    if (lbl) lbl.textContent = `${singular[0].toUpperCase() + singular.slice(1)} ${idx + 1}`;
  });
  renderMovementEmptyState();
}

function createMovementRow() {
  const { singular } = getPalabraMovimiento();
  const cont = $sim.movimientosContainer();
  const count = cont.querySelectorAll(".movement-row").length + 1;

  const row = document.createElement("div");
  row.className = "movement-row";
  row.innerHTML = `
    <div class="field">
      <label class="movement-amount-label">${singular[0].toUpperCase() + singular.slice(1)} ${count}</label>
      <input type="text" class="movement-monto" inputmode="decimal" placeholder="1.000.000" data-money="true" />
    </div>
    <div class="field">
      <label>Unidad del periodo</label>
      <select class="movement-period-unit">
        <option value="diario">Días</option>
        <option value="semanal">Semanas</option>
        <option value="quincenal">Quincenas</option>
        <option value="mensual" selected>Meses</option>
        <option value="bimestral">Bimestres</option>
        <option value="trimestral">Trimestres</option>
        <option value="cuatrimestral">Cuatrimestres</option>
        <option value="semestral">Semestres</option>
        <option value="anual">Años</option>
      </select>
    </div>
    <div class="field">
      <label>Número del periodo</label>
      <input type="text" class="movement-periodo" inputmode="decimal" placeholder="Ej. 4" />
    </div>
    <button type="button" class="btn-danger eliminar-movimiento">Eliminar</button>
  `;

  attachMoneyFormatter(row.querySelector(".movement-monto"));
  attachDecimalFormatter(row.querySelector(".movement-periodo"));

  row.querySelector(".eliminar-movimiento").addEventListener("click", () => {
    row.remove();
    renderMovementEmptyState();
    updateMovementTexts();
  });

  if (cont.querySelector(".movement-empty")) cont.innerHTML = "";
  cont.appendChild(row);
  updateMovementTexts();
}

/* Convierte tiempo del usuario a número de periodos expresados en la
   UNIDAD DE TIEMPO escogida (no en la de la tasa). El motor luego usa
   la tasa convertida al mismo periodo. */
function convertirTiempoEnMismaUnidad(tiempo) {
  // El tiempo se usa directamente como "n" en la unidad escogida; ningún cambio adicional.
  return tiempo;
}

function getSimulationData() {
  const opt = $sim.necesidadCalculo().value;
  const periodoOp = $sim.unidadTiempo().value; // unidad del tiempo = periodo de la operación
  const tiempo = parseColombianNumber($sim.tiempo().value);

  const tasaDescriptor = {
    valor: parseColombianNumber($sim.tasa().value),
    tipo: $sim.tipoTasa().value,
    modalidad: $sim.modalidadTasa().value,
    periodo: $sim.periodoTasa().value,
    mesesPersonal: parseColombianNumber($sim.periodoTasaPersonal().value)
  };

  const data = {
    tipoOperacion: $sim.tipoOperacion().value,
    tipoInteres: $sim.tipoInteres().value,
    necesidadCalculo: opt,
    vp: parseColombianNumber($sim.vp().value),
    vf: parseColombianNumber($sim.vf().value),
    tasa: tasaDescriptor,
    periodoOperacion: periodoOp,
    tiempo: tiempo,
    movimientos: []
  };

  if (opt === "vf_total" || opt === "vp_total") {
    const rows = $sim.movimientosContainer().querySelectorAll(".movement-row");
    rows.forEach((row) => {
      const monto = parseColombianNumber(row.querySelector(".movement-monto")?.value || "");
      const periodoOriginal = parseColombianNumber(row.querySelector(".movement-periodo")?.value || "");
      const unidadMov = row.querySelector(".movement-period-unit")?.value || periodoOp;
      if (Number.isFinite(monto) && Number.isFinite(periodoOriginal)) {
        // Convertir el periodo del movimiento a la unidad de la operación
        const factor = (PERIODOS_POR_ANIO[periodoOp]) / (PERIODOS_POR_ANIO[unidadMov] || PERIODOS_POR_ANIO[periodoOp]);
        data.movimientos.push({
          monto,
          periodoOriginal,
          unidadMovimiento: unidadMov,
          periodo: periodoOriginal * factor // en la unidad de la operación
        });
      }
    });
  }

  return data;
}

function validarSimulacion(data) {
  const n = data.necesidadCalculo;

  const tasaRequerida = (n === "vf" || n === "vp" || n === "n" || n === "vf_total" || n === "vp_total");
  if (tasaRequerida) {
    if (!Number.isFinite(data.tasa.valor)) return "Debes ingresar una tasa válida.";
    if (data.tasa.valor < 0) return "La tasa no puede ser negativa.";
    if (data.tasa.periodo === "personalizado" && (!Number.isFinite(data.tasa.mesesPersonal) || data.tasa.mesesPersonal <= 0))
      return "Indica cada cuántos meses capitaliza la tasa (mayor que cero).";
  }

  if (n === "vf" || n === "vp" || n === "i" || n === "vf_total" || n === "vp_total") {
    if (!Number.isFinite(data.tiempo) || data.tiempo <= 0) return "Debes ingresar un tiempo válido mayor que cero.";
  }

  if (n === "vf") {
    if (!Number.isFinite(data.vp) || data.vp <= 0) return "Ingresa un Valor Presente válido y mayor que cero.";
  }
  if (n === "vp") {
    if (!Number.isFinite(data.vf) || data.vf <= 0) return "Ingresa un Valor Futuro válido y mayor que cero.";
  }
  if (n === "i" || n === "n") {
    if (!Number.isFinite(data.vp) || !Number.isFinite(data.vf) || data.vp <= 0 || data.vf <= 0)
      return "Para hallar tasa o tiempo, VP y VF deben ser mayores que cero.";
  }
  if (n === "vf_total" || n === "vp_total") {
    if (!data.movimientos.length) return "Debes agregar al menos un movimiento.";
    if (n === "vf_total" && data.movimientos.some(m => m.periodo > data.tiempo))
      return "Ningún periodo de un movimiento puede ser mayor que el tiempo total.";
  }

  return null;
}

/* Calcula la tasa efectiva de la operación (decimal, por periodo de la operación).
   - Simple  → tasa proporcional
   - Compuesto → tasa equivalente (vencida) al periodo de operación
   - Continuo → se usa el logaritmo de (1+i_compuesta) */
function tasaAplicadaPorPeriodo(data) {
  if (data.tipoInteres === "simple") {
    return tasaASimpleProporcionalAlPeriodo(data.tasa, data.periodoOperacion);
  }
  const iComp = tasaACompuestaPeriodoOperacion(data.tasa, data.periodoOperacion);
  if (data.tipoInteres === "continuo") {
    // La tasa continua equivalente cumple: e^r = 1 + i_comp
    return Math.log(1 + iComp);
  }
  return iComp;
}

function calcSimple(data, iProp) {
  const { vp, vf, tiempo, necesidadCalculo, movimientos } = data;
  if (necesidadCalculo === "vf") return vp * (1 + iProp * tiempo);
  if (necesidadCalculo === "vp") {
    const denom = 1 + iProp * tiempo;
    if (denom === 0) throw new Error("División por cero al calcular VP.");
    return vf / denom;
  }
  if (necesidadCalculo === "i") {
    if (tiempo === 0 || vp === 0) throw new Error("VP y tiempo deben ser > 0.");
    return (((vf / vp) - 1) / tiempo); // decimal
  }
  if (necesidadCalculo === "n") {
    if (iProp === 0) throw new Error("La tasa proporcional no puede ser 0.");
    return ((vf / vp) - 1) / iProp;
  }
  if (necesidadCalculo === "vf_total") {
    return movimientos.reduce((s, m) => s + m.monto * (1 + iProp * (tiempo - m.periodo)), 0);
  }
  if (necesidadCalculo === "vp_total") {
    return movimientos.reduce((s, m) => s + m.monto / (1 + iProp * m.periodo), 0);
  }
  throw new Error("Opción no válida.");
}

function calcCompuesto(data, iComp) {
  const { vp, vf, tiempo, necesidadCalculo, movimientos } = data;
  if (necesidadCalculo === "vf") return vp * Math.pow(1 + iComp, tiempo);
  if (necesidadCalculo === "vp") return vf / Math.pow(1 + iComp, tiempo);
  if (necesidadCalculo === "i") {
    if (vp <= 0 || vf <= 0 || tiempo === 0) throw new Error("VP, VF y tiempo deben ser > 0.");
    return Math.pow(vf / vp, 1 / tiempo) - 1;
  }
  if (necesidadCalculo === "n") {
    if (vp <= 0 || vf <= 0 || 1 + iComp <= 0) throw new Error("Valores inválidos para calcular n.");
    return Math.log(vf / vp) / Math.log(1 + iComp);
  }
  if (necesidadCalculo === "vf_total") {
    return movimientos.reduce((s, m) => s + m.monto * Math.pow(1 + iComp, tiempo - m.periodo), 0);
  }
  if (necesidadCalculo === "vp_total") {
    return movimientos.reduce((s, m) => s + m.monto / Math.pow(1 + iComp, m.periodo), 0);
  }
  throw new Error("Opción no válida.");
}

function calcContinuo(data, rCont) {
  const { vp, vf, tiempo, necesidadCalculo, movimientos } = data;
  if (necesidadCalculo === "vf") return vp * Math.exp(rCont * tiempo);
  if (necesidadCalculo === "vp") return vf * Math.exp(-rCont * tiempo);
  if (necesidadCalculo === "i") {
    if (vp <= 0 || vf <= 0 || tiempo === 0) throw new Error("VP, VF y tiempo deben ser > 0.");
    return Math.log(vf / vp) / tiempo;
  }
  if (necesidadCalculo === "n") {
    if (vp <= 0 || vf <= 0 || rCont === 0) throw new Error("Valores inválidos para calcular n.");
    return Math.log(vf / vp) / rCont;
  }
  if (necesidadCalculo === "vf_total") {
    return movimientos.reduce((s, m) => s + m.monto * Math.exp(rCont * (tiempo - m.periodo)), 0);
  }
  if (necesidadCalculo === "vp_total") {
    return movimientos.reduce((s, m) => s + m.monto * Math.exp(-rCont * m.periodo), 0);
  }
  throw new Error("Opción no válida.");
}

function ejecutarCalculoSimulador(data) {
  // Para calcular "i" no usamos la tasa de entrada (se halla ella misma)
  let tasaAplicada = null;
  if (data.necesidadCalculo !== "i") {
    tasaAplicada = tasaAplicadaPorPeriodo(data);
  }

  let result;
  if (data.tipoInteres === "simple")    result = calcSimple(data, tasaAplicada);
  else if (data.tipoInteres === "compuesto") result = calcCompuesto(data, tasaAplicada);
  else if (data.tipoInteres === "continuo")  result = calcContinuo(data, tasaAplicada);
  else throw new Error("Tipo de interés no reconocido.");

  return { result, tasaAplicada };
}

function etiquetaResultado(option) {
  const map = {
    vf: "Valor Futuro (VF)",
    vp: "Valor Presente (VP)",
    i:  "Tasa de interés por periodo (i)",
    n:  "Tiempo / número de periodos (n)",
    vf_total: "Valor Futuro total",
    vp_total: "Valor Presente total"
  };
  return map[option] || "Resultado";
}

function formatearResultado(value, option, data) {
  if (option === "i") {
    const unidad = NOMBRE_UNIDAD_TIEMPO[data.periodoOperacion] || data.periodoOperacion;
    return `${formatColombianNumber(value * 100, 6)} % por periodo (${unidad})`;
  }
  if (option === "n") {
    const unidad = NOMBRE_UNIDAD_TIEMPO[data.periodoOperacion] || data.periodoOperacion;
    return `${formatColombianNumber(value, 4)} ${unidad}`;
  }
  return formatMoney(value);
}

function labelOperacion(v) { return v === "credito" ? "Crédito" : "Inversión"; }
function labelInteres(v) { return { simple: "Interés simple", compuesto: "Interés compuesto", continuo: "Interés continuo" }[v] || v; }

function actualizarResumenEjecutivo(data, result, tasaAplicada) {
  document.getElementById("summaryResultado").textContent =
    `${etiquetaResultado(data.necesidadCalculo)}: ${formatearResultado(result, data.necesidadCalculo, data)}`;

  document.getElementById("summaryOperacion").textContent = labelOperacion(data.tipoOperacion);
  document.getElementById("summaryInteres").textContent = labelInteres(data.tipoInteres);

  const tasaTxt = Number.isFinite(data.tasa.valor)
    ? `${formatColombianNumber(data.tasa.valor, 4)} % ${data.tasa.tipo} ${data.tasa.modalidad} ${nombrePeriodoHumano(data.tasa.periodo, data.tasa.mesesPersonal)}`
    : "—";
  document.getElementById("summaryTasa").textContent = tasaTxt;

  const tasaEquiv = (tasaAplicada != null && data.necesidadCalculo !== "i")
    ? (data.tipoInteres === "simple"
        ? `${formatColombianNumber(tasaAplicada * 100, 6)} % simple proporcional por ${NOMBRE_UNIDAD_TIEMPO[data.periodoOperacion]}`
        : data.tipoInteres === "continuo"
          ? `${formatColombianNumber(tasaAplicada * 100, 6)} % continua por ${NOMBRE_UNIDAD_TIEMPO[data.periodoOperacion]}`
          : `${formatColombianNumber(tasaAplicada * 100, 6)} % efectiva vencida por ${NOMBRE_UNIDAD_TIEMPO[data.periodoOperacion]}`)
    : "—";
  document.getElementById("summaryTasaEquivalente").textContent = tasaEquiv;

  document.getElementById("summaryUnidadTiempo").textContent = NOMBRE_UNIDAD_TIEMPO[data.periodoOperacion] || "—";
  document.getElementById("summaryTiempoIngresado").textContent =
    Number.isFinite(data.tiempo) ? `${formatColombianNumber(data.tiempo, 4)} ${NOMBRE_UNIDAD_TIEMPO[data.periodoOperacion]}` : "—";

  document.getElementById("summaryTiempoPeriodos").textContent =
    Number.isFinite(data.tiempo) ? `${formatColombianNumber(data.tiempo, 4)} periodos` : "—";

  // Interpretación
  const obs = data.tipoOperacion === "credito" ? "Este valor representa el costo/condición del crédito." : "Este valor representa el resultado esperado de tu inversión.";
  let inter = "Aquí aparecerá la interpretación principal del cálculo.";
  const fmtVP = formatMoney(data.vp);
  const fmtVF = formatMoney(data.vf);
  if (data.necesidadCalculo === "vf") {
    inter = `Comenzando con ${fmtVP} y aplicando la tasa convertida de ${tasaEquiv}, en ${formatColombianNumber(data.tiempo,4)} ${NOMBRE_UNIDAD_TIEMPO[data.periodoOperacion]} el capital crece hasta ${formatMoney(result)}. ${obs}`;
  } else if (data.necesidadCalculo === "vp") {
    inter = `Para obtener un Valor Futuro de ${fmtVF}, se necesita un Valor Presente de ${formatMoney(result)}, con una tasa de ${tasaEquiv} durante ${formatColombianNumber(data.tiempo,4)} ${NOMBRE_UNIDAD_TIEMPO[data.periodoOperacion]}. ${obs}`;
  } else if (data.necesidadCalculo === "i") {
    inter = `Se requiere una tasa de ${formatColombianNumber(result*100,6)} % por periodo (${NOMBRE_UNIDAD_TIEMPO[data.periodoOperacion]}) para llevar ${fmtVP} a ${fmtVF} en ${formatColombianNumber(data.tiempo,4)} periodos.`;
  } else if (data.necesidadCalculo === "n") {
    inter = `Con la tasa ingresada (${tasaEquiv}) y VP/VF dados, se necesitan ${formatColombianNumber(result,4)} periodos (${NOMBRE_UNIDAD_TIEMPO[data.periodoOperacion]}).`;
  } else if (data.necesidadCalculo === "vf_total" || data.necesidadCalculo === "vp_total") {
    inter = `El resultado consolida ${data.movimientos.length} movimiento(s) con tasa equivalente ${tasaEquiv} durante ${formatColombianNumber(data.tiempo,4)} ${NOMBRE_UNIDAD_TIEMPO[data.periodoOperacion]}.`;
  }
  document.getElementById("summaryInterpretacion").textContent = inter;
}

function limpiarResumen() {
  ["summaryResultado","summaryInterpretacion","summaryOperacion","summaryInteres",
   "summaryTasa","summaryTasaEquivalente","summaryUnidadTiempo","summaryTiempoIngresado",
   "summaryTiempoPeriodos"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = "—"; });
  const txt = document.getElementById("summaryInterpretacion");
  if (txt) txt.textContent = "Aquí aparecerá la interpretación principal del cálculo.";
}

function actualizarComparador(data) {
  const simple = document.getElementById("compareSimple");
  const compuesto = document.getElementById("compareCompuesto");
  const continuo = document.getElementById("compareContinuo");

  const permite = ["vf","vp","vf_total","vp_total"].includes(data.necesidadCalculo);
  if (!permite) {
    simple.textContent = "No aplica"; compuesto.textContent = "No aplica"; continuo.textContent = "No aplica";
    return;
  }

  const calcula = (tipo) => {
    try {
      const d = { ...data, tipoInteres: tipo };
      const r = ejecutarCalculoSimulador(d).result;
      return formatearResultado(r, data.necesidadCalculo, data);
    } catch { return "—"; }
  };
  simple.textContent = calcula("simple");
  compuesto.textContent = calcula("compuesto");
  continuo.textContent = calcula("continuo");
}

function limpiarComparador() {
  ["compareSimple","compareCompuesto","compareContinuo"].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = "—";
  });
}

function generarSerieGrafica(data) {
  const labels = []; const values = [];
  const pasos = Math.max(1, Math.round(data.tiempo || 1));
  let tasaAplicada;
  try { tasaAplicada = tasaAplicadaPorPeriodo(data); } catch (_) { return { labels, values }; }

  if (data.necesidadCalculo === "vf" && Number.isFinite(data.vp)) {
    for (let i = 0; i <= pasos; i++) {
      labels.push(i);
      if (data.tipoInteres === "simple") values.push(data.vp * (1 + tasaAplicada * i));
      else if (data.tipoInteres === "compuesto") values.push(data.vp * Math.pow(1 + tasaAplicada, i));
      else if (data.tipoInteres === "continuo") values.push(data.vp * Math.exp(tasaAplicada * i));
    }
  }
  if (data.necesidadCalculo === "vf_total") {
    for (let i = 0; i <= pasos; i++) {
      labels.push(i);
      let total = 0;
      data.movimientos.forEach((m) => {
        if (m.periodo <= i) {
          const d = i - m.periodo;
          if (data.tipoInteres === "simple") total += m.monto * (1 + tasaAplicada * d);
          else if (data.tipoInteres === "compuesto") total += m.monto * Math.pow(1 + tasaAplicada, d);
          else if (data.tipoInteres === "continuo") total += m.monto * Math.exp(tasaAplicada * d);
        }
      });
      values.push(total);
    }
  }
  return { labels, values };
}

function dibujarGraficoEnCanvas(canvasId, _labels, values, titulo) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.offsetWidth;
  const height = canvas.height = 180;
  ctx.clearRect(0, 0, width, height);
  if (!values || !values.length) return;

  const padding = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  ctx.strokeStyle = "#dbe5f1"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padding, height - padding); ctx.lineTo(width - padding, height - padding); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(padding, padding); ctx.lineTo(padding, height - padding); ctx.stroke();

  ctx.fillStyle = "#64748b"; ctx.font = "12px -apple-system, Arial";
  ctx.fillText(titulo, padding, 16);

  ctx.strokeStyle = "#0071e3"; ctx.lineWidth = 3; ctx.beginPath();
  values.forEach((v, i) => {
    const x = padding + (i * (width - padding * 2)) / Math.max(values.length - 1, 1);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#0071e3";
  values.forEach((v, i) => {
    const x = padding + (i * (width - padding * 2)) / Math.max(values.length - 1, 1);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  });
}

function resetSimuladorEstado() {
  $sim.form().reset();
  $sim.movimientosContainer().innerHTML = "";
  renderMovementEmptyState();
  updateFormVisibility();
  $sim.resultadoTexto().textContent =
    "Aquí aparecerá el valor calculado, junto con el resumen de intereses y la interpretación para crédito o inversión.";
  limpiarResumen();
  limpiarComparador();
  dibujarGraficoEnCanvas("graficoSimulador", [], [], "");
}


/* ============================================================== */
/* 5. CONVERSOR UNIVERSAL DE TASAS (UI)                            */
/* ============================================================== */

function togglePeriodoPersonalConversor(which) {
  const periodoSel = document.getElementById(which === "entrada" ? "periodoEntrada" : "periodoSalida");
  const inputBox = document.getElementById(which === "entrada" ? "inputPeriodoEntrada" : "inputPeriodoSalida");
  if (!periodoSel || !inputBox) return;
  inputBox.classList.toggle("hidden", periodoSel.value !== "personalizado");
}

function ejecutarConversor() {
  const resBox = document.getElementById("resultadoTasaConvertida");
  const pasosBox = document.getElementById("interpretacionTasa");

  try {
    const valor = parseColombianNumber(document.getElementById("valorTasaEntrada").value);
    if (!Number.isFinite(valor) || valor < 0) {
      resBox.textContent = "Dato inválido";
      pasosBox.textContent = "Ingresa una tasa válida, no negativa (ej. 24 para 24%).";
      return;
    }

    const entrada = {
      valor,
      tipo: document.getElementById("tipoTasaEntrada").value,
      modalidad: document.getElementById("modalidadEntrada").value,
      periodo: document.getElementById("periodoEntrada").value,
      mesesPersonal: parseColombianNumber(document.getElementById("periodoPersonalEntrada").value)
    };
    const salida = {
      tipo: document.getElementById("tipoTasaSalida").value,
      modalidad: document.getElementById("modalidadSalida").value,
      periodo: document.getElementById("periodoSalida").value,
      mesesPersonal: parseColombianNumber(document.getElementById("periodoPersonalSalida").value)
    };

    if (entrada.periodo === "personalizado" && (!Number.isFinite(entrada.mesesPersonal) || entrada.mesesPersonal <= 0)) {
      resBox.textContent = "Dato inválido";
      pasosBox.textContent = "Indica cuántos meses capitaliza la tasa de entrada.";
      return;
    }
    if (salida.periodo === "personalizado" && (!Number.isFinite(salida.mesesPersonal) || salida.mesesPersonal <= 0)) {
      resBox.textContent = "Dato inválido";
      pasosBox.textContent = "Indica cuántos meses capitaliza la tasa de salida.";
      return;
    }

    // Paso a paso documentado
    const mEnt = periodosPorAnioDesde(entrada.periodo, entrada.mesesPersonal);
    const mSal = periodosPorAnioDesde(salida.periodo, salida.mesesPersonal);

    const valorDec = valor / 100;
    const iPerEntrada = entrada.tipo === "nominal" ? valorDec / mEnt : valorDec;
    let iPerEntradaVencida = iPerEntrada;
    if (entrada.modalidad === "anticipada") {
      iPerEntradaVencida = iPerEntrada / (1 - iPerEntrada);
    }
    const ea = Math.pow(1 + iPerEntradaVencida, mEnt) - 1;
    const iPerSalidaVencida = Math.pow(1 + ea, 1 / mSal) - 1;
    let iPerSalida = iPerSalidaVencida;
    if (salida.modalidad === "anticipada") iPerSalida = iPerSalidaVencida / (1 + iPerSalidaVencida);
    const tasaFinal = salida.tipo === "nominal" ? iPerSalida * mSal : iPerSalida;

    resBox.textContent = `${formatColombianNumber(tasaFinal * 100, 6)} %`;
    pasosBox.innerHTML = `
      <div class="paso-tasa">
        <span class="paso-numero">1</span>
        <div><strong>Tasa de entrada:</strong>
          ${formatColombianNumber(valor, 4)} % ${entrada.tipo} ${entrada.modalidad},
          capitaliza ${nombrePeriodoHumano(entrada.periodo, entrada.mesesPersonal)} (${formatColombianNumber(mEnt, 4)} periodos/año).
        </div>
      </div>
      <div class="paso-tasa">
        <span class="paso-numero">2</span>
        <div><strong>Tasa periódica de entrada:</strong>
          ${formatColombianNumber(iPerEntrada * 100, 8)} % ${entrada.modalidad}.
        </div>
      </div>
      <div class="paso-tasa">
        <span class="paso-numero">3</span>
        <div><strong>Tasa periódica llevada a vencida:</strong>
          ${formatColombianNumber(iPerEntradaVencida * 100, 8)} % vencida.
        </div>
      </div>
      <div class="paso-tasa">
        <span class="paso-numero">4</span>
        <div><strong>Puente · Efectiva Anual Vencida (EA):</strong>
          ${formatColombianNumber(ea * 100, 6)} %.
        </div>
      </div>
      <div class="paso-tasa">
        <span class="paso-numero">5</span>
        <div><strong>Tasa periódica vencida del periodo de salida:</strong>
          ${formatColombianNumber(iPerSalidaVencida * 100, 8)} % vencida cada ${nombrePeriodoHumano(salida.periodo, salida.mesesPersonal)}.
        </div>
      </div>
      <div class="paso-tasa">
        <span class="paso-numero">6</span>
        <div><strong>Ajuste a modalidad de salida:</strong>
          ${formatColombianNumber(iPerSalida * 100, 8)} % ${salida.modalidad}.
        </div>
      </div>
      <div class="resultado-final-tasa">
        <strong>Resultado final:</strong>
        ${formatColombianNumber(tasaFinal * 100, 6)} % ${salida.tipo} ${salida.modalidad}
        capitalizada ${nombrePeriodoHumano(salida.periodo, salida.mesesPersonal)}.
      </div>
    `;
  } catch (e) {
    resBox.textContent = "Error";
    pasosBox.textContent = e.message || "No fue posible convertir. Revisa los datos.";
  }
}


/* ============================================================== */
/* 6. SIMULADOR DE ANUALIDADES VENCIDAS                            */
/* ============================================================== */

const $anu = {
  form: () => document.getElementById("anualidadesForm"),
  operacion: () => document.getElementById("anualidadOperacion"),
  calculo: () => document.getElementById("anualidadCalculo"),
  cuota: () => document.getElementById("anualidadCuota"),
  vp: () => document.getElementById("anualidadVP"),
  vf: () => document.getElementById("anualidadVF"),
  tiempo: () => document.getElementById("anualidadTiempo"),
  periodoPago: () => document.getElementById("anualidadPeriodoPago"),
  periodoPagoPersonal: () => document.getElementById("anualidadPeriodoPagoPersonal"),
  tasa: () => document.getElementById("anualidadTasa"),
  tipoTasa: () => document.getElementById("anualidadTipoTasa"),
  modalidad: () => document.getElementById("anualidadModalidad"),
  periodoTasa: () => document.getElementById("anualidadPeriodoTasa"),
  periodoTasaPersonal: () => document.getElementById("anualidadPeriodoTasaPersonal"),
  extras: () => document.getElementById("extrasContainer"),
  agregarExtra: () => document.getElementById("agregarExtraBtn"),
  limpiar: () => document.getElementById("limpiarAnualidadBtn")
};

function $anuField(name) {
  return document.querySelector(`[data-anu-field="${name}"]`);
}

function actualizarVisibilidadAnualidad() {
  const c = $anu.calculo().value;
  // Cuál variable se busca, se oculta
  $anuField("cuota").classList.toggle("hidden", c === "a_desde_vp" || c === "a_desde_vf");
  $anuField("vp").classList.toggle("hidden", !(c === "a_desde_vp" || c === "vp"));
  $anuField("vf").classList.toggle("hidden", !(c === "a_desde_vf" || c === "vf"));
  if (c === "vp" || c === "vf") $anuField("cuota").classList.remove("hidden");
}

function togglePeriodoPagoAnualidadPersonal() {
  const el = document.getElementById("inputPeriodoPagoPersonal");
  el.classList.toggle("hidden", $anu.periodoPago().value !== "personalizado");
}
function togglePeriodoTasaAnualidadPersonal() {
  const el = document.getElementById("inputPeriodoTasaAnualidadPersonal");
  el.classList.toggle("hidden", $anu.periodoTasa().value !== "personalizado");
}

function renderExtrasEmpty() {
  const cont = $anu.extras();
  if (!cont) return;
  if (!cont.querySelector(".movement-row")) {
    cont.innerHTML = `
      <div class="movement-empty">
        Sin pagos extraordinarios. Usa <strong>+ Agregar pago extra</strong> si deseas añadir uno.
      </div>`;
  }
}

function crearFilaExtra() {
  const cont = $anu.extras();
  const count = cont.querySelectorAll(".movement-row").length + 1;

  const row = document.createElement("div");
  row.className = "movement-row";
  row.innerHTML = `
    <div class="field">
      <label>Monto del pago extra ${count}</label>
      <input type="text" class="extra-monto" inputmode="decimal" placeholder="1.000.000" data-money="true" />
    </div>
    <div class="field">
      <label>Periodo en que ocurre</label>
      <input type="text" class="extra-periodo" inputmode="decimal" placeholder="Ej. 12" />
    </div>
    <div class="field">
      <label>Tipo</label>
      <select class="extra-tipo">
        <option value="abono" selected>Abono extra (reduce saldo)</option>
        <option value="aporte">Aporte extra (suma al total)</option>
      </select>
    </div>
    <button type="button" class="btn-danger eliminar-extra">Eliminar</button>
  `;
  attachMoneyFormatter(row.querySelector(".extra-monto"));
  attachDecimalFormatter(row.querySelector(".extra-periodo"));
  row.querySelector(".eliminar-extra").addEventListener("click", () => {
    row.remove(); renderExtrasEmpty();
  });

  if (cont.querySelector(".movement-empty")) cont.innerHTML = "";
  cont.appendChild(row);
}

function leerExtras() {
  const rows = $anu.extras().querySelectorAll(".movement-row");
  const extras = [];
  rows.forEach((row) => {
    const monto = parseColombianNumber(row.querySelector(".extra-monto")?.value || "");
    const periodo = parseColombianNumber(row.querySelector(".extra-periodo")?.value || "");
    const tipo = row.querySelector(".extra-tipo")?.value || "aporte";
    if (Number.isFinite(monto) && Number.isFinite(periodo)) {
      extras.push({ monto, periodo, tipo }); // tipo: "abono" | "aporte"
    }
  });
  return extras;
}

function tasaEfectivaAnualidad() {
  const tasaDescriptor = {
    valor: parseColombianNumber($anu.tasa().value),
    tipo: $anu.tipoTasa().value,
    modalidad: $anu.modalidad().value,
    periodo: $anu.periodoTasa().value,
    mesesPersonal: parseColombianNumber($anu.periodoTasaPersonal().value)
  };
  const periodoPago = $anu.periodoPago().value;
  const mesesPagoPersonal = parseColombianNumber($anu.periodoPagoPersonal().value);

  return {
    i: tasaACompuestaPeriodoOperacion(tasaDescriptor, periodoPago, mesesPagoPersonal), // decimal vencida del periodo de pago
    tasaDescriptor,
    periodoPago,
    mesesPagoPersonal
  };
}

function calcularAnualidad() {
  try {
    const c = $anu.calculo().value;
    const A   = parseColombianNumber($anu.cuota().value);
    const VP  = parseColombianNumber($anu.vp().value);
    const VF  = parseColombianNumber($anu.vf().value);
    const n   = parseColombianNumber($anu.tiempo().value);
    const extras = leerExtras();

    // Validaciones
    if (!Number.isFinite(n) || n <= 0) throw new Error("Ingresa un número de periodos válido (> 0).");
    if (!Number.isFinite(parseColombianNumber($anu.tasa().value))) throw new Error("Ingresa el valor de la tasa.");
    if (parseColombianNumber($anu.tasa().value) < 0) throw new Error("La tasa no puede ser negativa.");
    if ($anu.periodoTasa().value === "personalizado" && (!Number.isFinite(parseColombianNumber($anu.periodoTasaPersonal().value)) || parseColombianNumber($anu.periodoTasaPersonal().value) <= 0))
      throw new Error("Indica cada cuántos meses capitaliza la tasa.");
    if ($anu.periodoPago().value === "personalizado" && (!Number.isFinite(parseColombianNumber($anu.periodoPagoPersonal().value)) || parseColombianNumber($anu.periodoPagoPersonal().value) <= 0))
      throw new Error("Indica cada cuántos meses ocurre el pago.");
    for (const e of extras) {
      if (e.periodo < 0 || e.periodo > n) throw new Error("Los pagos extraordinarios deben ocurrir entre el periodo 0 y n.");
    }

    if ((c === "vf" || c === "vp") && (!Number.isFinite(A) || A <= 0)) throw new Error("Ingresa el valor de la cuota A.");
    if (c === "a_desde_vp" && (!Number.isFinite(VP) || VP <= 0)) throw new Error("Ingresa el Valor Presente.");
    if (c === "a_desde_vf" && (!Number.isFinite(VF) || VF <= 0)) throw new Error("Ingresa el Valor Futuro.");

    const { i, tasaDescriptor, periodoPago, mesesPagoPersonal } = tasaEfectivaAnualidad();
    if (i <= -1) throw new Error("La tasa efectiva calculada no es válida.");

    // Factores clásicos de anualidad vencida
    const factorVF_A = i === 0 ? n : (Math.pow(1 + i, n) - 1) / i;                 // VF = A · factor
    const factorVP_A = i === 0 ? n : (Math.pow(1 + i, n) - 1) / (i * Math.pow(1 + i, n)); // VP = A · factor

    // Contribución de los extras según si se calcula VF o VP
    const extrasVFTotal = extras.reduce((s, e) => {
      const sign = e.tipo === "abono" ? -1 : 1;
      return s + sign * e.monto * Math.pow(1 + i, n - e.periodo);
    }, 0);
    const extrasVPTotal = extras.reduce((s, e) => {
      const sign = e.tipo === "abono" ? -1 : 1;
      return s + sign * e.monto / Math.pow(1 + i, e.periodo);
    }, 0);

    let resultado, etiqueta, cuotaUsada = A;

    if (c === "vf") {
      resultado = A * factorVF_A + extrasVFTotal;
      etiqueta = "Valor Futuro (VF)";
    } else if (c === "vp") {
      resultado = A * factorVP_A + extrasVPTotal;
      etiqueta = "Valor Presente (VP)";
    } else if (c === "a_desde_vp") {
      // VP = A · factorVP_A + extrasVP  →  A = (VP − extrasVP) / factorVP_A
      if (factorVP_A === 0) throw new Error("No es posible calcular A con estos datos.");
      resultado = (VP - extrasVPTotal) / factorVP_A;
      cuotaUsada = resultado; etiqueta = "Cuota A (desde VP)";
    } else if (c === "a_desde_vf") {
      if (factorVF_A === 0) throw new Error("No es posible calcular A con estos datos.");
      resultado = (VF - extrasVFTotal) / factorVF_A;
      cuotaUsada = resultado; etiqueta = "Cuota A (desde VF)";
    } else {
      throw new Error("Opción de cálculo desconocida.");
    }

    // Para reporting: calcular aportes totales e intereses
    const totalAportes = (Number.isFinite(cuotaUsada) ? cuotaUsada : 0) * n + extras.reduce((s,e) => s + (e.tipo === "aporte" ? e.monto : 0), 0);
    const totalAbonosExtra = extras.reduce((s,e) => s + (e.tipo === "abono" ? e.monto : 0), 0);
    // VF total considerando extras (referencia):
    const vfCuotas = (Number.isFinite(cuotaUsada) ? cuotaUsada : 0) * factorVF_A;
    const vfTotalConExtras = vfCuotas + extrasVFTotal;
    const interesesEstimados = Math.max(0, vfTotalConExtras - totalAportes + totalAbonosExtra);

    // === Pintado
    const esMoneda = (c === "vf" || c === "vp" || c === "a_desde_vp" || c === "a_desde_vf");
    document.getElementById("anualidadResultado").textContent =
      `${etiqueta}: ${esMoneda ? formatMoney(resultado) : formatColombianNumber(resultado, 4)}`;

    const unidadPago = nombrePeriodoHumano(periodoPago, mesesPagoPersonal);
    let inter;
    if (c === "vf") {
      inter = `Aportando ${formatMoney(A)} al final de cada periodo (${unidadPago}) durante ${formatColombianNumber(n,2)} periodos, con tasa efectiva ${formatPercent(i*100,6)} por periodo, acumulas ${formatMoney(resultado)}.`;
    } else if (c === "vp") {
      inter = `El valor presente de una serie de ${formatColombianNumber(n,0)} cuotas de ${formatMoney(A)} pagadas al final de cada periodo (${unidadPago}) es ${formatMoney(resultado)}.`;
    } else if (c === "a_desde_vp") {
      inter = `Para un préstamo de ${formatMoney(VP)} a ${formatColombianNumber(n,0)} periodos (${unidadPago}) con tasa efectiva ${formatPercent(i*100,6)} por periodo, la cuota vencida es ${formatMoney(resultado)}.`;
    } else {
      inter = `Para alcanzar una meta de ${formatMoney(VF)} en ${formatColombianNumber(n,0)} periodos (${unidadPago}) con tasa efectiva ${formatPercent(i*100,6)} por periodo, debes aportar ${formatMoney(resultado)} al final de cada periodo.`;
    }
    if (extras.length) {
      inter += ` Se consideraron ${extras.length} pago(s) extraordinario(s).`;
    }
    document.getElementById("anualidadInterpretacion").textContent = inter;

    document.getElementById("anuSumOperacion").textContent = labelOperacion($anu.operacion().value);
    document.getElementById("anuSumTasa").textContent =
      `${formatColombianNumber(tasaDescriptor.valor, 4)} % ${tasaDescriptor.tipo} ${tasaDescriptor.modalidad} ${nombrePeriodoHumano(tasaDescriptor.periodo, tasaDescriptor.mesesPersonal)}`;
    document.getElementById("anuSumTasaPeriodo").textContent =
      `${formatColombianNumber(i * 100, 6)} % efectiva vencida ${unidadPago}`;
    document.getElementById("anuSumN").textContent = `${formatColombianNumber(n, 2)}`;
    document.getElementById("anuSumPeriodo").textContent = unidadPago;
    document.getElementById("anuSumExtras").textContent = extras.length ? `${extras.length} (neto ${formatMoney(extras.reduce((s,e)=> s + (e.tipo === "abono" ? -e.monto : e.monto), 0))})` : "Ninguno";

    document.getElementById("anuTotalAportes").textContent = formatMoney(totalAportes);
    document.getElementById("anuTotalIntereses").textContent = formatMoney(interesesEstimados);
    document.getElementById("anuTotalConExtras").textContent = formatMoney(vfTotalConExtras);

    // Gráfico: evolución del saldo acumulado (VF parcial por periodo)
    const cuotaFinal = Number.isFinite(cuotaUsada) ? cuotaUsada : 0;
    const labels = []; const values = [];
    let saldo = 0;
    for (let k = 0; k <= Math.max(1, Math.round(n)); k++) {
      labels.push(k);
      if (k === 0) { values.push(0); continue; }
      saldo = saldo * (1 + i) + cuotaFinal;
      extras.filter(e => Math.round(e.periodo) === k).forEach(e => {
        saldo += e.tipo === "abono" ? -e.monto : e.monto;
      });
      values.push(saldo);
    }
    dibujarGraficoEnCanvas("graficoAnualidad", labels, values, "Acumulación de la anualidad");
  } catch (err) {
    document.getElementById("anualidadResultado").textContent = "Error";
    document.getElementById("anualidadInterpretacion").textContent = err.message || "Revisa los datos ingresados.";
    ["anuSumOperacion","anuSumTasa","anuSumTasaPeriodo","anuSumN","anuSumPeriodo","anuSumExtras","anuTotalAportes","anuTotalIntereses","anuTotalConExtras"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = "—"; });
    dibujarGraficoEnCanvas("graficoAnualidad", [], [], "");
  }
}

function resetAnualidades() {
  $anu.form().reset();
  $anu.extras().innerHTML = "";
  renderExtrasEmpty();
  actualizarVisibilidadAnualidad();
  togglePeriodoPagoAnualidadPersonal();
  togglePeriodoTasaAnualidadPersonal();
  document.getElementById("anualidadResultado").textContent = "—";
  document.getElementById("anualidadInterpretacion").textContent = "Aquí aparecerá la interpretación del cálculo.";
  ["anuSumOperacion","anuSumTasa","anuSumTasaPeriodo","anuSumN","anuSumPeriodo","anuSumExtras","anuTotalAportes","anuTotalIntereses","anuTotalConExtras"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = "—"; });
  dibujarGraficoEnCanvas("graficoAnualidad", [], [], "");
}


/* ============================================================== */
/* 7. TABS DEL SIMULADOR                                           */
/* ============================================================== */

function activarTabSimulador(targetId) {
  document.querySelectorAll(".sim-view").forEach(v => v.classList.add("hidden"));
  document.getElementById(targetId)?.classList.remove("hidden");
  document.querySelectorAll(".sim-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.target === targetId);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}


/* ============================================================== */
/* 8. INICIALIZACIÓN (bindings)                                    */
/* ============================================================== */

(function initFinanzasPro() {
  // Formatos de dinero y decimales en todos los inputs marcados
  document.querySelectorAll('[data-money="true"]').forEach(attachMoneyFormatter);
  ["tasa","tiempo","periodoTasaPersonal",
   "valorTasaEntrada","periodoPersonalEntrada","periodoPersonalSalida",
   "anualidadTiempo","anualidadTasa","anualidadPeriodoTasaPersonal","anualidadPeriodoPagoPersonal"]
    .forEach(id => attachDecimalFormatter(document.getElementById(id)));

  // --- Simulador de intereses
  if ($sim.form()) {
    $sim.necesidadCalculo().addEventListener("change", updateFormVisibility);
    $sim.tipoOperacion().addEventListener("change", () => { updateMovementTexts(); updateFormVisibility(); });
    $sim.periodoTasa().addEventListener("change", togglePeriodoTasaPersonal);
    $sim.agregarMovBtn()?.addEventListener("click", createMovementRow);
    $sim.limpiarBtn()?.addEventListener("click", resetSimuladorEstado);

    $sim.form().addEventListener("submit", (e) => {
      e.preventDefault();
      try {
        const data = getSimulationData();
        const err = validarSimulacion(data);
        if (err) {
          $sim.resultadoTexto().textContent = err;
          limpiarResumen(); limpiarComparador();
          dibujarGraficoEnCanvas("graficoSimulador", [], [], "");
          return;
        }
        const { result, tasaAplicada } = ejecutarCalculoSimulador(data);
        $sim.resultadoTexto().textContent =
          `${etiquetaResultado(data.necesidadCalculo)}: ${formatearResultado(result, data.necesidadCalculo, data)}`;
        actualizarResumenEjecutivo(data, result, tasaAplicada);
        actualizarComparador(data);
        const serie = generarSerieGrafica(data);
        dibujarGraficoEnCanvas("graficoSimulador", serie.labels, serie.values, "Evolución financiera");
      } catch (error) {
        $sim.resultadoTexto().textContent = error.message || "Ocurrió un error al calcular.";
        limpiarResumen(); limpiarComparador();
        dibujarGraficoEnCanvas("graficoSimulador", [], [], "");
      }
    });

    renderMovementEmptyState();
    updateFormVisibility();
  }

  // --- Conversor universal
  const formConv = document.getElementById("conversorForm");
  if (formConv) {
    document.getElementById("periodoEntrada").addEventListener("change", () => togglePeriodoPersonalConversor("entrada"));
    document.getElementById("periodoSalida").addEventListener("change", () => togglePeriodoPersonalConversor("salida"));
    togglePeriodoPersonalConversor("entrada");
    togglePeriodoPersonalConversor("salida");

    formConv.addEventListener("submit", (e) => { e.preventDefault(); ejecutarConversor(); });
    document.getElementById("limpiarConversor")?.addEventListener("click", () => {
      setTimeout(() => {
        document.getElementById("resultadoTasaConvertida").textContent = "—";
        document.getElementById("interpretacionTasa").textContent = "Aquí aparecerá el resultado de la tasa equivalente.";
        togglePeriodoPersonalConversor("entrada"); togglePeriodoPersonalConversor("salida");
      }, 0);
    });
  }

  // --- Anualidades
  if ($anu.form()) {
    $anu.calculo().addEventListener("change", actualizarVisibilidadAnualidad);
    $anu.periodoPago().addEventListener("change", togglePeriodoPagoAnualidadPersonal);
    $anu.periodoTasa().addEventListener("change", togglePeriodoTasaAnualidadPersonal);
    $anu.agregarExtra().addEventListener("click", crearFilaExtra);
    $anu.limpiar().addEventListener("click", resetAnualidades);
    $anu.form().addEventListener("submit", (e) => { e.preventDefault(); calcularAnualidad(); });

    actualizarVisibilidadAnualidad();
    togglePeriodoPagoAnualidadPersonal();
    togglePeriodoTasaAnualidadPersonal();
    renderExtrasEmpty();
  }

  // --- Tabs del simulador
  document.querySelectorAll(".sim-tab").forEach(btn => {
    btn.addEventListener("click", () => activarTabSimulador(btn.dataset.target));
  });
})();
function actualizarCamposAnualidad() {
  const objetivo = document.getElementById("objetivoAnualidad").value;

  const campoCuota = document.getElementById("valorCuota").parentElement;
  const campoObjetivo = document.getElementById("valorObjetivoAnualidad").parentElement;

  if (objetivo === "vf_anualidad" || objetivo === "vp_anualidad") {
    campoCuota.style.display = "block";
    campoObjetivo.style.display = "none";
  }

  if (objetivo === "a_desde_vf" || objetivo === "a_desde_vp") {
    campoCuota.style.display = "none";
    campoObjetivo.style.display = "block";
  }
}
document.addEventListener("DOMContentLoaded", () => {
  actualizarCamposAnualidad();
});

