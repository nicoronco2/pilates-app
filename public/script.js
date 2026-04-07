/* =========================================================
   GENERAR CLASES
========================================================= */

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

    themeToggleBtn.addEventListener("click", function () {
        const currentTheme = document.documentElement.getAttribute("data-bs-theme") === "dark" ? "dark" : "light";
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        localStorage.setItem(THEME_KEY, nextTheme);
        aplicarTema(nextTheme);
    });
}

function generarClases() {

    const packValue = document.getElementById("pack").value;

    // 🔥 FIX: si no hay pack seleccionado, no hace nada
    if (!packValue) return;

    const pack = parseInt(packValue);
    const container = document.getElementById("clasesContainer");

    container.innerHTML = "";

    for (let i = 1; i <= pack; i++) {

        container.innerHTML += `
        <div class="clase mb-4 p-3 border rounded bg-white shadow-sm">

            <h5 class="mb-3">Clase ${i}</h5>

            <label class="form-label">Fecha</label>
            <input type="date" class="fecha form-control mb-2" required>

            <label class="form-label">Horario</label>
            <select class="hora form-select" required>
                <option value="">Elegir horario</option>
            </select>

        </div>
        `;
    }

    bloquearFechas();

    /* VALIDAR FECHAS */
    document.querySelectorAll(".fecha").forEach(input => {

        input.addEventListener("change", function () {

            if (!this.value) return;

            /* NO repetir día */
            if (fechaRepetida(this.value)) {
                alert("No podés reservar dos clases el mismo día");
                this.value = "";
                return;
            }

            /* VALIDAR FIN DE SEMANA */
            const fecha = new Date(this.value + "T00:00:00");
            const dia = fecha.getDay();

            if (dia === 0 || dia === 6) {
                alert("Los sábados y domingos no hay clases");
                this.value = "";
                return;
            }

            /* CARGAR HORARIOS */
            cambiarHorarios(this);
        });
    });
}

/* =========================================================
   BLOQUEAR FECHAS (hoy hasta +30 días)
========================================================= */

function bloquearFechas() {

    const hoy = new Date();

    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, "0");
    const dd = String(hoy.getDate()).padStart(2, "0");

    const minFecha = `${yyyy}-${mm}-${dd}`;

    const max = new Date();
    max.setDate(max.getDate() + 30);

    const yyyyMax = max.getFullYear();
    const mmMax = String(max.getMonth() + 1).padStart(2, "0");
    const ddMax = String(max.getDate()).padStart(2, "0");

    const maxFecha = `${yyyyMax}-${mmMax}-${ddMax}`;

    document.querySelectorAll(".fecha").forEach(f => {
        f.min = minFecha;
        f.max = maxFecha;
    });
}

/* =========================================================
   EVITAR FECHAS REPETIDAS
========================================================= */

function fechaRepetida(fechaSeleccionada) {

    if (!fechaSeleccionada) return false;

    const fechas = document.querySelectorAll(".fecha");

    let contador = 0;

    fechas.forEach(f => {
        if (f.value === fechaSeleccionada) contador++;
    });

    return contador > 1;
}

/* =========================================================
   CARGAR HORARIOS DISPONIBLES
========================================================= */

async function cambiarHorarios(inputFecha) {

    if (!inputFecha.value) return;

    const clase = inputFecha.closest(".clase");
    const selectHora = clase.querySelector(".hora");

    selectHora.innerHTML = "<option value=''>Cargando...</option>";

    const horarios = [
        "08:00","09:00","10:00","11:00",
        "16:00","17:00","18:00","19:00"
    ];

    try {

        const res = await fetch("/horarios-disponibles?fecha=" + inputFecha.value);
        if (!res.ok) {
            throw new Error(`Error ${res.status}`);
        }
        const ocupados = await res.json();

        selectHora.innerHTML = "<option value=''>Elegir horario</option>";

        horarios.forEach(h => {

            const ocupado = ocupados.find(o => o.hora === h && o.total >= 4);

            if (!ocupado) {
                selectHora.innerHTML += `<option value="${h}">${h}</option>`;
            } else {
                // 🔥 OPCIONAL: mostrar ocupado deshabilitado
                selectHora.innerHTML += `<option disabled>${h} (completo)</option>`;
            }
        });

    } catch (error) {
        console.error("horarios-disponibles:", error);
        selectHora.innerHTML = "<option>Error cargando horarios</option>";
    }
}

/* =========================================================
   CLASES POR SEMANA
========================================================= */

function clasesPorSemana(pack) {

    if (pack == 4) return 1;
    if (pack == 8) return 2;
    if (pack == 12) return 3;
    if (pack == 16) return 4;

    return 1;
}

function obtenerClaveSemana(fechaTexto) {
    const [year, month, day] = fechaTexto.split("-").map(Number);
    const fecha = new Date(year, month - 1, day);
    const diaSemana = (fecha.getDay() + 6) % 7;
    fecha.setDate(fecha.getDate() - diaSemana);

    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, "0");
    const dd = String(fecha.getDate()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}`;
}

/* =========================================================
   ENVIAR RESERVA
========================================================= */

document.getElementById("formReserva").addEventListener("submit", async function(e) {

    e.preventDefault();

    const nombre = document.getElementById("nombre").value;
    const telefono = document.getElementById("telefono").value;
    const dni = document.getElementById("dni").value;
    const pack = document.getElementById("pack").value;

    const fechas = document.querySelectorAll(".fecha");
    const horas = document.querySelectorAll(".hora");

    let clases = [];
    const porSemana = clasesPorSemana(pack);
    const semanas = {};

    for (let i = 0; i < fechas.length; i++) {

        if (!fechas[i].value || !horas[i].value) {
            alert("Tenés que completar todas las clases");
            return;
        }

        clases.push({
            dia: fechas[i].value,
            hora: horas[i].value
        });

        const semana = obtenerClaveSemana(fechas[i].value);

        if (!semanas[semana]) semanas[semana] = 0;
        semanas[semana]++;
    }

    /* VALIDAR CLASES POR SEMANA */
    for (let s in semanas) {
        if (semanas[s] > porSemana) {
            alert("Superaste la cantidad de clases permitidas por semana");
            return;
        }
    }

    const res = await fetch("/reservar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, telefono, dni, pack, clases })
    });

    const mensaje = await res.text();

    alert(mensaje);

    if (mensaje === "Reserva guardada correctamente") {
        document.getElementById("formReserva").reset();
        document.getElementById("clasesContainer").innerHTML = "";
    }
});

document.addEventListener("DOMContentLoaded", () => {
    inicializarTema();
    const selectPack = document.getElementById("pack");

    if (selectPack) {
        selectPack.addEventListener("change", generarClases);
    }
});
