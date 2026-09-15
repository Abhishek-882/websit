import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import apiRouter from './api/routes.js';
import { tokenAggregatorService } from './services/tokenAggregator.service.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', apiRouter);

// 404 handler for unmatched API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'API route not found' });
});

// Serve frontend static assets from public/
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// SPA fallback for frontend client routing
app.get('*', (req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  res.sendFile(indexPath, err => {
    if (err) {
      res.status(200).json({
        status: 'running',
        message: 'Meme Cat Backend API active. Build frontend to view dashboard.',
        endpoints: ['/api/tokens', '/api/health'],
      });
    }
  });
});

// Autonomous background discovery & enrichment loop (every 60s)
tokenAggregatorService.startAutoScan();

app.listen(PORT, () => {
  console.log(`[Meme Cat Server] 🐱 🚀 Listening on http://localhost:${PORT}`);
});

export default app;
