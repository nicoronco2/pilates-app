/* =========================================================
   GENERAR CLASES
========================================================= */

function generarClases() {

    const pack = parseInt(document.getElementById("pack").value);
    const container = document.getElementById("clasesContainer");

    container.innerHTML = "";

    for (let i = 1; i <= pack; i++) {

        container.innerHTML += `
        <div class="clase mb-4 p-3 border rounded">

            <h5 class="mb-3">Clase ${i}</h5>

            <label class="form-label">Fecha</label>
            <input type="date" class="fecha form-control mb-2">

            <label class="form-label">Horario</label>
            <select class="hora form-select">
                <option value="">Elegir horario</option>
            </select>

        </div>
        `;
    }

    bloquearFechas();

    /* VALIDAR SOLO CUANDO EL USUARIO CONFIRMA LA FECHA */
    document.querySelectorAll(".fecha").forEach(input => {

        input.addEventListener("change", function () {

            if (!this.value) return;

            /* NO repetir día */
            if (fechaRepetida(this.value)) {
                alert("No podés reservar dos clases el mismo día");
                this.value = "";
                return;
            }

            /* Validar sábado/domingo */
            const fecha = new Date(this.value + "T00:00:00");
            const dia = fecha.getDay();

            if (dia === 0 || dia === 6) {
                alert("Los sábados y domingos no hay clases");
                this.value = "";
                return;
            }

            /* Cargar horarios */
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

    selectHora.innerHTML = "<option value=''>Cargando horarios...</option>";

    const horarios = [
        "08:00","09:00","10:00","11:00",
        "16:00","17:00","18:00","19:00"
    ];

    try {

        const res = await fetch("/horarios-disponibles?fecha=" + inputFecha.value);
        const ocupados = await res.json();

        selectHora.innerHTML = "<option value=''>Elegir horario</option>";

        horarios.forEach(h => {

            const ocupado = ocupados.find(o => o.hora === h && o.total >= 4);

            if (!ocupado) {
                selectHora.innerHTML += `<option value="${h}">${h}</option>`;
            }
        });

    } catch (error) {
        selectHora.innerHTML = "<option>Error cargando horarios</option>";
    }
}

/* =========================================================
   CLASES POR SEMANA SEGÚN PACK
========================================================= */

function clasesPorSemana(pack) {

    if (pack == 4) return 1;
    if (pack == 8) return 2;
    if (pack == 12) return 3;
    if (pack == 16) return 4;

    return 1;
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
            alert("Tenés que elegir fecha y horario en todas las clases");
            return;
        }

        clases.push({
            dia: fechas[i].value,
            hora: horas[i].value
        });

        const fecha = new Date(fechas[i].value);
        const semana = Math.floor(fecha.getTime() / (1000 * 60 * 60 * 24 * 7));

        if (!semanas[semana]) semanas[semana] = 0;
        semanas[semana]++;
    }

    for (let s in semanas) {
        if (semanas[s] > porSemana) {
            alert("Superaste la cantidad de clases permitidas por semana según el pack");
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