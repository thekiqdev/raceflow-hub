import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { getProfileByUserId, updateProfile, getPublicProfileByCpf } from '../services/profilesService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// Get own profile
export const getOwnProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const profile = await getProfileByUserId(req.user.id);

  if (!profile) {
    return res.status(404).json({
      success: false,
      error: 'Profile not found',
    });
  }

  res.json({
    success: true,
    data: profile,
  });
  return;
});

// Update own profile
export const updateOwnProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const updatedProfile = await updateProfile(req.user.id, req.body);

  if (!updatedProfile) {
    return res.status(404).json({
      success: false,
      error: 'Profile not found',
    });
  }

  res.json({
    success: true,
    data: updatedProfile,
    message: 'Profile updated successfully',
  });
  return;
});

// Get public profile by CPF (for registration by others)
export const getPublicProfileByCpfController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const { cpf } = req.query;

  if (!cpf || typeof cpf !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'CPF is required',
    });
  }

  const profile = await getPublicProfileByCpf(cpf);

  if (!profile) {
    return res.status(404).json({
      success: false,
      error: 'Perfil não encontrado ou não está público',
    });
  }

  res.json({
    success: true,
    data: profile,
  });
  return;
});

