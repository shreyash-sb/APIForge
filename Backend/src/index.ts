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
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

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
      console.log('⚡ APIForge ready for real-world API testing & validation');
    })
    .catch((err: Error) => console.warn('⚠️ MongoDB connection warning:', err.message));
}

// Allowed origins configuration
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((url) => url.trim().replace(/\/+$/, ''))
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000'];

const isDev = process.env.NODE_ENV !== 'production';

// Only trust X-Forwarded-For when explicitly deployed behind a known reverse proxy
// (e.g. TRUST_PROXY=1 or TRUST_PROXY=loopback, or production platforms like Railway).
// Trust reverse proxy hops (Railway, Render, Cloudflare)
if (process.env.TRUST_PROXY) {
  const value = process.env.TRUST_PROXY.trim();
  app.set('trust proxy', /^\d+$/.test(value) ? Number(value) : value === 'true' ? true : value);
} else {
  // Always trust the immediate edge proxy (Railway container ingress)
  app.set('trust proxy', 1);
}

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., server-to-server, curl, tests)
    if (!origin) {
      return callback(null, true);
    }
    const normalizedOrigin = origin.replace(/\/+$/, '');
    if (allowedOrigins.includes(normalizedOrigin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    // Check for domain wildcard patterns (e.g. *.vercel.app)
    if (allowedOrigins.some((allowed) => allowed.startsWith('*.') && normalizedOrigin.endsWith(allowed.slice(1)))) {
      return callback(null, true);
    }
    // Automatically allow any Vercel domain (*.vercel.app)
    if (normalizedOrigin.endsWith('.vercel.app') || /^https:\/\/[a-zA-Z0-9_.-]+\.vercel\.app$/.test(normalizedOrigin)) {
      return callback(null, true);
    }
    // Allow localhost / 127.0.0.1 (supports local frontend connecting to Railway backend)
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(normalizedOrigin)) {
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
app.use('/auth', authRoutes);
app.post('/signup', authSignupRateLimiter, (req, res, next) => {
  req.url = '/signup';
  authRoutes(req, res, next);
});
app.post('/login', authLoginRateLimiter, (req, res, next) => {
  req.url = '/login';
  authRoutes(req, res, next);
});
app.use('/api/collections', requireAuth, collectionRoutes);

// Root status endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'APIForge Backend is Running Successfully!',
    status: 'OK',
    name: 'APIForge Backend API',
    version: '1.0.0',
    documentation: 'https://github.com/shreyash-sb/APIForge',
    healthCheck: '/health',
    endpoints: {
      health: '/health',
      apiHealth: '/api/health',
      mockServe: '/api/mock/serve',
      auth: '/api/auth',
      collections: '/api/collections',
      requests: '/api/requests',
      workflows: '/api/workflows',
      openapi: '/api/openapi',
    },
  });
});

// Health check handler (supports both /health and /api/health)
const healthHandler = (req: express.Request, res: express.Response) => {
  res.status(200).json({
    status: 'ok',
    healthy: true,
    message: 'APIForge server is operational',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'in-memory',
    aiProvider: process.env.AI_PROVIDER || 'mock',
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, HOST, () => {
  console.log(`🚀 APIForge Backend running on http://localhost:${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏱️  Request timeout: ${process.env.REQUEST_TIMEOUT || 30000}ms`);
});
