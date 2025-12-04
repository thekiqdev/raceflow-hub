import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { register, login, getUserById, RegisterData, LoginData } from '../services/authService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// Register new user
export const registerUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data: RegisterData = req.body;

  // Validation
  if (!data.email || !data.password || !data.full_name || !data.cpf || !data.phone || !data.birth_date) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields',
      message: 'Email, password, full_name, cpf, phone, and birth_date are required',
    });
    return;
  }

  if (!data.lgpd_consent) {
    res.status(400).json({
      success: false,
      error: 'LGPD consent required',
      message: 'You must accept the LGPD terms',
    });
    return;
  }

  try {
    const result = await register(data);

    res.status(201).json({
      success: true,
      data: result,
      message: 'User registered successfully',
    });
  } catch (error: any) {
    if (error.message === 'Email already registered' || error.message === 'CPF already registered') {
      res.status(409).json({
        success: false,
        error: error.message,
        message: error.message,
      });
      return;
    }

    throw error;
  }
});

// Login user
export const loginUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data: LoginData = req.body;

  // Validation
  if (!data.email || !data.password) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields',
      message: 'Email and password are required',
    });
    return;
  }

  try {
    const result = await login(data);

    res.json({
      success: true,
      data: result,
      message: 'Login successful',
    });
  } catch (error: any) {
    if (error.message === 'Invalid email or password') {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Invalid email or password',
      });
      return;
    }

    throw error;
  }
});

// Get current user
export const getCurrentUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
      message: 'Authentication required',
    });
    return;
  }

  const user = await getUserById(req.user.id);

  if (!user) {
    res.status(404).json({
      success: false,
      error: 'User not found',
      message: 'User not found',
    });
    return;
  }

  res.json({
    success: true,
    data: user,
  });
});

// Logout (client-side token removal, but we can add token blacklist here if needed)
export const logoutUser = asyncHandler(async (_req: AuthRequest, res: Response) => {
  // In a stateless JWT system, logout is handled client-side by removing the token
  // If you need server-side logout, implement a token blacklist here

  res.json({
    success: true,
    message: 'Logout successful',
  });
});

