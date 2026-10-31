import { apiClient } from './api';
import type { ApiCollection } from '@/types/request.types';

export interface CreateCollectionPayload {
  id?: string;
  name: string;
  requests?: ApiCollection['requests'];
}

export interface UpdateCollectionPayload {
  name?: string;
  requests?: ApiCollection['requests'];
}

export const collectionService = {
  async getCollections(): Promise<ApiCollection[]> {
    const response = await apiClient.get<{ success: boolean; collections: ApiCollection[] }>('/collections');
    return response.data?.collections || [];
  },

  async getCollectionById(id: string): Promise<ApiCollection | null> {
    const response = await apiClient.get<{ success: boolean; collection: ApiCollection }>(`/collections/${id}`);
    return response.data?.collection || null;
  },

  async createCollection(payload: CreateCollectionPayload): Promise<ApiCollection> {
    const response = await apiClient.post<{ success: boolean; collection: ApiCollection }>('/collections', payload);
    return response.data.collection;
  },

  async updateCollection(id: string, payload: UpdateCollectionPayload): Promise<ApiCollection> {
    const response = await apiClient.put<{ success: boolean; collection: ApiCollection }>(`/collections/${id}`, payload);
    return response.data.collection;
  },

  async deleteCollection(id: string): Promise<void> {
    await apiClient.delete(`/collections/${id}`);
  },
};

