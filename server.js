import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cron from 'node-cron';
import jobRoutes from './routes/jobRoutes.js';
import { setIo } from './controllers/jobController.js';
import Job from './models/Job.js';

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Log all requests for debugging
app.use((req, res, next) => {
  console.log(`[JOB] ${req.method} ${req.url}`);
  next();
});

setIo(io);

app.use('/jobs', jobRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('[JOB] Error:', err);
  res.status(500).json({ error: err.message, stack: err.stack });
});

// Cron job to auto-close expired jobs every hour
cron.schedule('0 * * * *', async () => {
  try {
    const result = await Job.updateMany(
      { status: 'open', expiryDate: { $lt: new Date() } },
      { $set: { status: 'closed' } }
    );
    console.log(`Auto-closed ${result.modifiedCount} expired jobs`);
  } catch (err) {
    console.error('Error auto-closing jobs:', err);
  }
});

const MONGO_URI = process.env.MONGO_URI_JOB || process.env.MONGO_URI;

try {
  await mongoose.connect(MONGO_URI);
  console.log('Job Service DB Connected');
} catch (err) {
  console.error(err);
}

const PORT = process.env.PORT || 5002;
server.listen(PORT, () => console.log(`Job Service running on port ${PORT}`));
