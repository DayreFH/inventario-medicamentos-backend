import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

/**
 * Hash de contraseña usando bcrypt
 * @param {string} password - Contraseña en texto plano
 * @returns {Promise<string>} - Contraseña hasheada
 */
export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

/**
 * Verificar contraseña contra hash
 * @param {string} password - Contraseña en texto plano
 * @param {string} hash - Hash almacenado
 * @returns {Promise<boolean>} - True si coinciden
 */
export async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Generar token JWT
 * @param {object} payload - Datos del usuario
 * @returns {string} - Token JWT
 */
export function generateToken(payload) {
  const secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Verificar token JWT
 * @param {string} token - Token JWT
 * @returns {object|null} - Payload del token o null si es inválido
 */
export function verifyToken(token) {
  try {
    const secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    return jwt.verify(token, secret);
  } catch (error) {
    return null;
  }
}

/**
 * Extraer token del header Authorization
 * @param {string} authHeader - Header Authorization
 * @returns {string|null} - Token o null
 */
export function extractToken(authHeader) {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  
  return parts[1];
}


