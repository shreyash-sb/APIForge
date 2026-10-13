import type { RequestDraft } from '@/store/useAppStore';
export interface ApiCollection { id: string; name: string; requests: Array<RequestDraft & { id: string; name: string }>; createdAt: string; updatedAt: string; }
