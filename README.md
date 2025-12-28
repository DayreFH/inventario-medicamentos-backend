# 💊 Sistema de Inventario de Medicamentos - Backend

API REST para el sistema de gestión de inventario de medicamentos.

## 🚀 Tecnologías

- **Node.js** 20.x
- **Express** 5.x
- **Prisma ORM** 6.x
- **MySQL** 8.0
- **JWT** para autenticación
- **bcryptjs** para hash de contraseñas

## 📋 Requisitos

- Node.js v20.19.0 o superior
- npm v10.x o superior
- MySQL 8.0

## 🔧 Instalación

```bash
# Instalar dependencias
npm install

# Generar cliente de Prisma
npx prisma generate

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales
```

## ⚙️ Configuración

Crea un archivo `.env` en la raíz del proyecto:

```env
DATABASE_URL="mysql://usuario:password@localhost:3306/inventario_meds"
NODE_ENV=development
PORT=4000
JWT_SECRET=tu-clave-secreta-jwt
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
```

## 🗄️ Base de Datos

```bash
# Sincronizar esquema con la base de datos
npx prisma db push

# Abrir Prisma Studio (interfaz visual)
npm run prisma:studio
```

## 🏃 Ejecutar

```bash
# Modo desarrollo (con hot-reload)
npm run dev

# Modo producción
npm start
```

## 📡 Endpoints

### Autenticación
- `POST /api/auth/register` - Registrar usuario
- `POST /api/auth/login` - Iniciar sesión
- `GET /api/auth/me` - Obtener usuario actual
- `POST /api/auth/change-password` - Cambiar contraseña
- `POST /api/auth/refresh` - Refrescar token

### Medicamentos
- `GET /api/medicines` - Listar medicamentos
- `POST /api/medicines` - Crear medicamento
- `GET /api/medicines/:id` - Obtener medicamento
- `PUT /api/medicines/:id` - Actualizar medicamento
- `DELETE /api/medicines/:id` - Eliminar medicamento

### Proveedores
- `GET /api/suppliers` - Listar proveedores
- `POST /api/suppliers` - Crear proveedor

### Clientes
- `GET /api/customers` - Listar clientes
- `POST /api/customers` - Crear cliente

### Recibos (Compras)
- `GET /api/receipts` - Listar recibos
- `POST /api/receipts` - Crear recibo

### Ventas
- `GET /api/sales` - Listar ventas
- `POST /api/sales` - Crear venta

### Reportes
- `GET /api/reports` - Obtener reportes

### Tasas
- `GET /api/exchange-rates` - Tasas de cambio
- `GET /api/exchange-rates-mn` - Tasas de cambio MN
- `GET /api/shipping-rates` - Tasas de envío
- `GET /api/utility-rates` - Tasas de utilidad

## 🔒 Seguridad

- Autenticación JWT
- Rate limiting (100 req/15min general, 5 req/15min para auth)
- CORS configurado
- Validación con Zod
- Hash de contraseñas con bcrypt

## 🚀 Deployment

### Railway

Este proyecto está configurado para Railway. Ver `railway.json` para detalles.

1. Conecta tu repositorio a Railway
2. Configura las variables de entorno
3. Railway detectará automáticamente la configuración

### Variables de Entorno en Producción

```env
DATABASE_URL=mysql://user:pass@host:3306/db
NODE_ENV=production
PORT=4000
JWT_SECRET=clave-secreta-muy-segura
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://tu-frontend.com
```

## 📚 Scripts Disponibles

```bash
npm run dev              # Desarrollo con hot-reload
npm start                # Producción
npm run prisma:studio    # Abrir Prisma Studio
npm run prisma:generate  # Generar cliente Prisma
npm run prisma:push      # Sincronizar esquema
npm run prisma:migrate   # Crear migración
```

## 📖 Documentación

- [Variables de Entorno](./ENV-VARIABLES.md)
- [Guía de Deployment](../RAILWAY-SEPARADO.md)

## 🔗 Frontend

El frontend de esta aplicación está en un repositorio separado:
- Repositorio Frontend: `inventario-medicamentos-frontend`

## 📄 Licencia

Privado - Uso interno











