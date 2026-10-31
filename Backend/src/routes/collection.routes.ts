import { Router } from 'express';
import { collectionController } from '../controllers/collection.controller.js';

const router = Router();

router.get('/', (req, res) => collectionController.getCollections(req, res));
router.get('/:id', (req, res) => collectionController.getCollectionById(req, res));
router.post('/', (req, res) => collectionController.createCollection(req, res));
router.put('/:id', (req, res) => collectionController.updateCollection(req, res));
router.delete('/:id', (req, res) => collectionController.deleteCollection(req, res));

export default router;

