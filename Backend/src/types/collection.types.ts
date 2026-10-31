import type { RequestDraft } from './request.types.js';

export interface CollectionRequestItem extends RequestDraft {
  id: string;
  name: string;
}

export interface ApiCollection {
  id: string;
  userId: string;
  name: string;
  requests: CollectionRequestItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCollectionDto {
  id?: string;
  name: string;
  requests?: CollectionRequestItem[];
}

export interface UpdateCollectionDto {
  name?: string;
  requests?: CollectionRequestItem[];
}

