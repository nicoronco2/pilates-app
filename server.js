const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcrypt");
require("dotenv").config();
const validator = require("validator");
const helmet = require("helmet");
const { Pool } = require("pg");

const app = express();
const HORARIOS_VALIDOS = ["08:00", "09:00", "10:00", "11:00", "16:00", "17:00", "18:00", "19:00"];

/* =====================================================
   VARIABLES
===================================================== */

const intentosLogin = {};

/* =====================================================
   SEGURIDAD BASE
===================================================== */

// Oculta que usás Express
app.disable("x-powered-by");

// Headers de seguridad
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
      "style-src": ["'self'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "'unsafe-inline'"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:", "https://images.unsplash.com", "https://i.postimg.cc"],
      "connect-src": ["'self'"]
    }
  }
}));

// quitá o comenta esta línea para no reescribir CSP a “sin CSP”
 // app.use(helmet({ contentSecurityPolicy: false }));

/* =====================================================
   CONFIGURACIÓN
===================================================== */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// servir /public
app.use(express.static(path.join(__dirname, "public")));

const isProduction = process.env.NODE_ENV === "production";

// HTTPS obligatorio en producción
app.use((req, res, next) => {
    if (isProduction && req.headers["x-forwarded-proto"] !== "https") {
        return res.redirect("https://" + req.headers.host + req.url);
    }
    next();
});

app.set("trust proxy", 1);

app.use(session({
    name: "pilates-session",
    secret: process.env.SESSION_SECRET || "secreto123",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 1000 * 60 * 60
    }
}));

/* =====================================================
   BASE DE DATOS (POSTGRESQL)
===================================================== */

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// verificar y loguear
pool.connect()
    .then(client => {
        client.release();
        console.log("PostgreSQL conectado");
    })
    .catch(err => {
        console.error("Error conectando PostgreSQL:", err.message);
        process.exit(1); // mejor fallar rapido en deploy malo
    });

// Crear tabla si no existe
pool.query(`
CREATE TABLE IF NOT EXISTS reservas (
    id SERIAL PRIMARY KEY,
    nombre TEXT,
    telefono TEXT,
    dni TEXT,
    dia TEXT,
    hora TEXT,
    pack INTEGER,
    asistida INTEGER DEFAULT 0
)
`).catch(err => {
    console.error("Error creando tabla reservas:", err.message);
});

pool.query(`
CREATE TABLE IF NOT EXISTS lista_espera (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    telefono TEXT NOT NULL,
    dni TEXT NOT NULL,
    dia TEXT NOT NULL,
    hora TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
`).catch(err => {
    console.error("Error creando tabla lista_espera:", err.message);
});

/* =====================================================
   USUARIOS ADMIN (HASH)
===================================================== */

const usuarios = [
    {
        user: "nicoronco2026",
        pass: "$2b$10$BEfmPkbaazW0wmWyxEX3eunZ3EoFwEr8SzET.BtNTd.Cz7pGMcyei"
    },
    {
        user: "analiamatteoda2026",
        pass: "$2b$10$rRAR0nWhPTe8zI0HKE.IQecu0WCyZDoBnCDJ5KvBzqPjcVELVSTbm"
    }
];

function esTextoNumerico(valor) {
    return validator.isNumeric(String(valor || "").trim(), { no_symbols: true });
}

function esHoraValida(hora) {
    return HORARIOS_VALIDOS.includes(hora);
}

function obtenerPartesFecha(fecha) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha || "").trim());
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() + 1 !== month ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return { date };
}

function esFechaValida(fecha) {
    return Boolean(obtenerPartesFecha(fecha));
}

function esFinDeSemana(fecha) {
    const partes = obtenerPartesFecha(fecha);
    if (!partes) return false;
    const diaSemana = partes.date.getUTCDay();
    return diaSemana === 0 || diaSemana === 6;
}

async function bloquearHorario(client, dia, hora) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${dia}|${hora}`]);
}

async function contarReservasPorHorario(client, dia, hora, excludeId = null) {
    if (excludeId) {
        const result = await client.query(
            "SELECT COUNT(*) FROM reservas WHERE dia = $1 AND hora = $2 AND id <> $3",
            [dia, hora, excludeId]
        );
        return Number(result.rows[0].count);
    }

    const result = await client.query(
        "SELECT COUNT(*) FROM reservas WHERE dia = $1 AND hora = $2",
        [dia, hora]
    );
    return Number(result.rows[0].count);
}

function validarClase({ dia, hora }) {
    if (!esFechaValida(dia)) return "Fecha inválida";
    if (esFinDeSemana(dia)) return "Los sábados y domingos no hay clases";
    if (!esHoraValida(hora)) return "Horario inválido";
    return null;
}

function obtenerFechaHoyArgentina() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Argentina/Buenos_Aires",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });

    const parts = formatter.formatToParts(new Date());
    const year = parts.find(part => part.type === "year")?.value;
    const month = parts.find(part => part.type === "month")?.value;
    const day = parts.find(part => part.type === "day")?.value;

    return `${year}-${month}-${day}`;
}

/* =====================================================
   LOGIN
===================================================== */

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public/login.html"));
});

app.post("/login", async (req, res) => {

    let { usuario, password } = req.body;

    usuario = validator.escape(usuario || "").trim();
    password = validator.escape(password || "").trim();

    if (validator.isEmpty(usuario) || validator.isEmpty(password)) {
        return res.send("Datos incompletos");
    }

    const ip = req.ip;

    if (intentosLogin[ip] && intentosLogin[ip].bloqueadoHasta > Date.now()) {
        return res.send("Demasiados intentos. Probá más tarde.");
    }

    const usuarioEncontrado = usuarios.find(u => u.user === usuario);

    if (usuarioEncontrado) {
        const coincide = await bcrypt.compare(password, usuarioEncontrado.pass);

        if (coincide) {
            delete intentosLogin[ip];
            req.session.admin = true;
            return res.redirect("/admin");
        }
    }

    if (!intentosLogin[ip]) {
        intentosLogin[ip] = { intentos: 0, bloqueadoHasta: null };
    }

    intentosLogin[ip].intentos++;

    if (intentosLogin[ip].intentos >= 5) {
        intentosLogin[ip].bloqueadoHasta = Date.now() + (15 * 60 * 1000);
        intentosLogin[ip].intentos = 0;

        return res.send("Demasiados intentos. Usuario bloqueado 15 minutos.");
    }

    const restantes = 5 - intentosLogin[ip].intentos;
    res.send(`Usuario o contraseña incorrectos. Intentos restantes: ${restantes}`);
});

/* =====================================================
   ADMIN
===================================================== */

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  if (req.headers.accept && req.headers.accept.indexOf("application/json") !== -1) {
    return res.status(401).json({ error: "No autorizado" });
  }
  return res.redirect("/login");
}

app.get("/admin", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "private/admin.html"));
});

app.get("/admin.html", requireAdmin, (req, res) => {
  res.redirect("/admin");
});

/* =====================================================
   LOGOUT
===================================================== */

app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/login"));
});

/* =====================================================
   RESERVAR
===================================================== */

app.post("/reservar", requireAdmin, async (req, res) => {

    let { nombre, telefono, dni, pack, clases } = req.body;

    if (!Array.isArray(clases) || clases.length === 0) {
        return res.send("No se enviaron clases");
    }

    nombre = validator.escape(nombre || "").trim();
    telefono = validator.escape(telefono || "").trim();
    dni = validator.escape(dni || "").trim();
    pack = Number(pack);

    if (validator.isEmpty(nombre)) return res.send("Nombre obligatorio");
    if (!esTextoNumerico(dni)) return res.send("DNI inválido");
    if (!esTextoNumerico(telefono)) return res.send("Teléfono inválido");
    if (![4, 8, 12, 16].includes(pack)) return res.send("Pack inválido");
    if (clases.length !== pack) return res.send("Cantidad de clases inválida para el pack seleccionado");

    const fechas = new Set();
    for (const c of clases) {
        const clase = {
            dia: String(c?.dia || "").trim(),
            hora: String(c?.hora || "").trim()
        };

        const error = validarClase(clase);
        if (error) return res.send(error);

        if (fechas.has(clase.dia)) {
            return res.send("No podés reservar dos clases el mismo día");
        }
        fechas.add(clase.dia);
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const pendientes = await client.query(
            "SELECT COUNT(*) FROM reservas WHERE dni = $1 AND asistida = 0",
            [dni]
        );

        if (Number(pendientes.rows[0].count) > 0) {
            await client.query("ROLLBACK");
            return res.send("El cliente tiene un pack en curso");
        }

        const clasesOrdenadas = [...clases]
            .map(c => ({ dia: String(c.dia).trim(), hora: String(c.hora).trim() }))
            .sort((a, b) => `${a.dia}|${a.hora}`.localeCompare(`${b.dia}|${b.hora}`));

        for (const c of clasesOrdenadas) {
            await bloquearHorario(client, c.dia, c.hora);

            const total = await contarReservasPorHorario(client, c.dia, c.hora);
            if (total >= 4) {
                await client.query("ROLLBACK");
                return res.send("Horario lleno");
            }

            await client.query(
                "INSERT INTO reservas (nombre, telefono, dni, dia, hora, pack) VALUES ($1,$2,$3,$4,$5,$6)",
                [nombre, telefono, dni, c.dia, c.hora, pack]
            );
        }

        await client.query("COMMIT");
        return res.send("Reserva guardada correctamente");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("/reservar error:", err);
        return res.status(500).send("Error interno");
    } finally {
        client.release();
    }
});

/* =====================================================
   VER RESERVAS
===================================================== */

app.get("/reservas", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM reservas ORDER BY dia ASC");
        console.log("reservas count", result.rows.length);
        return res.json(result.rows);
    } catch (err) {
        console.error("/reservas error:", err);
        return res.status(500).send("Error interno");
    }
});

/* =====================================================
   HORARIOS
===================================================== */

app.get("/horarios-disponibles", async (req, res) => {
    const fecha = req.query.fecha;
    if (!fecha) return res.status(400).send("Fecha es obligatoria");
    const result = await pool.query(
        "SELECT hora, COUNT(*) as total FROM reservas WHERE dia = $1 GROUP BY hora",
        [fecha]
    );
    return res.json(result.rows);
});

app.get("/healthz", (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    return res.status(200).json({ ok: true });
});

/* =====================================================
   ASISTENCIA
===================================================== */

app.post("/asistencia", requireAdmin, async (req, res) => {
  const { dni, hora } = req.body;
  if (!dni) return res.status(400).send("DNI requerido");
  const fechaHoy = obtenerFechaHoyArgentina();

  let result;
  if (hora) {
    if (!esHoraValida(String(hora).trim())) {
      return res.status(400).send("Horario inválido");
    }
    result = await pool.query(
      "UPDATE reservas SET asistida = 1 WHERE dni = $1 AND hora = $2 AND asistida = 0 AND dia = $3",
      [dni, hora, fechaHoy]
    );
  } else {
    const pendientes = await pool.query(
      "SELECT id FROM reservas WHERE dni = $1 AND asistida = 0 AND dia = $2 ORDER BY hora ASC",
      [dni, fechaHoy]
    );

    if (pendientes.rowCount > 1) {
      return res.status(400).send("Hay más de una clase pendiente hoy para este DNI");
    }

    result = await pool.query(
      "UPDATE reservas SET asistida = 1 WHERE id = $1",
      [pendientes.rows[0]?.id]
    );
  }

  if (result.rowCount === 0) {
    return res.status(400).send("No hay clases pendientes de hoy para este DNI");
  }

  return res.send("Asistencia registrada correctamente");
});

app.post("/reprogramar", requireAdmin, async (req, res) => {
  const { id, dia, hora } = req.body;
  if (!id || !dia || !hora) return res.status(400).send("Datos incompletos");

  const nuevaClase = {
    dia: String(dia || "").trim(),
    hora: String(hora || "").trim()
  };
  const error = validarClase(nuevaClase);
  if (error) return res.status(400).send(error);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await bloquearHorario(client, nuevaClase.dia, nuevaClase.hora);

    const reservaActual = await client.query(
      "SELECT id FROM reservas WHERE id = $1",
      [id]
    );

    if (reservaActual.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).send("Reserva no encontrada");
    }

    const total = await contarReservasPorHorario(client, nuevaClase.dia, nuevaClase.hora, id);
    if (total >= 4) {
      await client.query("ROLLBACK");
      return res.status(400).send("Horario lleno");
    }

    await client.query("UPDATE reservas SET dia=$1, hora=$2 WHERE id=$3", [nuevaClase.dia, nuevaClase.hora, id]);
    await client.query("COMMIT");
    return res.send("Reprogramado");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("/reprogramar error:", err);
    return res.status(500).send("Error interno");
  } finally {
    client.release();
  }
});

app.post("/eliminar-cliente", requireAdmin, async (req, res) => {
  const { dni } = req.body;
  if (!dni) return res.status(400).send("DNI requerido");
  
  const result = await pool.query(
    "DELETE FROM reservas WHERE dni = $1",
    [dni]
  );
  
  if (result.rowCount === 0) {
    return res.status(404).send("Cliente no encontrado");
  }
  
  return res.send("OK");
});

app.post("/editar-cliente", requireAdmin, async (req, res) => {
  let { dniActual, nombre, telefono, nuevoDni } = req.body;

  dniActual = validator.escape(String(dniActual || "")).trim();
  nombre = validator.escape(String(nombre || "")).trim();
  telefono = validator.escape(String(telefono || "")).trim();
  nuevoDni = validator.escape(String(nuevoDni || "")).trim();

  if (!dniActual || !nombre || !telefono || !nuevoDni) {
    return res.status(400).send("Datos incompletos");
  }

  if (!esTextoNumerico(dniActual)) return res.status(400).send("DNI actual inválido");
  if (!esTextoNumerico(nuevoDni)) return res.status(400).send("DNI inválido");
  if (!esTextoNumerico(telefono)) return res.status(400).send("Teléfono inválido");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const clienteActual = await client.query(
      "SELECT id FROM reservas WHERE dni = $1 LIMIT 1",
      [dniActual]
    );

    if (clienteActual.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).send("Cliente no encontrado");
    }

    if (nuevoDni !== dniActual) {
      const dniExistente = await client.query(
        "SELECT id FROM reservas WHERE dni = $1 LIMIT 1",
        [nuevoDni]
      );

      if (dniExistente.rowCount > 0) {
        await client.query("ROLLBACK");
        return res.status(400).send("Ya existe un cliente con ese DNI");
      }
    }

    const result = await client.query(
      "UPDATE reservas SET nombre = $1, telefono = $2, dni = $3 WHERE dni = $4",
      [nombre, telefono, nuevoDni, dniActual]
    );

    await client.query("COMMIT");

    if (result.rowCount === 0) {
      return res.status(404).send("Cliente no encontrado");
    }

    return res.send("Cliente actualizado correctamente");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("/editar-cliente error:", err);
    return res.status(500).send("Error interno");
  } finally {
    client.release();
  }
});

app.get("/lista-espera", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM lista_espera ORDER BY dia ASC, hora ASC, created_at ASC");
    return res.json(result.rows);
  } catch (err) {
    console.error("/lista-espera error:", err);
    return res.status(500).send("Error interno");
  }
});

app.post("/lista-espera", requireAdmin, async (req, res) => {
  let { nombre, telefono, dni, dia, hora } = req.body;

  nombre = validator.escape(String(nombre || "")).trim();
  telefono = validator.escape(String(telefono || "")).trim();
  dni = validator.escape(String(dni || "")).trim();
  dia = validator.escape(String(dia || "")).trim();
  hora = validator.escape(String(hora || "")).trim();

  if (!nombre || !telefono || !dni || !dia || !hora) {
    return res.status(400).send("Datos incompletos");
  }

  if (!esTextoNumerico(dni)) return res.status(400).send("DNI inválido");
  if (!esTextoNumerico(telefono)) return res.status(400).send("Teléfono inválido");

  const errorClase = validarClase({ dia, hora });
  if (errorClase) return res.status(400).send(errorClase);

  try {
    const existente = await pool.query(
      "SELECT id FROM lista_espera WHERE dni = $1 AND dia = $2 AND hora = $3 LIMIT 1",
      [dni, dia, hora]
    );

    if (existente.rowCount > 0) {
      return res.status(400).send("Ese cliente ya está en lista de espera para ese horario");
    }

    await pool.query(
      "INSERT INTO lista_espera (nombre, telefono, dni, dia, hora) VALUES ($1, $2, $3, $4, $5)",
      [nombre, telefono, dni, dia, hora]
    );

    return res.send("Cliente agregado a lista de espera");
  } catch (err) {
    console.error("/lista-espera POST error:", err);
    return res.status(500).send("Error interno");
  }
});

app.post("/eliminar-lista-espera", requireAdmin, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).send("ID requerido");

  try {
    const result = await pool.query("DELETE FROM lista_espera WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).send("Registro no encontrado");
    }

    return res.send("Registro eliminado");
  } catch (err) {
    console.error("/eliminar-lista-espera error:", err);
    return res.status(500).send("Error interno");
  }
});

/* =====================================================
   SERVER
===================================================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("Servidor funcionando seguro 🚀");
});
