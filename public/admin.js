let clientesGlobal = {};
let semanaOffset = 0;
let horaAsistenciaHoy = "";

const horarios = ["08:00", "09:00", "10:00", "11:00", "16:00", "17:00", "18:00", "19:00"];
const opcionesFetch = { credentials: "include", headers: { "Content-Type": "application/json" } };
const THEME_KEY = "pilates-theme";

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

function obtenerFechaHoy() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
}

function formatearFecha(fechaTexto) {
  const [year, month, day] = String(fechaTexto).split("-");
  if (!year || !month || !day) return fechaTexto;
  return `${day}/${month}/${year}`;
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

  pintarClientes();
  await cargarCalendario();
}

function pintarClientes() {
  const tabla = document.getElementById("tabla");
  if (!tabla) return;
  tabla.innerHTML = "";

  const keys = Object.keys(clientesGlobal).sort();
  if (keys.length === 0) {
    tabla.innerHTML = "<tr><td colspan='8'>No hay clientes</td></tr>";
    return;
  }

  keys.forEach((dni) => {
    const lista = clientesGlobal[dni];
    const cli = lista[0];
    const restantes = lista.filter((reserva) => String(reserva.asistida) === "0").length;
    tabla.innerHTML += `
      <tr>
        <td>${escapeHtml(cli.nombre)}</td>
        <td>${escapeHtml(cli.dni)}</td>
        <td>${escapeHtml(cli.telefono)}</td>
        <td>${escapeHtml(cli.pack)}</td>
        <td>${lista.length}</td>
        <td>${restantes}</td>
        <td>
          <button type="button"
                  class="btn btn-sm btn-primary"
                  data-action="mostrar-clases"
                  data-dni="${escapeHtml(dni)}">
            Ver clases
          </button>
        </td>
        <td>
          <button type="button"
                  class="btn btn-sm btn-danger"
                  data-action="eliminar-cliente"
                  data-dni="${escapeHtml(dni)}"
                  data-nombre="${escapeHtml(cli.nombre)}">
            Eliminar
          </button>
        </td>
      </tr>`;
  });
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

function mostrarClases(dni) {
  const lista = clientesGlobal[String(dni)] || [];
  if (!lista.length) return alert("No hay clases para ese cliente");

  const panel = document.getElementById("panelClasesBuscado");
  if (!panel) return;

  let html = `
    <h5>Clases de ${escapeHtml(dni)}</h5>
    <div class="table-responsive">
      <table class="table table-sm table-bordered">
        <thead class="table-dark">
          <tr>
            <th>#</th><th>Día</th><th>Hora</th><th>Estado</th><th>Acción</th>
          </tr>
        </thead>
        <tbody>
  `;

  lista.forEach((reserva, idx) => {
    const asistencia = reserva.asistida == 1 ? "Asistió" : "Pendiente";
    const rowClass = reserva.asistida == 1 ? "table-success" : "table-warning text-dark";

    html += `
      <tr class="${rowClass}">
        <td>${idx + 1}</td>
        <td>${escapeHtml(reserva.dia)}</td>
        <td>${escapeHtml(reserva.hora)}</td>
        <td>${asistencia}</td>
        <td>
          <button type="button"
                  class="btn btn-sm btn-outline-secondary"
                  data-action="reprogramar-clase"
                  data-id="${escapeHtml(reserva.id)}">
            Reprogramar
          </button>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  panel.innerHTML = html;
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
  const hoyPendiente = lista
    .filter((item) => item.dia === obtenerFechaHoy() && item.asistida == 0)
    .sort((a, b) => a.hora.localeCompare(b.hora))[0];

  horaAsistenciaHoy = hoyPendiente ? hoyPendiente.hora : "";

  document.getElementById("infoCliente").innerHTML =
    `<strong>Nombre:</strong> ${escapeHtml(cliente.nombre)} | <strong>Restantes:</strong> ${restantes}` +
    (horaAsistenciaHoy ? ` | <strong>Clase hoy:</strong> ${escapeHtml(horaAsistenciaHoy)}` : "");

  document.getElementById("btnAsistencia").style.display = horaAsistenciaHoy ? "block" : "none";

  document.getElementById("clienteBuscadoTabla").innerHTML = `
    <div class="table-responsive mt-3">
      <table class="table table-bordered">
        <thead class="table-dark">
          <tr>
            <th>Nombre</th><th>DNI</th><th>Teléfono</th><th>Pack</th><th>Restantes</th><th>Ver clases</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(cliente.nombre)}</td>
            <td>${escapeHtml(cliente.dni)}</td>
            <td>${escapeHtml(cliente.telefono)}</td>
            <td>${escapeHtml(cliente.pack)}</td>
            <td>${restantes}</td>
            <td>
              <button type="button" class="btn btn-sm btn-primary"
                      data-action="mostrar-clases"
                      data-dni="${escapeHtml(cliente.dni)}">
                Ver clases
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>`;

  mostrarClases(cliente.dni);
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

document.addEventListener("DOMContentLoaded", () => {
  inicializarTema();
  cargarReservas();
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

  if (action === "reprogramar-clase") {
    reprogramarClase(button.dataset.id);
  }
});
