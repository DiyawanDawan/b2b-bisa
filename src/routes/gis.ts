import { Router } from 'express';
import * as gisController from '#controllers/gis.controller';

const router = Router();

/**
 * @route GET /api/v1/gis
 * @desc Get regions (countries, provinces, regencies, etc) - PUBLIC
 */
router.get('/', gisController.getRegions);

/**
 * @route GET /api/v1/gis/waste
 * @desc Get biomass waste distribution - PUBLIC
 */
router.get('/waste', gisController.getWasteMap);

/**
 * @route POST /api/v1/gis/match
 * @desc Match supply and demand - PUBLIC
 */
router.post('/match', gisController.matchSupplyDemand);

export default router;
