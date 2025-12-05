import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import {
  getOrganizers,
  getAthletes,
  getAdmins,
  getUserById,
  approveOrganizer,
  blockUser,
  unblockUser,
  resetUserPassword,
  createAdmin,
} from '../services/userManagementService.js';
import { z } from 'zod';

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
    const organizers = await getOrganizers(searchTerm);

    res.json({
      success: true,
      data: organizers,
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
    const athletes = await getAthletes(searchTerm);

    res.json({
      success: true,
      data: athletes,
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
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const admins = await getAdmins();

    res.json({
      success: true,
      data: admins,
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

