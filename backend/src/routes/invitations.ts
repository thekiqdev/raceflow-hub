import { Router } from 'express';
import { validateCompletionTokenController } from '../controllers/invitationCompletionController.js';

const router = Router();

/** Público: valida token do link de completar cadastro (convite sem cadastro). */
router.get('/complete-registration/validate', validateCompletionTokenController);

export default router;
