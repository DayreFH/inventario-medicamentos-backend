import { extractToken, verifyToken } from '../utils/auth.js';
import { prisma } from '../db.js';

/**
 * Middleware de autenticación
 * Verifica que el usuario tenga un token válido
 */
export async function authenticate(req, res, next) {
  try {
    const token = extractToken(req.headers.authorization);
    
    if (!token) {
      return res.status(401).json({ 
        error: 'No autorizado',
        message: 'Token no proporcionado' 
      });
    }
    
    const payload = verifyToken(token);
    
    if (!payload) {
      return res.status(401).json({ 
        error: 'No autorizado',
        message: 'Token inválido o expirado' 
      });
    }
    
    // Verificar que el usuario existe y está activo
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { 
        id: true, 
        email: true, 
        name: true, 
        role: true,
        isActive: true 
      }
    });
    
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        error: 'No autorizado',
        message: 'Usuario no encontrado o inactivo' 
      });
    }
    
    // Agregar usuario al request
    req.user = user;
    next();
  } catch (error) {
    console.error('Error en middleware de autenticación:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      message: 'Error al verificar autenticación' 
    });
  }
}

/**
 * Middleware de autorización por rol
 * Verifica que el usuario tenga uno de los roles permitidos
 * @param {...string} roles - Roles permitidos
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'No autorizado',
        message: 'Usuario no autenticado' 
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Prohibido',
        message: 'No tiene permisos suficientes para realizar esta acción' 
      });
    }
    
    next();
  };
}

/**
 * Middleware opcional de autenticación
 * Si hay token lo valida, si no continúa sin usuario
 */
export async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req.headers.authorization);
    
    if (token) {
      const payload = verifyToken(token);
      
      if (payload) {
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { 
            id: true, 
            email: true, 
            name: true, 
            role: true,
            isActive: true 
          }
        });
        
        if (user && user.isActive) {
          req.user = user;
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('Error en middleware opcional de autenticación:', error);
    next(); // Continuar sin usuario
  }
}


