import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { register, login, getUserById, setPasswordByInvitationToken, RegisterData, LoginData } from '../services/authService.js';
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
    if (error.message === 'Email already registered') {
      res.status(409).json({
        success: false,
        error: 'E-mail já cadastrado',
        message: 'Este e-mail já está em uso. Faça login ou utilize outro endereço para o cadastro.',
      });
      return;
    }
    if (error.message === 'CPF already registered') {
      res.status(409).json({
        success: false,
        error: 'CPF já cadastrado',
        message: 'Este CPF já está cadastrado na plataforma.',
      });
      return;
    }
    if (
      error.message === 'CPF_LOOKUP_PROOF_REQUIRED' ||
      error.message === 'CPF_LOOKUP_PROOF_INVALID'
    ) {
      res.status(400).json({
        success: false,
        error: 'CPF inválido',
        message: 'CPF inválido',
      });
      return;
    }

    throw error;
  }
});

// Login user
export const loginUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data: LoginData = req.body;

  // Validation (campo `email`: e-mail ou CPF)
  if (!data.email?.trim() || !data.password) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields',
      message: 'Email (or CPF) and password are required',
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
    if (error.message === 'LOGIN_CPF_ONLY') {
      res.status(403).json({
        success: false,
        error: 'LOGIN_CPF_ONLY',
        message: 'Nesta plataforma o login é feito apenas com CPF. Informe seu CPF e senha.',
      });
      return;
    }
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

/**
 * POST /api/auth/set-password-invitation
 * Define senha usando token do link de completar cadastro (convite sem cadastro).
 * Body: { token, newPassword }. Retorna token de login para o front autenticar.
 */
export const setPasswordInvitationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { token, newPassword } = req.body || {};
  if (!token || typeof token !== 'string' || !token.trim()) {
    res.status(400).json({
      success: false,
      error: 'Token é obrigatório.',
      message: 'Token é obrigatório.',
    });
    return;
  }
  if (!newPassword || typeof newPassword !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Nova senha é obrigatória.',
      message: 'Nova senha é obrigatória.',
    });
    return;
  }

  try {
    const result = await setPasswordByInvitationToken(token.trim(), newPassword);
    res.json({
      success: true,
      data: result,
      message: 'Senha definida com sucesso. Você já está logado.',
    });
  } catch (error: any) {
    const msg = error.message || 'Não foi possível definir a senha.';
    if (msg.includes('inválido') || msg.includes('expirado') || msg.includes('não encontrado')) {
      res.status(400).json({
        success: false,
        error: msg,
        message: msg,
      });
      return;
    }
    if (msg.includes('mínimo 6')) {
      res.status(400).json({
        success: false,
        error: msg,
        message: msg,
      });
      return;
    }
    throw error;
  }
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

