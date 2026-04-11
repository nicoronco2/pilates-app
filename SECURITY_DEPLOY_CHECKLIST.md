## Checklist de Seguridad y Deploy

### Antes de publicar
- Definir `NODE_ENV=production`
- Definir `SESSION_SECRET` con una clave larga y única
- Definir `DATABASE_URL` correcta
- Definir `ADMIN_USERS_JSON` con los usuarios admin reales del cliente
- Verificar que el dominio apunte al servicio correcto
- Confirmar que la web abra con `https://`
- Probar login y logout del admin
- Probar una reserva completa
- Probar registro de asistencia
- Probar un pago y su historial
- Descargar al menos un backup CSV de clientes, reservas y pagos

### Seguridad operativa
- Usar contraseñas fuertes para admin
- No compartir credenciales por WhatsApp en texto plano
- Cambiar la contraseña si se suma o se va una persona del negocio
- Mantener privado el acceso al admin
- No reutilizar el mismo `SESSION_SECRET` entre proyectos
- No reutilizar los mismos usuarios admin entre clientes

### Formato sugerido de ADMIN_USERS_JSON
```json
[
  {
    "user": "admin-del-cliente",
    "pass": "hash-bcrypt"
  }
]
```

### Antes de tocar datos sensibles
- Exportar `clientes`
- Exportar `reservas`
- Exportar `pagos`
- Exportar `lista de espera`

### Si algo falla
- Revisar que Render esté en línea
- Revisar variables de entorno
- Verificar conexión a PostgreSQL
- Restaurar datos desde el último CSV exportado si hace falta

### Lo que conviene aclarar al cliente
- El sistema incluye medidas razonables de seguridad, no una garantía absoluta contra ataques
- Hosting, dominio y terceros pueden fallar
- El soporte inicial tiene una duración definida
- Nuevas funciones o cambios grandes se presupuestan aparte
