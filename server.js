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
app.use(helmet());

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
        secure: isProduction,
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
`);

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

app.get("/admin", (req, res) => {
    if (!req.session.admin) return res.redirect("/login");
    res.sendFile(path.join(__dirname, "private/admin.html"));
});

app.get("/admin.html", (req, res) => {
    res.redirect("/login");
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

app.post("/reservar", async (req, res) => {

    if (!req.session.admin) {
        return res.status(403).send("Acceso no autorizado");
    }

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

app.get("/reservas", async (req, res) => {

    if (!req.session.admin) {
        return res.status(403).send("Acceso no autorizado");
    }

    const result = await pool.query("SELECT * FROM reservas ORDER BY dia ASC");
    res.json(result.rows);
});

/* =====================================================
   HORARIOS
===================================================== */

app.get("/horarios-disponibles", async (req, res) => {

    const fecha = req.query.fecha;

    const result = await pool.query(
        "SELECT hora, COUNT(*) as total FROM reservas WHERE dia = $1 GROUP BY hora",
        [fecha]
    );

    res.json(result.rows);
});

/* =====================================================
   ASISTENCIA
===================================================== */

app.post("/asistencia", async (req, res) => {

    if (!req.session.admin) {
        return res.status(403).send("Acceso no autorizado");
    }

    const { dni } = req.body;

    const hoy = new Date();
    const fechaHoy = hoy.toISOString().split("T")[0];

    const result = await pool.query(
        "SELECT * FROM reservas WHERE dni = $1 AND dia = $2 AND asistida = 0",
        [dni, fechaHoy]
    );

    if (result.rows.length === 0) {
        return res.send("No tiene clase hoy");
    }

    await pool.query(
        "UPDATE reservas SET asistida = 1 WHERE id = $1",
        [result.rows[0].id]
    );

    res.send("Asistencia registrada");
});

/* =====================================================
   REPROGRAMAR
===================================================== */

app.post("/reprogramar", async (req, res) => {

    if (!req.session.admin) {
        return res.status(403).send("Acceso no autorizado");
    }

    const { id, nuevoDia, nuevaHora } = req.body;

    await pool.query(
        "UPDATE reservas SET dia=$1, hora=$2 WHERE id=$3",
        [nuevoDia, nuevaHora, id]
    );

    res.send("Clase reprogramada");
});

/* =====================================================
   SERVER
===================================================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("Servidor funcionando seguro 🚀");})