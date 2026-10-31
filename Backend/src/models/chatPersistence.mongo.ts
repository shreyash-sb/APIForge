import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type ExecutionStatus = 'PENDING' | 'STREAMING' | 'COMPLETED' | 'FAILED';

export interface ISession extends Document {
  sessionId: string;
  userId: string;
  title: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessage extends Document {
  sessionId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  status: ExecutionStatus;
  executionDurationMs?: number;
  createdAt: Date;
}

export const SessionSchema = new Schema<ISession>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    title: { type: String, default: 'New Conversation' },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const MessageSchema = new Schema<IMessage>(
  {
    sessionId: { type: String, required: true, index: true },
    role: { type: String, enum: ['system', 'user', 'assistant'], required: true },
    content: { type: String, required: true },
    tokenUsage: {
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ['PENDING', 'STREAMING', 'COMPLETED', 'FAILED'],
      default: 'COMPLETED',
    },
    executionDurationMs: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Compound index for sorted message timeline retrieval by session
MessageSchema.index({ sessionId: 1, createdAt: 1 });

export const SessionModel: Model<ISession> =
  mongoose.models.Session || mongoose.model<ISession>('Session', SessionSchema);

export const MessageModel: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);
