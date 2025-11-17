# Variables de Entorno - Backend

Este documento describe las variables de entorno necesarias para el backend.

## Configuración

Crea un archivo `.env` en la raíz del directorio `backend` con el siguiente contenido:

```bash
# ============================================================
# BASE DE DATOS
# ============================================================
# URL de conexión a MySQL
# Formato: mysql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_URL="mysql://root:password@localhost:3306/inventario_medicamentos"

# ============================================================
# SERVIDOR
# ============================================================
# Puerto del servidor backend
PORT=4000

# Entorno de ejecución (development, production)
NODE_ENV=development

# ============================================================
# FRONTEND
# ============================================================
# URL del frontend para configuración de CORS
FRONTEND_URL=http://localhost:5173

# ============================================================
# SEGURIDAD Y AUTENTICACIÓN
# ============================================================
# Clave secreta para firmar tokens JWT
# IMPORTANTE: Cambia este valor en producción por uno aleatorio y seguro
# Puedes generar uno con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Duración de los tokens JWT (ejemplos: 7d, 24h, 60m)
JWT_EXPIRES_IN=7d

# ============================================================
# APIS EXTERNAS (Opcional)
# ============================================================
# Clave de API para servicios de tasas de cambio (si se usa API externa)
# EXCHANGE_API_KEY=your-api-key-here
```

## Variables Requeridas

### Obligatorias
- `DATABASE_URL`: URL de conexión a la base de datos MySQL
- `JWT_SECRET`: Clave secreta para firmar tokens JWT (usar una segura en producción)

### Opcionales (con valores por defecto)
- `PORT`: Puerto del servidor (default: 4000)
- `NODE_ENV`: Entorno de ejecución (default: development)
- `FRONTEND_URL`: URL del frontend (default: http://localhost:5173)
- `JWT_EXPIRES_IN`: Duración de los tokens (default: 7d)

## Generar JWT_SECRET Seguro

Para generar una clave secreta segura para producción:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

O en línea:
```bash
openssl rand -hex 32
```

## Ejemplo para Producción

```bash
DATABASE_URL="mysql://usuario:contraseña@db.example.com:3306/inventario_prod"
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://inventario.example.com
JWT_SECRET=8f3c9b2e7a1d5f6c4b9e2a8d7c3f1e6b4a9c8e2d7f5a3b1c6e9d4f8a2b7c5e1d
JWT_EXPIRES_IN=24h
```

## Seguridad

⚠️ **IMPORTANTE:**
- Nunca compartas tu archivo `.env` o subas las credenciales a control de versiones
- Usa diferentes `JWT_SECRET` para desarrollo y producción
- En producción, usa una clave JWT de al menos 32 caracteres aleatorios
- Configura `NODE_ENV=production` en servidores de producción


