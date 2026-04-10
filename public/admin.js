let clientesGlobal = {};
let semanaOffset = 0;
let horaAsistenciaHoy = "";
let clientesFiltrados = [];
let listaEsperaGlobal = [];
let ciclosPagoGlobal = [];
let pagosGlobal = [];
let clientePagoSeleccionado = null;
let editarPagoModalInstance = null;
let eliminarPagoModalInstance = null;

const horarios = ["08:00", "09:00", "10:00", "11:00", "16:00", "17:00", "18:00", "19:00"];
const opcionesFetch = { credentials: "include", headers: { "Content-Type": "application/json" } };
const THEME_KEY = "pilates-theme";
const UMBRAL_PACK_POR_VENCER = 2;

function clasesPorSemana(pack) {
  if (Number(pack) === 4) return 1;
  if (Number(pack) === 8) return 2;
  if (Number(pack) === 12) return 3;
  if (Number(pack) === 16) return 4;
  return 1;
}

function aplicarTema(theme) {
  document.documentElement.setAttribute("data-bs-theme", theme);
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === "dark" ? "Modo claro" : "Modo oscuro";
  }
}

function inicializarTema() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "light";
  aplicarTema(savedTheme);

  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (!themeToggleBtn) return;

  themeToggleBtn.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-bs-theme") === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, nextTheme);
    aplicarTema(nextTheme);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizarTexto(valor) {
  return String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function obtenerFechaHoy() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function formatearFecha(fechaTexto) {
  const [year, month, day] = String(fechaTexto).split("-");
  if (!year || !month || !day) return fechaTexto;
  return `${day}/${month}/${year}`;
}

function formatearDiaSemana(fechaTexto) {
  const [year, month, day] = String(fechaTexto).split("-").map(Number);
  if (!year || !month || !day) return fechaTexto;

  const fecha = new Date(year, month - 1, day);
  const nombre = fecha.toLocaleDateString("es-AR", { weekday: "long" });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

function formatearMonto(valor) {
  const numero = Number(valor) || 0;
  return numero.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  });
}

function formatearReferenciaCiclo(ciclo) {
  if (!ciclo) return "";
  const partes = [];
  if (ciclo.periodo_label) partes.push(String(ciclo.periodo_label));
  if (ciclo.pack_referencia) partes.push(`Pack ${ciclo.pack_referencia} clases`);
  return partes.join(" · ");
}

function obtenerMesClave(fechaTexto) {
  const [year, month] = String(fechaTexto).split("-");
  if (!year || !month) return "";
  return `${year}-${month}`;
}

function sumarDias(fechaTexto, dias) {
  const [year, month, day] = String(fechaTexto).split("-").map(Number);
  const fecha = new Date(year, month - 1, day);
  fecha.setDate(fecha.getDate() + dias);
  const yyyy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function diaSemanaDesdeFecha(fechaTexto) {
  const [year, month, day] = String(fechaTexto).split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

function obtenerEstadoPack(restantes) {
  const numeroRestantes = Number(restantes) || 0;

  if (numeroRestantes <= 0) {
    return {
      key: "agotado",
      texto: "Pack agotado",
      clase: "bg-dark-subtle text-dark"
    };
  }

  if (numeroRestantes <= UMBRAL_PACK_POR_VENCER) {
    return {
      key: "por-vencer",
      texto: `Quedan ${numeroRestantes} clase${numeroRestantes === 1 ? "" : "s"}`,
      clase: "bg-danger-subtle text-danger-emphasis"
    };
  }

  if (numeroRestantes <= 4) {
    return {
      key: "avisar",
      texto: "Conviene avisar renovacion",
      clase: "bg-warning-subtle text-warning-emphasis"
    };
  }

  return {
    key: "en-curso",
    texto: "Pack en curso",
    clase: "bg-success-subtle text-success-emphasis"
  };
}

function obtenerSugerenciaRenovacion(lista, packObjetivo = null) {
  const clasesOrdenadas = ordenarClasesPorFecha(lista);
  if (!clasesOrdenadas.length) return null;

  const pack = Number(packObjetivo || clasesOrdenadas[0].pack);
  const objetivoSemanal = clasesPorSemana(pack);
  const ultimaClase = clasesOrdenadas[clasesOrdenadas.length - 1];
  const ultimaFecha = ultimaClase.dia;

  const slots = [];
  const vistos = new Set();
  for (const reserva of clasesOrdenadas) {
    const slotKey = `${diaSemanaDesdeFecha(reserva.dia)}|${reserva.hora}`;
    if (!vistos.has(slotKey)) {
      vistos.add(slotKey);
      slots.push({
        diaSemana: diaSemanaDesdeFecha(reserva.dia),
        hora: reserva.hora
      });
    }
  }

  const slotsUsados = slots
    .sort((a, b) => a.diaSemana - b.diaSemana || a.hora.localeCompare(b.hora))
    .slice(0, objetivoSemanal);

  if (!slotsUsados.length) return null;

  const sugeridas = [];
  let cursor = sumarDias(ultimaFecha, 1);
  while (sugeridas.length < pack) {
    const diaCursor = diaSemanaDesdeFecha(cursor);
    slotsUsados.forEach((slot) => {
      if (slot.diaSemana === diaCursor && sugeridas.length < pack) {
        sugeridas.push({
          dia: cursor,
          hora: slot.hora
        });
      }
    });
    cursor = sumarDias(cursor, 1);
  }

  return {
    fechaLimite: sugeridas[0]?.dia || null,
    clases: sugeridas
  };
}

function obtenerEstadoRenovacion(lista) {
  const pendientes = lista.filter((reserva) => String(reserva.asistida) === "0").length;
  if (pendientes > 0) {
    return null;
  }

  const sugerencia = obtenerSugerenciaRenovacion(lista);
  if (!sugerencia?.fechaLimite) return null;

  return {
    texto: `Cobrar antes del ${formatearFecha(sugerencia.fechaLimite)}`,
    fechaLimite: sugerencia.fechaLimite
  };
}

function obtenerClientesProcesados() {
  return Object.keys(clientesGlobal)
    .sort((a, b) => a.localeCompare(b))
    .map((dni) => {
      const lista = clientesGlobal[dni];
      const cli = lista[0];
      const restantes = lista.filter((reserva) => String(reserva.asistida) === "0").length;
      const recordatorio = obtenerEstadoPack(restantes);
      const renovacion = obtenerEstadoRenovacion(lista);

      return {
        dni,
        lista,
        cli,
        restantes,
        recordatorio,
        renovacion
      };
    });
}

function obtenerFiltrosClientes() {
  return {
    busqueda: document.getElementById("filtroBusqueda")?.value.trim().toLowerCase() || "",
    pack: document.getElementById("filtroPack")?.value || "",
    estado: document.getElementById("filtroEstadoPack")?.value || ""
  };
}

function filtrarClientes(clientes) {
  const filtros = obtenerFiltrosClientes();

  return clientes.filter(({ cli, dni, recordatorio }) => {
    const coincideBusqueda =
      !filtros.busqueda ||
      String(cli.nombre).toLowerCase().includes(filtros.busqueda) ||
      String(dni).toLowerCase().includes(filtros.busqueda) ||
      String(cli.telefono).toLowerCase().includes(filtros.busqueda);

    const coincidePack = !filtros.pack || String(cli.pack) === filtros.pack;
    const coincideEstado = !filtros.estado || recordatorio.key === filtros.estado;

    return coincideBusqueda && coincidePack && coincideEstado;
  });
}

function renderizarResumenFiltros(total, visibles) {
  const resumen = document.getElementById("resumenFiltros");
  if (!resumen) return;

  if (total === 0) {
    resumen.textContent = "Todavía no hay clientes cargados.";
    return;
  }

  if (visibles === total) {
    resumen.textContent = `Mostrando los ${total} clientes registrados.`;
    return;
  }

  resumen.textContent = `Mostrando ${visibles} de ${total} clientes según los filtros aplicados.`;
}

function renderizarPacksPorVencer(clientes = null) {
  const contenedor = document.getElementById("packsPorVencer");
  if (!contenedor) return;

  const origen = clientes || obtenerClientesProcesados();
  const clientesEnRiesgo = origen
    .map(({ cli, restantes }) => ({ cliente: cli, restantes }))
    .filter(({ restantes }) => restantes > 0 && restantes <= UMBRAL_PACK_POR_VENCER)
    .sort((a, b) => a.restantes - b.restantes || String(a.cliente.nombre).localeCompare(String(b.cliente.nombre)));

  if (clientesEnRiesgo.length === 0) {
    contenedor.innerHTML = `
      <div class="alert alert-success warning-summary mb-0">
        No hay packs por vencer en este momento.
      </div>
    `;
    return;
  }

  const items = clientesEnRiesgo
    .map(({ cliente, restantes }) => `<li><strong>${escapeHtml(cliente.nombre)}</strong> (${escapeHtml(cliente.dni)}) - quedan ${restantes} clase${restantes === 1 ? "" : "s"}.</li>`)
    .join("");

  contenedor.innerHTML = `
    <div class="alert alert-warning warning-summary mb-0">
      <strong>Packs por vencer:</strong>
      <ul class="mt-2">${items}</ul>
    </div>
  `;
}

function renderizarMetricasAdmin() {
  const contenedor = document.getElementById("adminMetricas");
  if (!contenedor) return;

  const hoy = obtenerFechaHoy();
  const clientes = obtenerClientesProcesados();
  const clientesActivos = clientes.filter(({ restantes }) => restantes > 0).length;
  const clasesHoy = Object.values(clientesGlobal)
    .flat()
    .filter((reserva) => reserva.dia === hoy);
  const pendientesHoy = clasesHoy.filter((reserva) => reserva.asistida == 0).length;
  const packsPorVencer = clientes.filter(({ restantes }) => restantes > 0 && restantes <= UMBRAL_PACK_POR_VENCER).length;
  const cobrosPendientes = clientes.filter(({ renovacion }) => Boolean(renovacion)).length;

  const ocupacionPorHorario = {};
  Object.values(clientesGlobal).flat().forEach((reserva) => {
    const clave = `${reserva.dia}|${reserva.hora}`;
    ocupacionPorHorario[clave] = (ocupacionPorHorario[clave] || 0) + 1;
  });

  const horarioMasCargado = Object.entries(ocupacionPorHorario)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  const metricaHorario = horarioMasCargado
    ? (() => {
        const [dia, hora] = horarioMasCargado[0].split("|");
        return {
          valor: `${horarioMasCargado[1]}/4`,
          ayuda: `${formatearDiaSemana(dia)} a las ${hora} hs`
        };
      })()
    : {
        valor: "0",
        ayuda: "Todavia no hay reservas cargadas."
      };

  const metricas = [
    {
      label: "Clientes activos",
      value: clientesActivos,
      help: "Clientes con al menos una clase pendiente."
    },
    {
      label: "Clases de hoy",
      value: clasesHoy.length,
      help: pendientesHoy > 0 ? `${pendientesHoy} pendiente${pendientesHoy === 1 ? "" : "s"} de asistencia.` : "Todas las clases de hoy ya fueron marcadas."
    },
    {
      label: "Packs por vencer",
      value: packsPorVencer,
      help: packsPorVencer > 0 ? "Clientes con 1 o 2 clases restantes." : "No hay renovaciones urgentes."
    },
    {
      label: "Cobros por renovar",
      value: cobrosPendientes,
      help: cobrosPendientes > 0 ? "Clientes que ya terminaron el pack y pueden renovar." : "No hay cobros de renovación pendientes."
    },
    {
      label: "Horario mas cargado",
      value: metricaHorario.value,
      help: metricaHorario.ayuda
    }
  ];

  contenedor.innerHTML = metricas.map((metrica) => `
    <div class="admin-metric-card">
      <div class="admin-metric-label">${escapeHtml(metrica.label)}</div>
      <div class="admin-metric-value">${escapeHtml(metrica.value)}</div>
      <div class="admin-metric-help">${escapeHtml(metrica.help)}</div>
    </div>
  `).join("");
}

function renderizarDashboardEconomico() {
  const cards = document.getElementById("dashboardEconomicoCards");
  const deuda = document.getElementById("dashboardEconomicoDeuda");
  const pagos = document.getElementById("dashboardEconomicoPagos");
  if (!cards || !deuda || !pagos) return;

  const hoy = obtenerFechaHoy();
  const mesActual = obtenerMesClave(hoy);
  const pagosDelMes = pagosGlobal.filter((pago) => obtenerMesClave(pago.fecha) === mesActual);
  const pagosDeHoy = pagosGlobal.filter((pago) => pago.fecha === hoy);
  const deudaClientes = ciclosPagoGlobal
    .filter((ciclo) => Number(ciclo.saldo_pendiente) > 0)
    .sort((a, b) => Number(b.saldo_pendiente) - Number(a.saldo_pendiente) || String(a.nombre).localeCompare(String(b.nombre)));

  const ingresosMes = pagosDelMes.reduce((acc, pago) => acc + Number(pago.monto), 0);
  const ingresosHoy = pagosDeHoy.reduce((acc, pago) => acc + Number(pago.monto), 0);
  const deudaTotal = deudaClientes.reduce((acc, ciclo) => acc + Number(ciclo.saldo_pendiente), 0);
  const pagosCompletos = ciclosPagoGlobal.filter((ciclo) => Number(ciclo.saldo_pendiente) <= 0).length;

  const resumen = [
    {
      label: "Ingresos del mes",
      value: formatearMonto(ingresosMes),
      help: `${pagosDelMes.length} pago${pagosDelMes.length === 1 ? "" : "s"} registrados este mes.`
    },
    {
      label: "Ingresos de hoy",
      value: formatearMonto(ingresosHoy),
      help: `${pagosDeHoy.length} movimiento${pagosDeHoy.length === 1 ? "" : "s"} cargado${pagosDeHoy.length === 1 ? "" : "s"} hoy.`
    },
    {
      label: "Deuda total",
      value: formatearMonto(deudaTotal),
      help: `${deudaClientes.length} cliente${deudaClientes.length === 1 ? "" : "s"} con saldo pendiente.`
    },
    {
      label: "Packs pagos completos",
      value: String(pagosCompletos),
      help: "Ciclos de pago ya cerrados o abonados por completo."
    }
  ];

  cards.innerHTML = resumen.map((item) => `
    <div class="economic-card">
      <div class="economic-card-label">${escapeHtml(item.label)}</div>
      <div class="economic-card-value">${escapeHtml(item.value)}</div>
      <div class="economic-card-help">${escapeHtml(item.help)}</div>
    </div>
  `).join("");

  if (!deudaClientes.length) {
    deuda.innerHTML = `<div class="waitlist-empty">No hay clientes con deuda pendiente en este momento.</div>`;
  } else {
    deuda.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-striped mb-0">
          <thead class="table-dark">
            <tr>
              <th>Cliente</th>
              <th>Período</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${deudaClientes.slice(0, 8).map((ciclo) => `
              <tr>
                <td>${escapeHtml(ciclo.nombre)}</td>
                <td>${escapeHtml(formatearReferenciaCiclo(ciclo) || "-")}</td>
                <td>${escapeHtml(formatearMonto(ciclo.saldo_pendiente))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  if (!pagosGlobal.length) {
    pagos.innerHTML = `<div class="waitlist-empty">Todavía no hay pagos registrados.</div>`;
  } else {
    pagos.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-striped mb-0">
          <thead class="table-dark">
            <tr>
              <th>Cliente</th>
              <th>Fecha</th>
              <th>Monto</th>
              <th>Forma</th>
            </tr>
          </thead>
          <tbody>
            ${pagosGlobal.slice(0, 8).map((pago) => `
              <tr>
                <td>${escapeHtml(pago.nombre)}</td>
                <td>${escapeHtml(formatearFecha(pago.fecha))}</td>
                <td>${escapeHtml(formatearMonto(pago.monto))}</td>
                <td>${escapeHtml(pago.forma_pago)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }
}

function ordenarCiclosPorPrioridad(ciclos) {
  return [...ciclos].sort((a, b) => {
    if (a.estado === "pendiente" && b.estado !== "pendiente") return -1;
    if (a.estado !== "pendiente" && b.estado === "pendiente") return 1;
    return String(b.fecha_ultimo_pago).localeCompare(String(a.fecha_ultimo_pago)) || Number(b.id) - Number(a.id);
  });
}

function obtenerCicloPagoActual(dni, clienteDatos = null) {
  let ciclos = ciclosPagoGlobal.filter((ciclo) => String(ciclo.dni) === String(dni));

  if (!ciclos.length && clienteDatos) {
    const nombre = normalizarTexto(clienteDatos.nombre);
    const telefono = String(clienteDatos.telefono ?? "").trim();

    ciclos = ciclosPagoGlobal.filter((ciclo) => {
      const mismoTelefono = telefono && String(ciclo.telefono).trim() === telefono;
      const mismoNombre = nombre && normalizarTexto(ciclo.nombre) === nombre;
      return mismoTelefono || mismoNombre;
    });
  }

  ciclos = ordenarCiclosPorPrioridad(ciclos);

  return ciclos[0] || null;
}

function obtenerEstadoPagoCliente(dni, clienteDatos = null) {
  const ciclo = obtenerCicloPagoActual(dni, clienteDatos);
  if (!ciclo) {
    return {
      texto: "Sin pagos registrados",
      clase: "bg-secondary-subtle text-secondary-emphasis",
      detalle: ""
    };
  }

  const saldo = Number(ciclo.saldo_pendiente || 0);
  if (saldo > 0) {
    return {
      texto: "Pago incompleto",
      clase: "bg-danger-subtle text-danger-emphasis",
      detalle: `Debe ${formatearMonto(saldo)}`,
      referencia: formatearReferenciaCiclo(ciclo)
    };
  }

  return {
    texto: "Pago completo",
    clase: "bg-success-subtle text-success-emphasis",
    detalle: `Ultimo pago ${formatearFecha(ciclo.fecha_ultimo_pago)}`,
    referencia: formatearReferenciaCiclo(ciclo)
  };
}

function renderizarBusquedasPago() {
  const contenedor = document.getElementById("pagoBusquedaResultados");
  const input = document.getElementById("pagoBusquedaCliente");
  if (!contenedor || !input) return;

  const query = input.value.trim().toLowerCase();
  if (!query) {
    contenedor.innerHTML = "";
    return;
  }

  const coincidencias = obtenerClientesProcesados()
    .filter(({ cli, dni }) =>
      String(cli.nombre).toLowerCase().includes(query) ||
      String(cli.telefono).toLowerCase().includes(query) ||
      String(dni).toLowerCase().includes(query)
    )
    .slice(0, 6);

  if (!coincidencias.length) {
    contenedor.innerHTML = `<div class="waitlist-empty">No se encontraron clientes con esa búsqueda.</div>`;
    return;
  }

  contenedor.innerHTML = coincidencias.map(({ cli, dni }) => `
    <button type="button"
            class="payment-search-item"
            data-action="seleccionar-cliente-pago"
            data-dni="${escapeHtml(dni)}">
      <strong>${escapeHtml(cli.nombre)}</strong>
      <small>DNI ${escapeHtml(dni)} · Tel. ${escapeHtml(cli.telefono)}</small>
    </button>
  `).join("");
}

function actualizarClientePagoSeleccionado() {
  const contenedor = document.getElementById("pagoClienteSeleccionado");
  if (!contenedor) return;

  if (!clientePagoSeleccionado) {
    contenedor.className = "mt-3 waitlist-empty";
    contenedor.textContent = "Todavía no seleccionaste un cliente.";
    return;
  }

  const ciclo = obtenerCicloPagoActual(clientePagoSeleccionado.dni, clientePagoSeleccionado);
  const estado = obtenerEstadoPagoCliente(clientePagoSeleccionado.dni, clientePagoSeleccionado);

  contenedor.className = "mt-3";
  contenedor.innerHTML = `
    <strong>${escapeHtml(clientePagoSeleccionado.nombre)}</strong><br>
    DNI ${escapeHtml(clientePagoSeleccionado.dni)} · Tel. ${escapeHtml(clientePagoSeleccionado.telefono)}<br>
    <span class="badge rounded-pill ${estado.clase} mt-2">${estado.texto}</span>
    ${estado.detalle ? `<span class="renew-note">${escapeHtml(estado.detalle)}</span>` : ""}
    ${estado.referencia ? `<span class="renew-note">${escapeHtml(estado.referencia)}</span>` : ""}
    ${ciclo ? `<span class="renew-note">Total del pack: ${escapeHtml(formatearMonto(ciclo.monto_total))}</span>` : ""}
  `;
}

function seleccionarClientePago(dni) {
  const lista = clientesGlobal[String(dni)] || [];
  if (!lista.length) return;

  const cliente = lista[0];
  clientePagoSeleccionado = {
    nombre: cliente.nombre,
    telefono: cliente.telefono,
    dni: cliente.dni
  };

  document.getElementById("pagoNombre").value = cliente.nombre;
  document.getElementById("pagoTelefono").value = cliente.telefono;
  document.getElementById("pagoDni").value = cliente.dni;
  document.getElementById("pagoBusquedaCliente").value = cliente.nombre;
  document.getElementById("pagoBusquedaResultados").innerHTML = "";

  const ciclo = obtenerCicloPagoActual(cliente.dni, cliente);
  if (ciclo) {
    document.getElementById("pagoMontoTotal").value = Number(ciclo.monto_total);
    document.getElementById("pagoTipo").value = Number(ciclo.saldo_pendiente) > 0 ? "parcial" : "completo";
  } else {
    document.getElementById("pagoMontoTotal").value = "";
    document.getElementById("pagoTipo").value = "completo";
  }

  document.getElementById("pagoFecha").value = obtenerFechaHoy();
  actualizarClientePagoSeleccionado();
}

function obtenerClientesParaResumenPagos() {
  const clientesMap = new Map();

  obtenerClientesProcesados().forEach(({ cli, dni }) => {
    const key = String(dni).trim();
    clientesMap.set(key, {
      nombre: cli.nombre,
      telefono: cli.telefono,
      dni: key
    });
  });

  ciclosPagoGlobal.forEach((ciclo) => {
    const key = String(ciclo.dni || "").trim();
    if (!key) return;

    if (clientesMap.has(key)) {
      const actual = clientesMap.get(key);
      clientesMap.set(key, {
        nombre: actual.nombre || ciclo.nombre,
        telefono: actual.telefono || ciclo.telefono,
        dni: key
      });
      return;
    }

    clientesMap.set(key, {
      nombre: ciclo.nombre,
      telefono: ciclo.telefono,
      dni: key
    });
  });

  return Array.from(clientesMap.values()).sort((a, b) =>
    String(a.nombre).localeCompare(String(b.nombre), "es", { sensitivity: "base" })
  );
}

function renderizarResumenPagos() {
  const contenedor = document.getElementById("pagosResumenTabla");
  if (!contenedor) return;

  const query = document.getElementById("filtroPagos")?.value.trim().toLowerCase() || "";
  const clientes = obtenerClientesParaResumenPagos()
    .map((cliente) => ({
      ...cliente,
      ciclo: obtenerCicloPagoActual(cliente.dni, cliente)
    }))
    .filter((cliente) =>
      !query ||
      String(cliente.nombre).toLowerCase().includes(query) ||
      String(cliente.telefono).toLowerCase().includes(query) ||
      String(cliente.dni).toLowerCase().includes(query)
    );

  if (!clientes.length) {
    contenedor.innerHTML = `<div class="waitlist-empty">No hay clientes que coincidan con esa búsqueda.</div>`;
    return;
  }

  contenedor.innerHTML = `
    <div class="table-responsive">
      <table class="table table-striped table-hover">
        <thead class="table-dark">
          <tr>
            <th>Nombre</th>
            <th>DNI</th>
            <th>Teléfono</th>
            <th>Total pack</th>
            <th>Pagado</th>
            <th>Saldo</th>
            <th>Estado</th>
            <th>Período</th>
            <th>Historial</th>
          </tr>
        </thead>
        <tbody>
          ${clientes.map((cliente) => {
            const estado = obtenerEstadoPagoCliente(cliente.dni, cliente);
            const ciclo = cliente.ciclo;
            return `
              <tr>
                <td>${escapeHtml(cliente.nombre)}</td>
                <td>${escapeHtml(cliente.dni)}</td>
                <td>${escapeHtml(cliente.telefono)}</td>
                <td>${ciclo ? escapeHtml(formatearMonto(ciclo.monto_total)) : "-"}</td>
                <td>${ciclo ? escapeHtml(formatearMonto(ciclo.monto_pagado)) : "-"}</td>
                <td>${ciclo ? escapeHtml(formatearMonto(ciclo.saldo_pendiente)) : "-"}</td>
                <td>
                  <span class="badge rounded-pill ${estado.clase}">${estado.texto}</span>
                  ${estado.detalle ? `<span class="renew-note">${escapeHtml(estado.detalle)}</span>` : ""}
                </td>
                <td>${ciclo ? escapeHtml(formatearReferenciaCiclo(ciclo) || "-") : "-"}</td>
                <td>
                  <button type="button"
                          class="btn btn-sm btn-outline-primary"
                          data-action="ver-historial-pagos"
                          data-dni="${escapeHtml(cliente.dni)}">
                    Ver historial
                  </button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function cargarCiclosPago() {
  const res = await fetch("/ciclos-pago", { ...opcionesFetch, cache: "no-store" });
  if (res.status === 401 || res.status === 403) return window.location.href = "/login";
  ciclosPagoGlobal = await res.json();
  renderizarResumenPagos();
  actualizarClientePagoSeleccionado();
  renderizarDashboardEconomico();
}

async function cargarPagos() {
  const res = await fetch("/pagos", { ...opcionesFetch, cache: "no-store" });
  if (res.status === 401 || res.status === 403) return window.location.href = "/login";
  pagosGlobal = await res.json();
  renderizarDashboardEconomico();
}

async function verHistorialPagos(dni) {
  const contenedor = document.getElementById("historialPagosCliente");
  if (!contenedor) return;

  const res = await fetch(`/pagos-historial?dni=${encodeURIComponent(dni)}`, { ...opcionesFetch, cache: "no-store" });
  if (res.status === 401 || res.status === 403) return window.location.href = "/login";
  const historial = await res.json();

  if (!historial.length) {
    contenedor.innerHTML = `<div class="waitlist-empty">Ese cliente todavía no tiene pagos registrados.</div>`;
    return;
  }

  const cliente = historial[0];
  contenedor.innerHTML = `
    <h5 class="mb-3">Historial de pagos de ${escapeHtml(cliente.nombre)}</h5>
    <div class="table-responsive">
      <table class="table table-sm table-striped">
        <thead class="table-dark">
          <tr>
            <th>Período</th>
            <th>Fecha</th>
            <th>Monto</th>
            <th>Forma de pago</th>
            <th>Total pack</th>
            <th>Pagado acumulado</th>
            <th>Saldo</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${historial.map((pago) => `
            <tr>
              <td>${escapeHtml(formatearReferenciaCiclo(pago) || "-")}</td>
              <td>${formatearFecha(pago.fecha)}</td>
              <td>${escapeHtml(formatearMonto(pago.monto))}</td>
              <td>${escapeHtml(pago.forma_pago)}</td>
              <td>${escapeHtml(formatearMonto(pago.monto_total))}</td>
              <td>${escapeHtml(formatearMonto(pago.monto_pagado))}</td>
              <td>${escapeHtml(formatearMonto(pago.saldo_pendiente))}</td>
              <td>
                <div class="d-flex flex-wrap gap-2">
                  <button type="button"
                          class="btn btn-sm btn-outline-primary"
                          data-action="editar-pago"
                          data-id="${escapeHtml(pago.id)}"
                          data-dni="${escapeHtml(pago.dni)}"
                          data-monto="${escapeHtml(pago.monto)}"
                          data-fecha="${escapeHtml(pago.fecha)}"
                          data-forma="${escapeHtml(pago.forma_pago)}">
                    Editar
                  </button>
                  <button type="button"
                          class="btn btn-sm btn-outline-danger"
                          data-action="eliminar-pago"
                          data-id="${escapeHtml(pago.id)}"
                          data-dni="${escapeHtml(pago.dni)}">
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function abrirModalEditarPago(id, dni, montoActual, fechaActual, formaActual) {
  document.getElementById("editarPagoId").value = id;
  document.getElementById("editarPagoDni").value = dni;
  document.getElementById("editarPagoMonto").value = montoActual;
  document.getElementById("editarPagoFecha").value = fechaActual;
  document.getElementById("editarPagoForma").value = formaActual;

  editarPagoModalInstance?.show();
}

async function editarPagoDesdeModal(event) {
  event.preventDefault();

  const id = document.getElementById("editarPagoId").value;
  const dni = document.getElementById("editarPagoDni").value;
  const monto = document.getElementById("editarPagoMonto").value.trim();
  const fecha = document.getElementById("editarPagoFecha").value.trim();
  const formaPago = document.getElementById("editarPagoForma").value.trim();

  const res = await fetch("/editar-pago", {
    method: "POST",
    ...opcionesFetch,
    body: JSON.stringify({
      id,
      monto: monto.trim(),
      fecha: fecha.trim(),
      formaPago: formaPago.trim()
    })
  });

  const text = await res.text();
  alert(text);
  if (!res.ok) return;

  editarPagoModalInstance?.hide();
  await cargarCiclosPago();
  await cargarPagos();
  await verHistorialPagos(dni);
}

function abrirModalEliminarPago(id, dni) {
  document.getElementById("eliminarPagoId").value = id;
  document.getElementById("eliminarPagoDni").value = dni;
  eliminarPagoModalInstance?.show();
}

async function eliminarPagoDesdeModal() {
  const id = document.getElementById("eliminarPagoId").value;
  const dni = document.getElementById("eliminarPagoDni").value;

  const res = await fetch("/eliminar-pago", {
    method: "POST",
    ...opcionesFetch,
    body: JSON.stringify({ id })
  });

  const text = await res.text();
  alert(text);
  if (!res.ok) return;

  eliminarPagoModalInstance?.hide();
  await cargarCiclosPago();
  await cargarPagos();
  await verHistorialPagos(dni);
}

async function registrarPago(event) {
  event.preventDefault();

  if (!clientePagoSeleccionado) {
    alert("Primero seleccioná un cliente");
    return;
  }

  const payload = {
    nombre: document.getElementById("pagoNombre").value.trim(),
    telefono: document.getElementById("pagoTelefono").value.trim(),
    dni: document.getElementById("pagoDni").value.trim(),
    monto: document.getElementById("pagoMonto").value,
    montoTotal: document.getElementById("pagoMontoTotal").value,
    fecha: document.getElementById("pagoFecha").value,
    formaPago: document.getElementById("pagoFormaPago").value,
    tipoPago: document.getElementById("pagoTipo").value
  };

  const res = await fetch("/registrar-pago", {
    method: "POST",
    ...opcionesFetch,
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  alert(text);
  if (!res.ok) return;

  document.getElementById("formPago").reset();
  document.getElementById("pagoFecha").value = obtenerFechaHoy();
  if (clientePagoSeleccionado) {
    document.getElementById("pagoNombre").value = clientePagoSeleccionado.nombre;
    document.getElementById("pagoTelefono").value = clientePagoSeleccionado.telefono;
  document.getElementById("pagoDni").value = clientePagoSeleccionado.dni;
  }

  await cargarCiclosPago();
  await cargarPagos();
  await verHistorialPagos(payload.dni);
}

async function cargarListaEspera() {
  const res = await fetch("/lista-espera", { ...opcionesFetch, cache: "no-store" });
  if (res.status === 401 || res.status === 403) return window.location.href = "/login";
  listaEsperaGlobal = await res.json();
  renderizarListaEspera();
}

function renderizarListaEspera() {
  const contenedor = document.getElementById("listaEsperaTabla");
  if (!contenedor) return;

  if (!listaEsperaGlobal.length) {
    contenedor.innerHTML = `<p class="waitlist-empty mb-0">Todavia no hay clientes en lista de espera.</p>`;
    return;
  }

  contenedor.innerHTML = `
    <div class="table-responsive">
      <table class="table table-striped table-hover">
        <thead class="table-dark">
          <tr>
            <th>Nombre</th>
            <th>DNI</th>
            <th>Teléfono</th>
            <th>Día</th>
            <th>Hora</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${listaEsperaGlobal.map((registro) => `
            <tr>
              <td>${escapeHtml(registro.nombre)}</td>
              <td>${escapeHtml(registro.dni)}</td>
              <td>${escapeHtml(registro.telefono)}</td>
              <td>${formatearFecha(registro.dia)}</td>
              <td>${escapeHtml(registro.hora)}</td>
              <td>
                <button type="button"
                        class="btn btn-sm btn-outline-danger"
                        data-action="eliminar-espera"
                        data-id="${escapeHtml(registro.id)}"
                        data-nombre="${escapeHtml(registro.nombre)}">
                  Quitar
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function cargarReservas() {
  const r = await fetch("/reservas", { ...opcionesFetch, cache: "no-store" });
  if (r.status === 401 || r.status === 403) return window.location = "/login";
  const datos = await r.json();

  clientesGlobal = {};
  datos.forEach((reserva) => {
    const key = String(reserva.dni).trim();
    if (!clientesGlobal[key]) clientesGlobal[key] = [];
    clientesGlobal[key].push(reserva);
  });

  await cargarCiclosPago();
  await cargarPagos();
  renderizarMetricasAdmin();
  pintarClientes();
  await cargarCalendario();
  await cargarListaEspera();
}

function pintarClientes() {
  const tabla = document.getElementById("tabla");
  if (!tabla) return;
  tabla.innerHTML = "";

  const clientesProcesados = obtenerClientesProcesados();
  const totalClientes = clientesProcesados.length;
  clientesFiltrados = filtrarClientes(clientesProcesados);

  if (totalClientes === 0) {
    tabla.innerHTML = "<tr><td colspan='10'>No hay clientes</td></tr>";
    renderizarPacksPorVencer([]);
    renderizarResumenFiltros(0, 0);
    return;
  }

  if (clientesFiltrados.length === 0) {
    tabla.innerHTML = "<tr><td colspan='10'>No hay clientes que coincidan con esos filtros</td></tr>";
    renderizarPacksPorVencer(clientesFiltrados);
    renderizarResumenFiltros(totalClientes, 0);
    return;
  }

  clientesFiltrados.forEach(({ dni, lista, cli, restantes, recordatorio, renovacion }) => {
    const pago = obtenerEstadoPagoCliente(dni, cli);
    tabla.innerHTML += `
      <tr>
        <td>${escapeHtml(cli.nombre)}</td>
        <td>${escapeHtml(cli.dni)}</td>
        <td>${escapeHtml(cli.telefono)}</td>
        <td>${escapeHtml(cli.pack)}</td>
        <td>${lista.length}</td>
        <td>${restantes}</td>
        <td>
          <span class="badge rounded-pill ${recordatorio.clase}">${recordatorio.texto}</span>
          ${renovacion ? `<span class="renew-note">${escapeHtml(renovacion.texto)}</span>` : ""}
        </td>
        <td>
          <span class="badge rounded-pill ${pago.clase}">${pago.texto}</span>
          ${pago.detalle ? `<span class="renew-note">${escapeHtml(pago.detalle)}</span>` : ""}
        </td>
        <td>
          <button type="button"
                  class="btn btn-sm btn-primary"
                  data-action="mostrar-clases"
                  data-dni="${escapeHtml(dni)}">
            Ver clases
          </button>
        </td>
        <td>
          <div class="d-flex flex-wrap gap-2 justify-content-center">
            <button type="button"
                    class="btn btn-sm btn-outline-primary"
                    data-action="editar-cliente"
                    data-dni="${escapeHtml(dni)}"
                    data-nombre="${escapeHtml(cli.nombre)}"
                    data-telefono="${escapeHtml(cli.telefono)}">
              Editar
            </button>
            <button type="button"
                    class="btn btn-sm btn-outline-success"
                    data-action="renovar-cliente"
                    data-dni="${escapeHtml(dni)}">
              Renovar
            </button>
            <button type="button"
                    class="btn btn-sm btn-danger"
                    data-action="eliminar-cliente"
                    data-dni="${escapeHtml(dni)}"
                    data-nombre="${escapeHtml(cli.nombre)}">
              Eliminar
            </button>
          </div>
        </td>
      </tr>`;
  });

  renderizarPacksPorVencer(clientesFiltrados);
  renderizarResumenFiltros(totalClientes, clientesFiltrados.length);
}

function obtenerLunes() {
  const hoy = new Date();
  const target = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + (semanaOffset * 7));
  const diaSemana = (target.getDay() + 6) % 7;
  const lunes = new Date(target);
  lunes.setDate(target.getDate() - diaSemana);
  lunes.setHours(0, 0, 0, 0);
  return lunes;
}

async function cargarCalendario() {
  const res = await fetch("/reservas", { ...opcionesFetch, cache: "no-store" });
  if (res.status === 401 || res.status === 403) return window.location.href = "/login";
  const datos = await res.json();

  const lunes = obtenerLunes();
  const dias = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    dias.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }

  document.getElementById("tituloSemana").innerText =
    `Semana del ${formatearFecha(dias[0])} al ${formatearFecha(dias[4])}`;

  const tabla = document.getElementById("tablaCalendario");
  tabla.innerHTML = `
    <tr>
      <th>Hora</th><th>Lunes</th><th>Martes</th><th>Miércoles</th><th>Jueves</th><th>Viernes</th>
    </tr>`;

  horarios.forEach((hora) => {
    let fila = `<tr><td><b>${hora}</b></td>`;
    dias.forEach((dia) => {
      const personas = datos.filter((reserva) => reserva.dia === dia && reserva.hora === hora).slice(0, 4);
      let contenido = "";
      personas.forEach((persona) => {
        const color = persona.asistida == 1 ? "bg-success" : "bg-warning";
        contenido += `<div class="${color} text-white rounded p-1 mb-1 small">${escapeHtml(persona.nombre)}</div>`;
      });
      fila += `<td>${contenido}</td>`;
    });
    fila += "</tr>";
    tabla.innerHTML += fila;
  });
}

async function confirmarAsistencia() {
  const dni = document.getElementById("dniInput").value.trim();
  if (!dni) return alert("Ingresá DNI");
  if (!horaAsistenciaHoy) return alert("No hay clase pendiente para hoy");

  const res = await fetch("/asistencia", {
    method: "POST",
    ...opcionesFetch,
    body: JSON.stringify({ dni, hora: horaAsistenciaHoy })
  });
  const text = await res.text();
  alert(text);
  if (res.ok) await cargarReservas();
}

function cambiarSemana(valor) {
  valor = Number(valor) || 0;
  if (valor === 0) return;
  semanaOffset += valor;
  cargarCalendario();
}

function irSemanaActual() {
  semanaOffset = 0;
  cargarCalendario();
}

function limpiarFiltrosClientes() {
  const filtroBusqueda = document.getElementById("filtroBusqueda");
  const filtroPack = document.getElementById("filtroPack");
  const filtroEstado = document.getElementById("filtroEstadoPack");

  if (filtroBusqueda) filtroBusqueda.value = "";
  if (filtroPack) filtroPack.value = "";
  if (filtroEstado) filtroEstado.value = "";

  pintarClientes();
}

function ordenarClasesPorFecha(lista) {
  return [...lista].sort((a, b) => `${a.dia}|${a.hora}`.localeCompare(`${b.dia}|${b.hora}`));
}

function crearItemsHistorial(lista, { permitirReprogramar = false, vacio = "Sin clases para mostrar." } = {}) {
  if (!lista.length) {
    return `<p class="mb-0 text-body-secondary">${vacio}</p>`;
  }

  return `
    <div class="history-list">
      ${lista.map((reserva) => `
        <div class="history-item">
          <div class="history-item-header">
            <div>
              <strong>${formatearFecha(reserva.dia)}</strong>
              <div class="history-item-meta">Horario ${escapeHtml(reserva.hora)}</div>
            </div>
            <div class="d-flex align-items-start gap-2 flex-wrap">
              <span class="badge rounded-pill ${reserva.asistida == 1 ? "bg-success-subtle text-success-emphasis" : "bg-warning-subtle text-warning-emphasis"}">
                ${reserva.asistida == 1 ? "Asistio" : "Pendiente"}
              </span>
              ${permitirReprogramar ? `
                <button type="button"
                        class="btn btn-sm btn-outline-secondary"
                        data-action="reprogramar-clase"
                        data-id="${escapeHtml(reserva.id)}">
                  Reprogramar
                </button>
              ` : ""}
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function mostrarClases(dni) {
  const lista = clientesGlobal[String(dni)] || [];
  if (!lista.length) return alert("No hay clases para ese cliente");

  const panel = document.getElementById("panelClasesBuscado");
  if (!panel) return;

  const clasesOrdenadas = ordenarClasesPorFecha(lista);
  const cliente = clasesOrdenadas[0];
  const pendientes = clasesOrdenadas.filter((reserva) => reserva.asistida == 0);
  const asistidas = clasesOrdenadas.filter((reserva) => reserva.asistida == 1);
  const hoy = obtenerFechaHoy();
  const proximaClase = pendientes.find((reserva) => `${reserva.dia}|${reserva.hora}` >= `${hoy}|00:00`) || pendientes[0] || null;
  const estadoPack = obtenerEstadoPack(pendientes.length);
  const renovacion = obtenerEstadoRenovacion(clasesOrdenadas);

  panel.innerHTML = `
    <div class="client-history-card">
      <div class="d-flex flex-column flex-lg-row justify-content-between gap-3 mb-3">
        <div>
          <h5 class="mb-1">Historial de ${escapeHtml(cliente.nombre)}</h5>
          <div class="text-body-secondary">DNI ${escapeHtml(cliente.dni)} · Tel. ${escapeHtml(cliente.telefono)}</div>
        </div>
        <span class="badge rounded-pill ${estadoPack.clase} align-self-start">
          ${estadoPack.texto}
        </span>
      </div>
      ${renovacion ? `<div class="alert alert-warning py-2 mb-3">${escapeHtml(renovacion.texto)}. La renovación debería quedar confirmada antes de la próxima clase sugerida.</div>` : ""}

      <div class="history-metrics mb-3">
        <div class="history-metric">
          <div class="history-metric-label">Pack</div>
          <div class="history-metric-value">${escapeHtml(cliente.pack)}</div>
        </div>
        <div class="history-metric">
          <div class="history-metric-label">Total reservadas</div>
          <div class="history-metric-value">${clasesOrdenadas.length}</div>
        </div>
        <div class="history-metric">
          <div class="history-metric-label">Pendientes</div>
          <div class="history-metric-value">${pendientes.length}</div>
        </div>
        <div class="history-metric">
          <div class="history-metric-label">Asistidas</div>
          <div class="history-metric-value">${asistidas.length}</div>
        </div>
      </div>

      <div class="row g-3">
        <div class="col-12 col-xl-4">
          <div class="history-block h-100">
            <h6 class="mb-3">Proxima clase</h6>
            ${proximaClase ? `
              <div class="history-item">
                <div class="history-item-header">
                  <div>
                    <strong>${formatearFecha(proximaClase.dia)}</strong>
                    <div class="history-item-meta">Horario ${escapeHtml(proximaClase.hora)}</div>
                  </div>
                  <span class="badge rounded-pill bg-primary-subtle text-primary-emphasis">Agendada</span>
                </div>
              </div>
            ` : `<p class="mb-0 text-body-secondary">No tiene clases pendientes.</p>`}
          </div>
        </div>

        <div class="col-12 col-xl-4">
          <div class="history-block h-100">
            <h6 class="mb-3">Clases pendientes</h6>
            ${crearItemsHistorial(pendientes, { permitirReprogramar: true, vacio: "No hay clases pendientes." })}
          </div>
        </div>

        <div class="col-12 col-xl-4">
          <div class="history-block h-100">
            <h6 class="mb-3">Clases asistidas</h6>
            ${crearItemsHistorial(asistidas, { vacio: "Todavia no registra asistencias." })}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function buscarCliente() {
  const dni = document.getElementById("dniInput").value.trim();
  if (!dni) return;

  const lista = clientesGlobal[dni] || [];
  if (!lista.length) {
    horaAsistenciaHoy = "";
    document.getElementById("infoCliente").innerText = "Cliente no encontrado";
    document.getElementById("btnAsistencia").style.display = "none";
    document.getElementById("clienteBuscadoTabla").innerHTML = "";
    document.getElementById("panelClasesBuscado").innerHTML = "";
    return;
  }

  const cliente = lista[0];
  const restantes = lista.filter((item) => item.asistida == 0).length;
  const asistidas = lista.filter((item) => item.asistida == 1).length;
  const estadoPack = obtenerEstadoPack(restantes);
  const estadoPago = obtenerEstadoPagoCliente(cliente.dni, cliente);
  const hoyPendiente = lista
    .filter((item) => item.dia === obtenerFechaHoy() && item.asistida == 0)
    .sort((a, b) => a.hora.localeCompare(b.hora))[0];

  horaAsistenciaHoy = hoyPendiente ? hoyPendiente.hora : "";

  document.getElementById("infoCliente").innerHTML =
    `<strong>Nombre:</strong> ${escapeHtml(cliente.nombre)} | <strong>Restantes:</strong> ${restantes} | <strong>Asistidas:</strong> ${asistidas} | <strong>Estado:</strong> ${escapeHtml(estadoPack.texto)} | <strong>Pago:</strong> ${escapeHtml(estadoPago.texto)}` +
    (horaAsistenciaHoy ? ` | <strong>Clase hoy:</strong> ${escapeHtml(horaAsistenciaHoy)}` : "");

  document.getElementById("btnAsistencia").style.display = horaAsistenciaHoy ? "block" : "none";

  document.getElementById("clienteBuscadoTabla").innerHTML = `
    <div class="table-responsive mt-3">
      <table class="table table-bordered">
        <thead class="table-dark">
          <tr>
            <th>Nombre</th><th>DNI</th><th>Teléfono</th><th>Pack</th><th>Restantes</th><th>Asistidas</th><th>Estado</th><th>Pago</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(cliente.nombre)}</td>
            <td>${escapeHtml(cliente.dni)}</td>
            <td>${escapeHtml(cliente.telefono)}</td>
            <td>${escapeHtml(cliente.pack)}</td>
            <td>${restantes}</td>
            <td>${asistidas}</td>
            <td>
              <span class="badge rounded-pill ${estadoPack.clase}">${estadoPack.texto}</span>
              ${obtenerEstadoRenovacion(lista) ? `<span class="renew-note">${escapeHtml(obtenerEstadoRenovacion(lista).texto)}</span>` : ""}
            </td>
            <td>
              <span class="badge rounded-pill ${estadoPago.clase}">${estadoPago.texto}</span>
              ${estadoPago.detalle ? `<span class="renew-note">${escapeHtml(estadoPago.detalle)}</span>` : ""}
            </td>
            <td>
              <div class="d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-sm btn-primary"
                        data-action="mostrar-clases"
                        data-dni="${escapeHtml(cliente.dni)}">
                  Ver clases
                </button>
                <button type="button" class="btn btn-sm btn-outline-success"
                        data-action="renovar-cliente"
                        data-dni="${escapeHtml(cliente.dni)}">
                  Renovar
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>`;

  mostrarClases(cliente.dni);
}

function renovarCliente(dni) {
  const lista = clientesGlobal[String(dni)] || [];
  if (!lista.length) {
    alert("Cliente no encontrado");
    return;
  }

  const pendientes = lista.filter((reserva) => String(reserva.asistida) === "0").length;
  if (pendientes > 0) {
    alert("Primero tiene que terminar el pack actual para poder renovarlo.");
    return;
  }

  const cliente = lista[0];
  const packActual = String(cliente.pack);
  const nuevoPack = prompt("Elegí el nuevo pack (4, 8, 12 o 16):", packActual);
  if (nuevoPack === null) return;

  if (!["4", "8", "12", "16"].includes(nuevoPack.trim())) {
    alert("Pack inválido");
    return;
  }

  const params = new URLSearchParams({
    nombre: cliente.nombre,
    telefono: cliente.telefono,
    dni: cliente.dni,
    pack: nuevoPack.trim(),
    modo: "renovacion"
  });

  if (nuevoPack.trim() === packActual) {
    const sugerencia = obtenerSugerenciaRenovacion(lista, Number(nuevoPack.trim()));
    if (sugerencia?.clases?.length) {
      params.set("clases", JSON.stringify(sugerencia.clases));
    }
  }

  window.location.href = `/reservar.html?${params.toString()}`;
}

async function reprogramarClase(id) {
  const nuevaFecha = prompt("Nueva fecha (AAAA-MM-DD):");
  if (!nuevaFecha) return;

  const nuevaHora = prompt("Nueva hora (HH:MM):");
  if (!nuevaHora) return;

  const res = await fetch("/reprogramar", {
    method: "POST",
    ...opcionesFetch,
    body: JSON.stringify({ id, dia: nuevaFecha, hora: nuevaHora })
  });

  const msg = await res.text();
  alert(msg);
  if (res.ok) {
    await cargarReservas();
    const dni = document.getElementById("dniInput").value.trim();
    if (dni) {
      await buscarCliente();
      mostrarClases(dni);
    }
  }
}

async function agregarListaEspera(event) {
  event.preventDefault();

  const payload = {
    nombre: document.getElementById("esperaNombre")?.value.trim(),
    telefono: document.getElementById("esperaTelefono")?.value.trim(),
    dni: document.getElementById("esperaDni")?.value.trim(),
    dia: document.getElementById("esperaDia")?.value,
    hora: document.getElementById("esperaHora")?.value
  };

  const res = await fetch("/lista-espera", {
    method: "POST",
    ...opcionesFetch,
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  alert(text);

  if (!res.ok) return;

  document.getElementById("formListaEspera")?.reset();
  await cargarListaEspera();
}

async function eliminarListaEspera(id, nombre) {
  if (!confirm(`¿Querés quitar a ${nombre} de la lista de espera?`)) {
    return;
  }

  const res = await fetch("/eliminar-lista-espera", {
    method: "POST",
    ...opcionesFetch,
    body: JSON.stringify({ id })
  });

  const text = await res.text();
  alert(text);

  if (!res.ok) return;
  await cargarListaEspera();
}

async function eliminarCliente(dni, nombre) {
  if (!confirm(`¿Seguro que querés eliminar a ${nombre} y todos sus registros?`)) {
    return;
  }

  const res = await fetch("/eliminar-cliente", {
    method: "POST",
    ...opcionesFetch,
    body: JSON.stringify({ dni })
  });

  if (res.ok) {
    alert("Cliente eliminado correctamente");
    horaAsistenciaHoy = "";
    document.getElementById("infoCliente").innerHTML = "";
    document.getElementById("clienteBuscadoTabla").innerHTML = "";
    document.getElementById("panelClasesBuscado").innerHTML = "";
    document.getElementById("btnAsistencia").style.display = "none";
    await cargarReservas();
  } else {
    alert("Error al eliminar cliente");
  }
}

async function editarCliente(dniActual, nombreActual, telefonoActual) {
  const nombre = prompt("Nombre del cliente:", nombreActual);
  if (nombre === null) return;

  const nuevoDni = prompt("DNI del cliente:", dniActual);
  if (nuevoDni === null) return;

  const telefono = prompt("Teléfono del cliente:", telefonoActual);
  if (telefono === null) return;

  const nombreLimpio = nombre.trim();
  const dniLimpio = nuevoDni.trim();
  const telefonoLimpio = telefono.trim();

  if (!nombreLimpio || !dniLimpio || !telefonoLimpio) {
    return alert("Todos los datos son obligatorios");
  }

  const res = await fetch("/editar-cliente", {
    method: "POST",
    ...opcionesFetch,
    body: JSON.stringify({
      dniActual,
      nombre: nombreLimpio,
      telefono: telefonoLimpio,
      nuevoDni: dniLimpio
    })
  });

  const text = await res.text();
  alert(text);

  if (!res.ok) return;

  const dniBuscado = document.getElementById("dniInput").value.trim();
  if (dniBuscado === dniActual || dniBuscado === dniLimpio) {
    document.getElementById("dniInput").value = dniLimpio;
  }

  await cargarReservas();

  if (document.getElementById("dniInput").value.trim()) {
    await buscarCliente();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  inicializarTema();
  const pagoFechaInput = document.getElementById("pagoFecha");
  if (pagoFechaInput) {
    pagoFechaInput.value = obtenerFechaHoy();
  }
  const editarPagoModalElement = document.getElementById("editarPagoModal");
  const eliminarPagoModalElement = document.getElementById("eliminarPagoModal");
  if (editarPagoModalElement && window.bootstrap) {
    editarPagoModalInstance = new bootstrap.Modal(editarPagoModalElement);
  }
  if (eliminarPagoModalElement && window.bootstrap) {
    eliminarPagoModalInstance = new bootstrap.Modal(eliminarPagoModalElement);
  }
  cargarReservas();

  document.getElementById("filtroBusqueda")?.addEventListener("input", pintarClientes);
  document.getElementById("filtroPack")?.addEventListener("change", pintarClientes);
  document.getElementById("filtroEstadoPack")?.addEventListener("change", pintarClientes);
  document.getElementById("filtroPagos")?.addEventListener("input", renderizarResumenPagos);
  document.getElementById("limpiarFiltrosBtn")?.addEventListener("click", limpiarFiltrosClientes);
  document.getElementById("formListaEspera")?.addEventListener("submit", agregarListaEspera);
  document.getElementById("formPago")?.addEventListener("submit", registrarPago);
  document.getElementById("editarPagoForm")?.addEventListener("submit", editarPagoDesdeModal);
  document.getElementById("confirmarEliminarPagoBtn")?.addEventListener("click", eliminarPagoDesdeModal);
  document.getElementById("pagoBusquedaCliente")?.addEventListener("input", renderizarBusquedasPago);
  document.getElementById("dniInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      buscarCliente();
    }
  });
});

document.getElementById("btnSemanaAnt").addEventListener("click", () => cambiarSemana(-1));
document.getElementById("btnSemanaAct").addEventListener("click", irSemanaActual);
document.getElementById("btnSemanaSig").addEventListener("click", () => cambiarSemana(1));
document.getElementById("buscarClienteBtn").addEventListener("click", buscarCliente);
document.getElementById("btnAsistencia").addEventListener("click", confirmarAsistencia);
document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;

  if (action === "mostrar-clases") {
    mostrarClases(button.dataset.dni);
    return;
  }

  if (action === "eliminar-cliente") {
    eliminarCliente(button.dataset.dni, button.dataset.nombre);
    return;
  }

  if (action === "editar-cliente") {
    editarCliente(button.dataset.dni, button.dataset.nombre, button.dataset.telefono);
    return;
  }

  if (action === "seleccionar-cliente-pago") {
    seleccionarClientePago(button.dataset.dni);
    return;
  }

  if (action === "ver-historial-pagos") {
    verHistorialPagos(button.dataset.dni);
    return;
  }

  if (action === "editar-pago") {
    abrirModalEditarPago(
      button.dataset.id,
      button.dataset.dni,
      button.dataset.monto,
      button.dataset.fecha,
      button.dataset.forma
    );
    return;
  }

  if (action === "eliminar-pago") {
    abrirModalEliminarPago(button.dataset.id, button.dataset.dni);
    return;
  }

  if (action === "renovar-cliente") {
    renovarCliente(button.dataset.dni);
    return;
  }

  if (action === "eliminar-espera") {
    eliminarListaEspera(button.dataset.id, button.dataset.nombre);
    return;
  }

  if (action === "reprogramar-clase") {
    reprogramarClase(button.dataset.id);
  }
});
