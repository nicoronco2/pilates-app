const express = require("express");
const session = require("express-session");
const path = require("path");
const bcrypt = require("bcrypt");
require("dotenv").config();
const validator = require("validator");
const helmet = require("helmet");
const { Pool } = require("pg");

const app = express();

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
      "script-src-attr": ["'unsafe-inline'"],
      "style-src": ["'self'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "'unsafe-inline'"],
      "connect-src": ["'self'"],
      "img-src": ["'self'", "data:", "https://images.unsplash.com"],
      "font-src": ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"]
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
        secure: true,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 1000 * 60 * 60
    }
}));

/* SOLO lo público */
app.use(express.static("public"));

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

    if (validator.isEmpty(nombre)) return res.send("Nombre obligatorio");
    if (!validator.isNumeric(dni)) return res.send("DNI inválido");
    if (!validator.isNumeric(telefono)) return res.send("Teléfono inválido");

    const pendientes = await pool.query(
        "SELECT COUNT(*) FROM reservas WHERE dni = $1 AND asistida = 0",
        [dni]
    );

    if (pendientes.rows[0].count > 0) {
        return res.send("El cliente tiene un pack en curso");
    }

    for (const c of clases) {

        const total = await pool.query(
            "SELECT COUNT(*) FROM reservas WHERE dia = $1 AND hora = $2",
            [c.dia, c.hora]
        );

        if (total.rows[0].count >= 4) {
            return res.send("Horario lleno");
        }

        await pool.query(
            "INSERT INTO reservas (nombre, telefono, dni, dia, hora, pack) VALUES ($1,$2,$3,$4,$5,$6)",
            [nombre, telefono, dni, c.dia, c.hora, pack]
        );
    }

    res.send("Reserva guardada correctamente");
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

/* =====================================================
   ASISTENCIA
===================================================== */

app.post("/asistencia", requireAdmin, async (req, res) => {
  const { dni, hora } = req.body;
  if (!dni) return res.status(400).send("DNI requerido");

  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const dd = String(hoy.getDate()).padStart(2, "0");
  const fechaHoy = `${yyyy}-${mm}-${dd}`;

  let result;
  if (hora) {
    result = await pool.query(
      "UPDATE reservas SET asistida = 1 WHERE dni = $1 AND hora = $2 AND asistida = 0 AND dia = $3",
      [dni, hora, fechaHoy]
    );
  } else {
    result = await pool.query(
      "UPDATE reservas SET asistida = 1 WHERE dni = $1 AND asistida = 0 AND dia = $2",
      [dni, fechaHoy]
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
  await pool.query("UPDATE reservas SET dia=$1, hora=$2 WHERE id=$3", [dia, hora, id]);
  return res.send("Reprogramado");
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

/* =====================================================
   SERVER
===================================================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("Servidor funcionando seguro 🚀");
});