import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { getHomePageSettings, updateHomePageSettings } from '../services/homePageSettingsService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { hasRole } from '../services/userRolesService.js';

// Get home page settings (public)
export const getSettings = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const settings = await getHomePageSettings();

  res.json({
    success: true,
    data: settings,
  });
  return;
});

// Update home page settings (admin only)
export const updateSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');

  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Only admins can update home page settings',
    });
    return;
  }

  const updatedSettings = await updateHomePageSettings(req.body);

  res.json({
    success: true,
    data: updatedSettings,
    message: 'Settings updated successfully',
  });
  return;
});





