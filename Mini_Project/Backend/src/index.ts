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
import { errorHandler } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
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
