import type { Request, Response } from 'express';
import { collectionService } from '../services/collection.service.js';

export class CollectionController {
  async getCollections(req: Request, res: Response): Promise<void> {
    try {
      const authUser = res.locals.authUser;
      if (!authUser?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const collections = await collectionService.getUserCollections(authUser.id);
      res.status(200).json({ success: true, collections });
    } catch (err: unknown) {
      console.error('Error fetching collections:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getCollectionById(req: Request, res: Response): Promise<void> {
    try {
      const authUser = res.locals.authUser;
      if (!authUser?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const collection = await collectionService.getCollectionById(authUser.id, req.params.id);
      if (!collection) {
        res.status(404).json({ success: false, error: 'Collection not found or access denied' });
        return;
      }

      res.status(200).json({ success: true, collection });
    } catch (err: unknown) {
      console.error('Error fetching collection:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async createCollection(req: Request, res: Response): Promise<void> {
    try {
      const authUser = res.locals.authUser;
      if (!authUser?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { name, requests, id } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ success: false, error: 'Collection name is required' });
        return;
      }

      const collection = await collectionService.createCollection(authUser.id, {
        id,
        name: name.trim(),
        requests,
      });

      res.status(201).json({ success: true, collection });
    } catch (err: unknown) {
      console.error('Error creating collection:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async updateCollection(req: Request, res: Response): Promise<void> {
    try {
      const authUser = res.locals.authUser;
      if (!authUser?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const collection = await collectionService.updateCollection(
        authUser.id,
        req.params.id,
        req.body || {}
      );

      if (!collection) {
        res.status(404).json({ success: false, error: 'Collection not found or access denied' });
        return;
      }

      res.status(200).json({ success: true, collection });
    } catch (err: unknown) {
      console.error('Error updating collection:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async deleteCollection(req: Request, res: Response): Promise<void> {
    try {
      const authUser = res.locals.authUser;
      if (!authUser?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const deleted = await collectionService.deleteCollection(authUser.id, req.params.id);
      if (!deleted) {
        res.status(404).json({ success: false, error: 'Collection not found or access denied' });
        return;
      }

      res.status(200).json({ success: true, message: 'Collection deleted successfully' });
    } catch (err: unknown) {
      console.error('Error deleting collection:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}

export const collectionController = new CollectionController();

