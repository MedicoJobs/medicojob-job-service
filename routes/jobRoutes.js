const express = require('express');
const { createJob, getJobs, getJobById, applyForJob, updateApplicationStatus, getMyApplications, deleteJob } = require('../controllers/jobController');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, authorize('hospital'), createJob);
router.get('/my-applications', authMiddleware, getMyApplications);  // MUST be before /:id
router.get('/', getJobs);
router.get('/:id', getJobById);
router.post('/:id/apply', authMiddleware, applyForJob);
router.patch('/:jobId/application/:doctorId', authMiddleware, authorize('hospital'), updateApplicationStatus);
router.delete('/:id', authMiddleware, authorize('hospital'), deleteJob);

module.exports = router;
