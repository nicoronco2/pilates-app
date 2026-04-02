const express = require("express");
const session = require("express-session");
const path = require("path");
const bcrypt = require("bcrypt");
require("dotenv").config();
const validator = require("validator");
const helmet = require("helmet");
const { Pool } = require("pg");

const app = express();

/* ===================================================== */
app.disable("x-powered-by");
app.use(helmet());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isProduction = process.env.NODE_ENV === "production";

/* IMPORTANTE PARA RENDER */
app.set("trust proxy", 1);

/* FORZAR HTTPS */
app.use((req, res, next) => {
    if (isProduction && req.headers["x-forwarded-proto"] !== "https") {
        return res.redirect("https://" + req.headers.host + req.url);
    }
    next();
});

/* 🔥 SESIÓN CORREGIDA */
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

/* ARCHIVOS */
app.use(express.static("public"));

/* ===================================================== */
/* DB */
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

/* ===================================================== */
/* LOGIN */

const usuarios = [
    {
        user: "nicoronco2026",
        pass: "$2b$10$BEfmPkbaazW0wmWyxEX3eunZ3EoFwEr8SzET.BtNTd.Cz7pGMcyei"
    }
];

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public/login.html"));
});

app.post("/login", async (req, res) => {

    let { usuario, password } = req.body;

    usuario = validator.escape(usuario || "").trim();
    password = validator.escape(password || "").trim();

    const u = usuarios.find(x => x.user === usuario);

    if (u && await bcrypt.compare(password, u.pass)) {
        req.session.admin = true;
        return res.redirect("/admin");
    }

    res.send("Login incorrecto");
});

/* ===================================================== */
/* ADMIN */

app.get("/admin", (req, res) => {
    if (!req.session.admin) return res.redirect("/login");
    res.sendFile(path.join(__dirname, "private/admin.html"));
});

/* ===================================================== */
/* RESERVAS */

app.get("/reservas", async (req, res) => {

    if (!req.session.admin) {
        return res.status(403).send("No autorizado");
    }

    const result = await pool.query("SELECT * FROM reservas ORDER BY dia ASC");
    res.json(result.rows);
});

/* ===================================================== */
/* RESERVAR */

app.post("/reservar", async (req, res) => {

    if (!req.session.admin) {
        return res.status(403).send("No autorizado");
    }

    let { nombre, telefono, dni, pack, clases } = req.body;

    for (const c of clases) {
        await pool.query(
            "INSERT INTO reservas (nombre, telefono, dni, dia, hora, pack) VALUES ($1,$2,$3,$4,$5,$6)",
            [nombre, telefono, dni, c.dia, c.hora, pack]
        );
    }

    res.send("Reserva guardada correctamente");
});

/* ===================================================== */
/* ASISTENCIA */

app.post("/asistencia", async (req, res) => {

    if (!req.session.admin) {
        return res.status(403).send("No autorizado");
    }

    const { dni } = req.body;

    const fechaHoy = new Date().toISOString().split("T")[0];

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

/* ===================================================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Servidor funcionando 🚀");
});