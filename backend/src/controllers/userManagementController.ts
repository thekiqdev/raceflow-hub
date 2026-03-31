import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import {
  getOrganizers,
  getAthletes,
  getAdmins,
  getUserById,
  getUserProfileById,
  approveOrganizer,
  blockUser,
  unblockUser,
  resetUserPassword,
  createAdmin,
  convertAthleteToOrganizer,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  hardDeleteUser,
} from '../services/userManagementService.js';
import { updateProfile } from '../services/profilesService.js';
import { query } from '../config/database.js';
import { z } from 'zod';
import type { AdminUserListPagination } from '../services/userManagementService.js';

function parseAdminUserListPagination(query: Record<string, unknown>): AdminUserListPagination | undefined {
  const pageRaw = query.page;
  const pageSizeRaw = query.page_size;
  const usePagination =
    (pageRaw !== undefined && pageRaw !== '') || (pageSizeRaw !== undefined && pageSizeRaw !== '');
  if (!usePagination) return undefined;
  const page = Math.max(1, parseInt(String(pageRaw ?? '1'), 10) || 1);
  let rawSize = parseInt(String(pageSizeRaw ?? '30'), 10);
  if (![30, 50].includes(rawSize)) rawSize = 30;
  return { page, page_size: rawSize as 30 | 50 };
}

// Validation schemas
const updateStatusSchema = z.object({
  status: z.enum(['active', 'pending', 'blocked']),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

const createAdminSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  full_name: z.string().min(1, 'Full name is required'),
  phone: z.string().min(1, 'Phone is required'),
  role: z.enum(['admin']).optional(),
});

const updateProfileSchema = z.object({
  full_name: z.union([z.string().min(1), z.literal('')]).optional(),
  email: z.union([z.string().email('E-mail inválido'), z.literal('')]).optional(),
  phone: z.union([z.string().min(1), z.literal('')]).optional(),
  gender: z.enum(['M', 'F', 'O']).optional().nullable(),
  birth_date: z.union([z.string(), z.literal('')]).optional(),
  status: z.enum(['active', 'pending', 'blocked']).optional(),
  role: z.enum(['admin', 'organizer', 'runner']).optional(),
  cpf: z.string().optional(),
  preferred_name: z.union([z.string(), z.literal(''), z.null()]).optional(),
  profession: z.union([z.string(), z.literal(''), z.null()]).optional(),
  cbat: z.union([z.string(), z.literal(''), z.null()]).optional(),
  team: z.union([z.string(), z.literal(''), z.null()]).optional(),
  postal_code: z.union([z.string(), z.literal(''), z.null()]).optional(),
  street: z.union([z.string(), z.literal(''), z.null()]).optional(),
  address_number: z.union([z.string(), z.literal(''), z.null()]).optional(),
  address_complement: z.union([z.string(), z.literal(''), z.null()]).optional(),
  neighborhood: z.union([z.string(), z.literal(''), z.null()]).optional(),
  city: z.union([z.string(), z.literal(''), z.null()]).optional(),
  state: z.union([z.string(), z.literal(''), z.null()]).optional(),
});

/**
 * GET /api/admin/users/organizers
 * Get all organizers with statistics
 */
export const getOrganizersController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const searchTerm = req.query.search as string | undefined;
    const pagination = parseAdminUserListPagination(req.query as Record<string, unknown>);
    const result = await getOrganizers(searchTerm, pagination);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error fetching organizers:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch organizers',
    });
  }
};

/**
 * GET /api/admin/users/athletes
 * Get all athletes with statistics
 */
export const getAthletesController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const searchTerm = req.query.search as string | undefined;
    const pagination = parseAdminUserListPagination(req.query as Record<string, unknown>);
    const result = await getAthletes(searchTerm, pagination);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error fetching athletes:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch athletes',
    });
  }
};

/**
 * GET /api/admin/users/admins
 * Get all admins
 */
export const getAdminsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const pagination = parseAdminUserListPagination(req.query as Record<string, unknown>);
    const result = await getAdmins(pagination);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error fetching admins:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch admins',
    });
  }
};

/**
 * GET /api/admin/users/:id
 * Get user details by ID
 */
export const getUserByIdController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'User ID is required',
      });
      return;
    }

    const user = await getUserById(id);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'User not found',
      });
      return;
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch user',
    });
  }
};

/**
 * PUT /api/admin/users/:id/status
 * Update user status
 */
export const updateUserStatusController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const validation = updateStatusSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const { status } = validation.data;

    // Import here to avoid circular dependency
    const { updateUserStatus } = await import('../services/userManagementService.js');
    await updateUserStatus(id, status as 'active' | 'pending' | 'blocked');

    res.json({
      success: true,
      message: 'User status updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to update user status',
    });
  }
};

/**
 * POST /api/admin/users/:id/approve
 * Approve organizer
 */
export const approveOrganizerController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    await approveOrganizer(id);

    res.json({
      success: true,
      message: 'Organizer approved successfully',
    });
  } catch (error: any) {
    console.error('Error approving organizer:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to approve organizer',
    });
  }
};

/**
 * POST /api/admin/users/:id/block
 * Block user
 */
export const blockUserController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    await blockUser(id);

    res.json({
      success: true,
      message: 'User blocked successfully',
    });
  } catch (error: any) {
    console.error('Error blocking user:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to block user',
    });
  }
};

/**
 * POST /api/admin/users/:id/unblock
 * Unblock user
 */
export const unblockUserController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    await unblockUser(id);

    res.json({
      success: true,
      message: 'User unblocked successfully',
    });
  } catch (error: any) {
    console.error('Error unblocking user:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to unblock user',
    });
  }
};

/**
 * POST /api/admin/users/:id/reset-password
 * Reset user password
 */
export const resetUserPasswordController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const validation = resetPasswordSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const { newPassword } = validation.data;
    await resetUserPassword(id, newPassword);

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error: any) {
    console.error('Error resetting password:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to reset password',
    });
  }
};

/**
 * POST /api/admin/users/admins
 * Create new admin user
 */
export const createAdminController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const validation = createAdminSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const userId = await createAdmin(validation.data);

    res.status(201).json({
      success: true,
      data: { id: userId },
      message: 'Admin user created successfully',
    });
  } catch (error: any) {
    console.error('Error creating admin:', error);
    
    // Check for duplicate email
    if (error.code === '23505' || error.message.includes('duplicate')) {
      res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Email already exists',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to create admin user',
    });
  }
};

/**
 * GET /api/admin/users/:id/profile
 * Get user profile by ID (admin)
 */
export const getUserProfileByIdController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'User ID is required',
      });
      return;
    }

    const profile = await getUserProfileById(id);

    if (!profile) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'User profile not found',
      });
      return;
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error: any) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch user profile',
    });
  }
};

/**
 * PUT /api/admin/users/:id/profile
 * Update user profile (admin)
 */
export const updateUserProfileController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const validation = updateProfileSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const data = validation.data;
    
    console.log('📝 Update profile request:', { id, data });
    
    // Update email (users table) if provided – only for admin
    if (data.email !== undefined && data.email !== null && data.email.trim() !== '') {
      const newEmail = data.email.trim().toLowerCase();
      const existingEmail = await query(
        'SELECT id FROM users WHERE LOWER(TRIM(email)) = $1 AND id != $2',
        [newEmail, id]
      );
      if (existingEmail.rows.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Email already registered',
          message: 'Este e-mail já está cadastrado para outro usuário',
        });
        return;
      }
      await query('UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2', [newEmail, id]);
    }
    
    // Filter out empty strings and prepare profile data
    const profileData: any = {};
    if (data.full_name !== undefined && data.full_name !== null && data.full_name !== '' && data.full_name.trim() !== '') {
      profileData.full_name = data.full_name.trim();
    }
    if (data.phone !== undefined && data.phone !== null && data.phone !== '' && data.phone.trim() !== '') {
      profileData.phone = data.phone.trim();
    }
    if (data.gender !== undefined && data.gender !== null) {
      profileData.gender = data.gender;
    }
    if (data.birth_date !== undefined && data.birth_date !== null && data.birth_date !== '' && data.birth_date.trim() !== '') {
      profileData.birth_date = data.birth_date.trim();
    }
    if (data.cpf !== undefined && data.cpf !== null && data.cpf !== '') {
      const cleanCpf = String(data.cpf).replace(/[^0-9]/g, '');
      if (cleanCpf.length === 11) {
        // Check if CPF already exists (excluding current user)
        const existingCpf = await query(
          'SELECT id FROM profiles WHERE cpf = $1 AND id != $2',
          [cleanCpf, id]
        );

        if (existingCpf.rows.length > 0) {
          res.status(400).json({
            success: false,
            error: 'CPF already registered',
            message: 'Este CPF já está cadastrado para outro usuário',
          });
          return;
        }
        profileData.cpf = cleanCpf;
      }
    }

    // Add additional profile fields
    if (data.preferred_name !== undefined) {
      profileData.preferred_name = data.preferred_name === '' ? null : data.preferred_name;
    }
    if (data.profession !== undefined) {
      profileData.profession = data.profession === '' ? null : data.profession;
    }
    if (data.cbat !== undefined) {
      profileData.cbat = data.cbat === '' ? null : data.cbat;
    }
    if (data.team !== undefined) {
      profileData.team = data.team === '' ? null : data.team;
    }
    if (data.postal_code !== undefined) {
      profileData.postal_code = data.postal_code === '' ? null : data.postal_code;
    }
    if (data.street !== undefined) {
      profileData.street = data.street === '' ? null : data.street;
    }
    if (data.address_number !== undefined) {
      profileData.address_number = data.address_number === '' ? null : data.address_number;
    }
    if (data.address_complement !== undefined) {
      profileData.address_complement = data.address_complement === '' ? null : data.address_complement;
    }
    if (data.neighborhood !== undefined) {
      profileData.neighborhood = data.neighborhood === '' ? null : data.neighborhood;
    }
    if (data.city !== undefined) {
      profileData.city = data.city === '' ? null : data.city;
    }
    if (data.state !== undefined) {
      profileData.state = data.state === '' ? null : data.state;
    }

    console.log('📋 Profile data to update:', profileData);

    // Update profile if there's data to update
    if (Object.keys(profileData).length > 0) {
      const updatedProfile = await updateProfile(id, profileData);
      if (!updatedProfile) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'User profile not found',
        });
        return;
      }
    }

    // Update status if provided
    if (data.status) {
      console.log('🔄 Updating status to:', data.status);
      await updateUserStatus(id, data.status);
    }

    // Update role if provided
    if (data.role) {
      console.log('🔄 Updating role to:', data.role);
      await updateUserRole(id, data.role);
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating user profile:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to update user profile',
    });
  }
};

/**
 * POST /api/admin/users/:id/convert-to-organizer
 * Convert athlete to organizer
 */
export const convertAthleteToOrganizerController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'User ID is required',
      });
      return;
    }

    await convertAthleteToOrganizer(id);

    res.json({
      success: true,
      message: 'Atleta convertido para organizador com sucesso',
    });
  } catch (error: any) {
    console.error('Error converting athlete to organizer:', error);
    
    if (error.message.includes('not an athlete') || error.message.includes('already has organizer')) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to convert athlete to organizer',
    });
  }
};

/**
 * DELETE /api/admin/users/:id
 * Delete user (soft delete)
 */
export const deleteUserController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'User ID is required',
      });
      return;
    }

    await deleteUser(id);

    res.json({
      success: true,
      message: 'Usuário excluído com sucesso',
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to delete user',
    });
  }
};

/**
 * DELETE /api/admin/users/:id/hard-delete
 * Hard delete user - completely removes user and all related data
 * WARNING: This is a destructive operation that cannot be undone
 */
export const hardDeleteUserController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'User ID is required',
      });
      return;
    }

    await hardDeleteUser(id);

    res.json({
      success: true,
      message: 'Perfil do usuário deletado permanentemente',
    });
  } catch (error: any) {
    console.error('Error hard deleting user:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to delete user profile',
    });
  }
};

