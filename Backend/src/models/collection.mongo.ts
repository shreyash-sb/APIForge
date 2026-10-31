import mongoose, { Schema, type Document, type Model, type SchemaDefinitionProperty } from 'mongoose';
import type { ApiCollection } from '../types/collection.types.js';

export interface ICollectionDocument extends Document, Omit<ApiCollection, 'id'> {
  id: string;
}

export const CollectionSchema = new Schema<ICollectionDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    // Request items are free-form drafts stored as mixed sub-documents. Mongoose's typings
    // cannot express "Mixed[] holding CollectionRequestItem", so only the type is asserted.
    requests: { type: [Schema.Types.Mixed], default: [] } as unknown as SchemaDefinitionProperty<ICollectionDocument['requests']>,
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { timestamps: false }
);

// Compound index for fast user-scoped collection retrieval
CollectionSchema.index({ userId: 1, id: 1 });

export const CollectionModel: Model<ICollectionDocument> =
  mongoose.models.Collection || mongoose.model<ICollectionDocument>('Collection', CollectionSchema);

