import { Router } from 'express';
import { getEventOgHtml, getHomeOgHtml } from '../controllers/ogController.js';

const router = Router();

router.get('/home', getHomeOgHtml);
router.get('/event/:slug', getEventOgHtml);

export default router;
