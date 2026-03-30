import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { getProfileByUserId, updateProfile, getPublicProfileByCpf, verifyUserPassword } from '../services/profilesService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { hasRole } from '../services/userRolesService.js';
import { query } from '../config/database.js';

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

  const { password, ...profileData } = req.body;

  /** Atleta (não admin) não pode alterar identidade validada na fonte — só admin. */
  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    delete profileData.full_name;
    delete profileData.birth_date;
    delete profileData.gender;
    delete profileData.cpf;
  }

  // Check if user is trying to update CPF (apenas admin chega aqui com cpf no body)
  if (profileData.cpf !== undefined) {
    const isRunner = await hasRole(req.user.id, 'runner');

    if (isRunner) {
      if (!password) {
        return res.status(400).json({
          success: false,
          error: 'Password required',
          message: 'É necessário confirmar sua senha para alterar o CPF',
        });
      }

      const isValidPassword = await verifyUserPassword(req.user.id, password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'Invalid password',
          message: 'Senha incorreta. Não foi possível atualizar o CPF.',
        });
      }
    }
  }

  // Check if CPF already exists (excluding current user)
  if (profileData.cpf) {
    const cleanCpf = String(profileData.cpf).replace(/[^0-9]/g, '');
    const existingCpf = await query(
      'SELECT id FROM profiles WHERE cpf = $1 AND id != $2',
      [cleanCpf, req.user.id]
    );

    if (existingCpf.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'CPF already registered',
        message: 'Este CPF já está cadastrado para outro usuário',
      });
    }
  }

  const updatedProfile = await updateProfile(req.user.id, profileData);

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

  console.log('🔍 Buscando perfil público por CPF:', { 
    cpf, 
    cpfType: typeof cpf,
    queryParams: req.query 
  });

  if (!cpf) {
    console.error('❌ CPF não fornecido na query');
    return res.status(400).json({
      success: false,
      error: 'CPF é obrigatório',
      message: 'Por favor, informe o CPF para buscar o perfil',
    });
  }

  // Convert to string if it's not already
  const cpfString = String(cpf).trim();
  
  if (!cpfString || cpfString.length === 0) {
    console.error('❌ CPF vazio após conversão');
    return res.status(400).json({
      success: false,
      error: 'CPF inválido',
      message: 'O CPF informado está vazio',
    });
  }

  // Validate CPF format (should have at least 11 digits)
  const cleanCpf = cpfString.replace(/[^0-9]/g, '');
  if (cleanCpf.length < 11) {
    console.error('❌ CPF com formato inválido:', { original: cpfString, clean: cleanCpf, length: cleanCpf.length });
    return res.status(400).json({
      success: false,
      error: 'CPF inválido',
      message: 'O CPF deve conter pelo menos 11 dígitos',
    });
  }

  console.log('✅ CPF validado, buscando perfil:', { original: cpfString, clean: cleanCpf });

  let profile = await getPublicProfileByCpf(cpfString);

  // Permite líder (ou qualquer usuário autenticado) encontrar o próprio perfil por CPF mesmo se is_public = false (envio de convite para si)
  if (!profile && req.user) {
    const selfResult = await query(
      `SELECT p.id, p.full_name, p.cpf, p.phone, p.gender, p.birth_date, u.email
       FROM profiles p
       JOIN users u ON p.id = u.id
       WHERE p.id = $1`,
      [req.user.id]
    );
    if (selfResult.rows.length > 0) {
      const row = selfResult.rows[0] as { id: string; full_name: string; cpf: string | null; phone: string | null; gender: string | null; birth_date: string | null; email: string };
      const selfCpfClean = (row.cpf || '').replace(/\D/g, '');
      if (selfCpfClean === cleanCpf) {
        profile = {
          id: row.id,
          full_name: row.full_name,
          cpf: row.cpf ?? undefined,
          phone: row.phone ?? undefined,
          email: row.email,
          gender: row.gender ?? undefined,
          birth_date: row.birth_date ?? undefined,
        };
      }
    }
  }

  if (!profile) {
    console.log('⚠️ Perfil não encontrado ou não é público para CPF:', cleanCpf);
    return res.status(404).json({
      success: false,
      error: 'Perfil não encontrado ou não está público',
      message: 'Não foi possível encontrar um perfil público com este CPF. Verifique se o CPF está correto e se o perfil está configurado como público.',
    });
  }

  console.log('✅ Perfil encontrado:', { id: profile.id, name: profile.full_name });
  
  res.json({
    success: true,
    data: profile,
  });
  return;
});

