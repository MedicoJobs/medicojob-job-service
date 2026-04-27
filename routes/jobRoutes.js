import express from 'express';
import { createJob, getJobs, getJobById, applyForJob, updateApplicationStatus, getMyApplications, deleteJob } from '../controllers/jobController.js';
import { authMiddleware, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', authMiddleware, authorize('hospital'), createJob);
router.get('/my-applications', authMiddleware, getMyApplications);  // MUST be before /:id
router.get('/', getJobs);
router.get('/:id', getJobById);
router.post('/:id/apply', authMiddleware, applyForJob);
router.patch('/:jobId/application/:doctorId', authMiddleware, authorize('hospital'), updateApplicationStatus);
router.delete('/:id', authMiddleware, authorize('hospital'), deleteJob);

export default router;
