import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { authenticate } from './middleware/auth.js';
import auth from './routes/auth.js';
import medicines from './routes/medicines.js';
import suppliers from './routes/suppliers.js';
import customers from './routes/customers.js';
import receipts from './routes/receipts.js';
import sales from './routes/sales.js';
import reports from './routes/reports.js';
import exchangeRates from './routes/exchangeRates.js';
import exchangeRatesMN from './routes/exchangeRatesMN.js';
import shippingRates from './routes/shippingRates.js';
import utilityRates from './routes/utilityRates.js';
import schedulerService from './services/scheduler.js';

const app = express();

// ============================================================
// CONFIGURACIÓN DE SEGURIDAD
// ============================================================

// Trust proxy - Necesario para Railway y otros servicios detrás de proxy
app.set('trust proxy', true);

// CORS configurado correctamente
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting - Protección contra ataques de fuerza bruta
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 peticiones por ventana
  message: {
    error: 'Demasiadas peticiones',
    message: 'Has excedido el límite de peticiones. Intenta de nuevo más tarde.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting más estricto para rutas de autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos de login
  message: {
    error: 'Demasiados intentos',
    message: 'Has excedido el límite de intentos de inicio de sesión. Intenta de nuevo en 15 minutos.'
  },
  skipSuccessfulRequests: true, // No contar peticiones exitosas
});

// Aplicar rate limiting general a todas las rutas de API
app.use('/api/', limiter);

// Parser de JSON
app.use(express.json());

// ============================================================
// RUTAS
// ============================================================

// Rutas públicas
app.get('/api/health', (_, res)=> res.json({ok:true}));

// Rutas de autenticación (con rate limiting estricto)
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', auth);

// ============================================================
// RUTAS PROTEGIDAS - REQUIEREN AUTENTICACIÓN
// ============================================================
// Todas estas rutas requieren que el usuario esté autenticado
// El middleware 'authenticate' verifica el token JWT

app.use('/api/medicines', authenticate, medicines);
app.use('/api/suppliers', authenticate, suppliers);
app.use('/api/customers', authenticate, customers);
app.use('/api/receipts', authenticate, receipts);
app.use('/api/sales', authenticate, sales);
app.use('/api/reports', authenticate, reports);
app.use('/api/exchange-rates', authenticate, exchangeRates);
app.use('/api/exchange-rates-mn', authenticate, exchangeRatesMN);
app.use('/api/shipping-rates', authenticate, shippingRates);
app.use('/api/utility-rates', authenticate, utilityRates);

// Iniciar el scheduler de tasas de cambio
schedulerService.start();

export default app;