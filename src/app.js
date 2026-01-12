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
import invoices from './routes/invoices.js';
import reports from './routes/reports.js';
import exchangeRates from './routes/exchangeRates.js';
import exchangeRatesMN from './routes/exchangeRatesMN.js';
import shippingRates from './routes/shippingRates.js';
import utilityRates from './routes/utilityRates.js';
import users from './routes/users.js';
import roles from './routes/roles.js';
import topbar from './routes/topbar.js';
import profitability from './routes/profitability.js';
import dashboard from './routes/dashboard.js';
import companySettings from './routes/companySettings.js';
import company from './routes/company.js';
import paymentMethods from './routes/paymentMethods.js';
import schedulerService from './services/scheduler.js';

const app = express();

// ============================================================
// CONFIGURACIÓN DE SEGURIDAD
// ============================================================

// Confiar en el proxy (Railway, Vercel, etc.)
app.set('trust proxy', 1);

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
  max: 500, // máximo 500 peticiones por ventana (aumentado para desarrollo)
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
  max: 20, // máximo 20 intentos de login (aumentado de 5)
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
app.use('/api/invoices', authenticate, invoices);
app.use('/api/reports', authenticate, reports);
app.use('/api/exchange-rates', authenticate, exchangeRates);
app.use('/api/exchange-rates-mn', authenticate, exchangeRatesMN);
app.use('/api/shipping-rates', authenticate, shippingRates);
app.use('/api/utility-rates', authenticate, utilityRates);
app.use('/api/users', authenticate, users);
app.use('/api/roles', authenticate, roles);
app.use('/api/topbar', authenticate, topbar);
app.use('/api/profitability', authenticate, profitability);
app.use('/api/dashboard', authenticate, dashboard);
app.use('/api/company-settings', authenticate, companySettings);
app.use('/api/company', authenticate, company);
app.use('/api/payment-methods', authenticate, paymentMethods);

// Iniciar el scheduler de tasas de cambio
schedulerService.start();

export default app;