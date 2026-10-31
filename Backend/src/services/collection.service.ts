import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { CollectionModel } from '../models/collection.mongo.js';
import type {
  ApiCollection,
  CreateCollectionDto,
  UpdateCollectionDto,
} from '../types/collection.types.js';

export class CollectionService {
  private collections: Map<string, ApiCollection> = new Map(); // key: id

  /**
   * Reset in-memory cache (for test isolation)
   */
  public reset(): void {
    this.collections.clear();
  }

  /**
   * Rehydrate collections from MongoDB into memory cache on server startup
   */
  public async hydrateFromMongo(): Promise<void> {
    if (mongoose.connection.readyState === 1) {
      try {
        const docs = await CollectionModel.find({});
        for (const doc of docs) {
          this.collections.set(doc.id, {
            id: doc.id,
            userId: doc.userId,
            name: doc.name,
            requests: doc.requests || [],
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          });
        }
        console.log(`🍃 Hydrated ${docs.length} collections from MongoDB`);
      } catch (err: unknown) {
        console.warn('⚠️ Failed to hydrate collections from MongoDB:', (err as Error).message);
      }
    }
  }

  /**
   * Retrieve all collections belonging strictly to the authenticated user.
   */
  public async getUserCollections(userId: string): Promise<ApiCollection[]> {
    if (mongoose.connection.readyState === 1) {
      try {
        const docs = await CollectionModel.find({ userId }).lean();
        return docs.map((doc) => ({
          id: doc.id,
          userId: doc.userId,
          name: doc.name,
          requests: doc.requests || [],
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        }));
      } catch (err: unknown) {
        console.warn('⚠️ MongoDB query error, falling back to memory:', (err as Error).message);
      }
    }

    // In-memory fallback (ensuring strict userId boundary)
    const result: ApiCollection[] = [];
    for (const item of this.collections.values()) {
      if (item.userId === userId) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * Retrieve a specific collection by ID, strictly verifying ownership by userId.
   */
  public async getCollectionById(userId: string, collectionId: string): Promise<ApiCollection | null> {
    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await CollectionModel.findOne({ id: collectionId, userId }).lean();
        if (doc) {
          return {
            id: doc.id,
            userId: doc.userId,
            name: doc.name,
            requests: doc.requests || [],
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          };
        }
        return null;
      } catch (err: unknown) {
        console.warn('⚠️ MongoDB query error:', (err as Error).message);
      }
    }

    const item = this.collections.get(collectionId);
    if (item && item.userId === userId) {
      return item;
    }
    return null;
  }

  /**
   * Create a new collection owned by the authenticated user.
   */
  public async createCollection(userId: string, dto: CreateCollectionDto): Promise<ApiCollection> {
    const id = dto.id?.trim() || `col_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const name = (dto.name || '').trim() || 'Untitled collection';
    const requests = Array.isArray(dto.requests) ? dto.requests : [];

    const record: ApiCollection = {
      id,
      userId,
      name,
      requests,
      createdAt: now,
      updatedAt: now,
    };

    if (mongoose.connection.readyState === 1) {
      try {
        await CollectionModel.create(record);
      } catch (err: unknown) {
        console.warn('⚠️ Failed to save collection to MongoDB:', (err as Error).message);
      }
    }

    this.collections.set(record.id, record);
    return record;
  }

  /**
   * Update an existing collection with strict ownership verification.
   */
  public async updateCollection(
    userId: string,
    collectionId: string,
    dto: UpdateCollectionDto
  ): Promise<ApiCollection | null> {
    const existing = await this.getCollectionById(userId, collectionId);
    if (!existing) {
      return null;
    }

    const updatedAt = new Date().toISOString();
    const updated: ApiCollection = {
      ...existing,
      name: typeof dto.name === 'string' ? dto.name.trim() || existing.name : existing.name,
      requests: Array.isArray(dto.requests) ? dto.requests : existing.requests,
      updatedAt,
    };

    if (mongoose.connection.readyState === 1) {
      try {
        await CollectionModel.updateOne(
          { id: collectionId, userId },
          { name: updated.name, requests: updated.requests, updatedAt }
        );
      } catch (err: unknown) {
        console.warn('⚠️ Failed to update collection in MongoDB:', (err as Error).message);
      }
    }

    this.collections.set(collectionId, updated);
    return updated;
  }

  /**
   * Delete an existing collection with strict ownership verification.
   */
  public async deleteCollection(userId: string, collectionId: string): Promise<boolean> {
    const existing = await this.getCollectionById(userId, collectionId);
    if (!existing) {
      return false;
    }

    if (mongoose.connection.readyState === 1) {
      try {
        await CollectionModel.deleteOne({ id: collectionId, userId });
      } catch (err: unknown) {
        console.warn('⚠️ Failed to delete collection from MongoDB:', (err as Error).message);
      }
    }

    this.collections.delete(collectionId);
    return true;
  }

  /**
   * Purge all collections belonging to a user (used on account deletion).
   */
  public async deleteUserCollections(userId: string): Promise<void> {
    if (mongoose.connection.readyState === 1) {
      try {
        await CollectionModel.deleteMany({ userId });
      } catch (err: unknown) {
        console.warn('⚠️ Failed to purge user collections from MongoDB:', (err as Error).message);
      }
    }

    for (const [id, col] of this.collections.entries()) {
      if (col.userId === userId) {
        this.collections.delete(id);
      }
    }
  }
}

export const collectionService = new CollectionService();

