import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, verifyPassword, generateToken } from '../utils/auth.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Schemas de validación con Zod
const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres')
});

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida')
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
  newPassword: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres')
});

/**
 * POST /api/auth/register
 * Registrar nuevo usuario
 */
router.post('/register', async (req, res) => {
  try {
    // Validar datos de entrada
    const validated = registerSchema.parse(req.body);
    
    // Verificar si el email ya existe
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email }
    });
    
    if (existingUser) {
      return res.status(409).json({
        error: 'Conflicto',
        message: 'El email ya está registrado'
      });
    }
    
    // Hash de contraseña
    const hashedPassword = await hashPassword(validated.password);
    
    // Crear usuario
    const user = await prisma.user.create({
      data: {
        email: validated.email,
        password: hashedPassword,
        name: validated.name,
        role: 'user' // Por defecto es usuario normal
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        created_at: true
      }
    });
    
    // Generar token
    const token = generateToken({ 
      userId: user.id, 
      email: user.email,
      role: user.role 
    });
    
    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user,
      token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    
    console.error('Error en registro:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo registrar el usuario'
    });
  }
});

/**
 * POST /api/auth/login
 * Iniciar sesión
 */
router.post('/login', async (req, res) => {
  try {
    // Validar datos de entrada
    const validated = loginSchema.parse(req.body);
    
    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { email: validated.email },
      include: {
        roles: {
          select: {
            id: true,
            name: true,
            permissions: true,
            startPanel: true
          }
        }
      }
    });
    
    if (!user) {
      return res.status(401).json({
        error: 'Credenciales inválidas',
        message: 'Email o contraseña incorrectos'
      });
    }
    
    // Verificar si el usuario está activo
    if (!user.isActive) {
      return res.status(403).json({
        error: 'Cuenta desactivada',
        message: 'Tu cuenta ha sido desactivada. Contacta al administrador.'
      });
    }
    
    // Verificar contraseña
    const isValidPassword = await verifyPassword(validated.password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Credenciales inválidas',
        message: 'Email o contraseña incorrectos'
      });
    }
    
    // Generar token
    const token = generateToken({ 
      userId: user.id, 
      email: user.email,
      roleId: user.roleId,
      roleName: user.roles?.name || null
    });
    
    res.json({
      message: 'Inicio de sesión exitoso',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles
      },
      token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    
    console.error('Error en login:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo iniciar sesión'
    });
  }
});

/**
 * GET /api/auth/me
 * Obtener información del usuario autenticado
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    // El middleware authenticate ya agregó req.user
    res.json({
      user: req.user
    });
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo obtener la información del usuario'
    });
  }
});

/**
 * POST /api/auth/change-password
 * Cambiar contraseña del usuario autenticado
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {
    // Validar datos de entrada
    const validated = changePasswordSchema.parse(req.body);
    
    // Obtener usuario con contraseña
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });
    
    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }
    
    // Verificar contraseña actual
    const isValidPassword = await verifyPassword(validated.currentPassword, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Contraseña incorrecta',
        message: 'La contraseña actual no es correcta'
      });
    }
    
    // Hash de nueva contraseña
    const hashedPassword = await hashPassword(validated.newPassword);
    
    // Actualizar contraseña
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });
    
    res.json({
      message: 'Contraseña actualizada exitosamente'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo cambiar la contraseña'
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refrescar token (obtener nuevo token con el actual)
 */
router.post('/refresh', authenticate, async (req, res) => {
  try {
    // Generar nuevo token
    const token = generateToken({ 
      userId: req.user.id, 
      email: req.user.email,
      role: req.user.role 
    });
    
    res.json({
      message: 'Token refrescado exitosamente',
      token
    });
  } catch (error) {
    console.error('Error refrescando token:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'No se pudo refrescar el token'
    });
  }
});

export default router;


