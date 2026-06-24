import dotenv from 'dotenv';
dotenv.config();
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

const localJobs = [
  {
    _id: 'local-job-1',
    title: 'Critical Care Doctor',
    specialization: 'Critical Care',
    salary: 120000,
    location: 'Mumbai',
    type: 'Full-time',
    description: 'Local demo opening for critical care coverage.',
    requirements: 'ICU experience preferred.',
    status: 'open',
    applications: [],
    createdAt: new Date().toISOString(),
    expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    _id: 'local-job-2',
    title: 'Staff Nurse',
    specialization: 'Nursing',
    salary: 45000,
    location: 'Pune',
    type: 'Full-time',
    description: 'Local demo opening for ward nursing support.',
    requirements: 'Registered nursing license.',
    status: 'open',
    applications: [],
    createdAt: new Date().toISOString(),
    expiryDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const mountLocalJobRoutes = (reason) => {
  console.warn(`${reason} Starting Job Service in local in-memory mode.`);
  app.get('/jobs', (req, res) => {
    const { specialization, location, salary, type, status } = req.query;
    const minSalary = salary ? Number(salary) : null;

    const jobs = localJobs.filter(job => {
      if ((!status || status === 'open') && job.status !== 'open') return false;
      if (status && status !== 'all' && status !== 'open' && job.status !== status) return false;
      if (specialization && !job.specialization.toLowerCase().includes(String(specialization).toLowerCase())) return false;
      if (location && !job.location.toLowerCase().includes(String(location).trim().toLowerCase())) return false;
      if (Number.isFinite(minSalary) && job.salary < minSalary) return false;
      if (type && job.type !== type) return false;
      return true;
    });

    res.json(jobs);
  });

  app.get('/jobs/:id', (req, res) => {
    const job = localJobs.find(savedJob => savedJob._id === req.params.id);

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.json(job);
  });
};

if (!MONGO_URI) {
  mountLocalJobRoutes('MONGO_URI_JOB or MONGO_URI is not configured.');
} else {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    console.log('Job Service DB Connected');
    app.use('/jobs', jobRoutes);
  } catch (err) {
    console.error('Job Service DB Connection Error:', err.message);
    mountLocalJobRoutes('MongoDB connection failed.');
  }
}

const PORT = process.env.PORT || 5002;
server.listen(PORT, () => console.log(`Job Service running on port ${PORT}`));
