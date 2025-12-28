import express from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = express.Router();
const prisma = new PrismaClient();

// Schema de validación
const roleSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().optional(),
  startPanel: z.string().optional(),
  permissions: z.union([
    z.array(z.string()), // Acepta array de strings (nuevo formato)
    z.string()           // Acepta string JSON (formato viejo para compatibilidad)
  ]).optional()
});

// GET /roles - Listar todos los roles
router.get('/', async (req, res) => {
  try {
    const roles = await prisma.roles.findMany({
      orderBy: { created_at: 'desc' }
    });

    res.json({ data: roles });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ message: 'Error al obtener roles', error: error.message });
  }
});

// GET /roles/:id - Obtener un rol
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const role = await prisma.roles.findUnique({
      where: { id: parseInt(id) },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!role) {
      return res.status(404).json({ message: 'Rol no encontrado' });
    }

    res.json({ data: role });
  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({ message: 'Error al obtener rol', error: error.message });
  }
});

// POST /roles - Crear rol
router.post('/', async (req, res) => {
  try {
    const validatedData = roleSchema.parse(req.body);

    // Verificar si el nombre ya existe
    const existingRole = await prisma.roles.findFirst({
      where: { name: validatedData.name }
    });

    if (existingRole) {
      return res.status(400).json({ message: 'Ya existe un rol con ese nombre' });
    }

    // Convertir permissions a JSON string si es un array
    const permissionsJson = Array.isArray(validatedData.permissions)
      ? JSON.stringify(validatedData.permissions)
      : validatedData.permissions || '[]';

    const role = await prisma.roles.create({
      data: {
        name: validatedData.name,
        description: validatedData.description || null,
        startPanel: validatedData.startPanel || '/dashboard',
        permissions: permissionsJson,
        updated_at: new Date()
      }
    });

    res.status(201).json({ data: role, message: 'Rol creado exitosamente' });
  } catch (error) {
    console.error('Error creating role:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Datos inválidos', errors: error.errors });
    }
    res.status(500).json({ message: 'Error al crear rol', error: error.message });
  }
});

// PUT /roles/:id - Actualizar rol
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validatedData = roleSchema.parse(req.body);

    // Convertir permissions a JSON string si es un array
    const permissionsJson = Array.isArray(validatedData.permissions)
      ? JSON.stringify(validatedData.permissions)
      : validatedData.permissions;

    const role = await prisma.roles.update({
      where: { id: parseInt(id) },
      data: {
        name: validatedData.name,
        description: validatedData.description,
        startPanel: validatedData.startPanel,
        permissions: permissionsJson,
        updated_at: new Date()
      }
    });

    res.json({ data: role, message: 'Rol actualizado exitosamente' });
  } catch (error) {
    console.error('Error updating role:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Datos inválidos', errors: error.errors });
    }
    res.status(500).json({ message: 'Error al actualizar rol', error: error.message });
  }
});

// DELETE /roles/:id - Eliminar rol
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si hay usuarios con este rol
    const usersWithRole = await prisma.user.count({
      where: { roleId: parseInt(id) }
    });

    if (usersWithRole > 0) {
      return res.status(400).json({ 
        message: `No se puede eliminar el rol porque hay ${usersWithRole} usuario(s) asignados` 
      });
    }

    await prisma.roles.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Rol eliminado exitosamente' });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ message: 'Error al eliminar rol', error: error.message });
  }
});

export default router;


