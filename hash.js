const bcrypt = require("bcrypt");

async function generar() {
    const pass1 = await bcrypt.hash("5839201746", 10);
    const pass2 = await bcrypt.hash("9041762385", 10);

    console.log("nico:", pass1);
    console.log("mama:", pass2);
}

generar();