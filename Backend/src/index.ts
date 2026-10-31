import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import requestRoutes from './routes/request.routes.js';
import openApiRoutes from './routes/openapi.routes.js';
import testGeneratorRoutes from './routes/testGenerator.routes.js';
import testExecutionRoutes from './routes/testExecution.routes.js';
import validationRoutes from './routes/validation.routes.js';
import diagnosisRoutes from './routes/diagnosis.routes.js';
import reportRoutes from './routes/report.routes.js';
import workflowRoutes from './routes/workflow.routes.js';
import mockServerRoutes from './routes/mockServer.routes.js';
import assistantRoutes from './routes/assistant.routes.js';
import authRoutes from './routes/auth.routes.js';
import collectionRoutes from './routes/collection.routes.js';
import aiSettingsRoutes, { aiSettingsBodyParser } from './routes/aiSettings.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/requireAuth.js';
import { aiRequestRateLimiter, authLoginRateLimiter, authSignupRateLimiter } from './middleware/rateLimiter.js';
import mongoose from 'mongoose';

// Environment variables loaded via import 'dotenv/config'

const app = express();
const PORT = process.env.PORT || 3001;

// Optional MongoDB initialization
if (process.env.MONGODB_URI) {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(async () => {
      console.log('🍃 MongoDB connected successfully');
      const { authService } = await import('./services/auth.service.js');
      await authService.hydrateFromMongo();
      const { collectionService } = await import('./services/collection.service.js');
      await collectionService.hydrateFromMongo();
    })
    .catch((err: Error) => console.warn('⚠️ MongoDB connection warning:', err.message));
}

// Allowed origins configuration
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000'];

const isDev = process.env.NODE_ENV !== 'production';

// Only trust X-Forwarded-For when explicitly deployed behind a known reverse proxy
// (e.g. TRUST_PROXY=1 or TRUST_PROXY=loopback). Otherwise req.ip is the socket address,
// so clients cannot spoof their IP to evade rate limits or forge audit logs.
if (process.env.TRUST_PROXY) {
  const value = process.env.TRUST_PROXY.trim();
  app.set('trust proxy', /^\d+$/.test(value) ? Number(value) : value === 'true' ? true : value);
}

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., server-to-server, curl, tests)
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // In development mode, allow any localhost or 127.0.0.1 port to support dynamic Vite ports (e.g. 5175)
    if (isDev && /^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));

// Tighter body limits for AI routes are registered before the general parser (first parser wins).
app.use('/api/ai-settings', aiSettingsBodyParser);
app.use('/api/assistant', express.json({ limit: '256kb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/requests', requireAuth, requestRoutes);
app.use('/api/openapi', requireAuth, openApiRoutes);
app.use('/api/tests', requireAuth, testGeneratorRoutes);
app.use('/api/tests', requireAuth, testExecutionRoutes);
app.use('/api/validation', requireAuth, validationRoutes);
app.use('/api/diagnosis', requireAuth, aiRequestRateLimiter, diagnosisRoutes);
app.use('/api/reports', requireAuth, reportRoutes);
app.use('/api/workflows', requireAuth, workflowRoutes);
app.use('/api/mock', mockServerRoutes);
app.use('/api/assistant', requireAuth, aiRequestRateLimiter, assistantRoutes);
app.use('/api/ai-settings', requireAuth, aiSettingsRoutes);
app.use('/api/auth/login', authLoginRateLimiter);
app.use('/api/auth/signup', authSignupRateLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/collections', requireAuth, collectionRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'in-memory',
    aiProvider: process.env.AI_PROVIDER || 'mock',
  });
});

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 APIForge Backend running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏱️  Request timeout: ${process.env.REQUEST_TIMEOUT || 30000}ms`);
});
