import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
import { errorHandler } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Allowed origins configuration
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000'];

const isDev = process.env.NODE_ENV !== 'production';

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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/requests', requestRoutes);
app.use('/api/openapi', openApiRoutes);
app.use('/api/tests', testGeneratorRoutes);
app.use('/api/tests', testExecutionRoutes);
app.use('/api/validation', validationRoutes);
app.use('/api/diagnosis', diagnosisRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/mock', mockServerRoutes);
app.use('/api/assistant', assistantRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 APIForge Backend running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏱️  Request timeout: ${process.env.REQUEST_TIMEOUT || 30000}ms`);
});
