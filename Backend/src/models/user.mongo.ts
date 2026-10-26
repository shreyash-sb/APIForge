import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { LoginStatus } from '../types/auth.types.js';

export interface IUserDocument extends Document {
  id: string;
  name: string;
  email: string;
  role: string;
  passwordHash: string;
  salt: string;
  failedLoginAttempts: number;
  lockoutUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ILoginActivityDocument extends Document {
  id: string;
  userId?: string;
  userEmail: string;
  ip: string;
  userAgent: string;
  status: LoginStatus;
  deviceType?: string;
  failureReason?: string;
  timestamp: string;
}

export const UserSchema = new Schema<IUserDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true },
    role: { type: String, default: 'engineer' },
    passwordHash: { type: String, required: true },
    salt: { type: String, required: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: String },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { timestamps: false }
);

export const LoginActivitySchema = new Schema<ILoginActivityDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, index: true },
    userEmail: { type: String, required: true, index: true },
    ip: { type: String, required: true },
    userAgent: { type: String, required: true },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED_PASSWORD', 'FAILED_NOT_FOUND', 'LOCKED'],
      required: true,
    },
    deviceType: { type: String },
    failureReason: { type: String },
    timestamp: { type: String, required: true, index: true },
  },
  { timestamps: false }
);

export const UserModel: Model<IUserDocument> =
  mongoose.models.User || mongoose.model<IUserDocument>('User', UserSchema);

export const LoginActivityModel: Model<ILoginActivityDocument> =
  mongoose.models.LoginActivity ||
  mongoose.model<ILoginActivityDocument>('LoginActivity', LoginActivitySchema);
