const Job = require('../models/Job');
let io;

exports.setIo = (socketIo) => { io = socketIo; };

exports.createJob = async (req, res) => {
  try {
    const normalizedTitle = req.body.title?.trim();
    const normalizedLocation = req.body.location?.trim();
    const normalizedDescription = req.body.description?.trim();
    const normalizedRequirements = req.body.requirements?.trim();
    const salary = Number(req.body.salary);
    const expiryDate = new Date(req.body.expiryDate);
    const latitude = req.body.latitude === '' || req.body.latitude === undefined ? undefined : Number(req.body.latitude);
    const longitude = req.body.longitude === '' || req.body.longitude === undefined ? undefined : Number(req.body.longitude);

    if (!normalizedTitle || !normalizedLocation || !req.body.specialization || !req.body.type || !normalizedDescription) {
      return res.status(400).json({ message: 'Please complete all required job fields' });
    }

    if (!Number.isFinite(salary) || salary <= 0) {
      return res.status(400).json({ message: 'Salary must be a positive number' });
    }

    if (Number.isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
      return res.status(400).json({ message: 'Application deadline must be a future date' });
    }

    if ((latitude !== undefined && !Number.isFinite(latitude)) || (longitude !== undefined && !Number.isFinite(longitude))) {
      return res.status(400).json({ message: 'Coordinates must be valid numbers when provided' });
    }

    const duplicateJob = await Job.findOne({
      hospitalId: req.user.id,
      title: normalizedTitle,
      specialization: req.body.specialization,
      location: normalizedLocation,
      type: req.body.type,
      status: 'open',
    });

    if (duplicateJob) {
      return res.status(409).json({ message: 'A similar active job posting already exists' });
    }

    const job = new Job({
      title: normalizedTitle,
      specialization: req.body.specialization,
      salary,
      location: normalizedLocation,
      type: req.body.type,
      expiryDate,
      description: normalizedDescription,
      requirements: normalizedRequirements || '',
      latitude,
      longitude,
      hospitalId: req.user.id,
    });
    await job.save();
    if (io) io.emit('newJob', job);
    res.status(201).json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getJobs = async (req, res) => {
  try {
    const { specialization, location, salary, type, status } = req.query;
    let query = {};

    if (!status || status === 'open') {
      query.status = 'open';
    } else if (status !== 'all') {
      query.status = status;
    }

    if (specialization) query.specialization = { $regex: specialization, $options: 'i' };
    if (location) query.location = { $regex: location.trim(), $options: 'i' };
    if (salary) query.salary = { $gte: Number(salary) };
    if (type) query.type = type;

    const jobs = await Job.find(query).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getJobById = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /jobs/my-applications — returns all jobs a doctor has applied to
exports.getMyApplications = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const jobs = await Job.find({ 'applications.doctorId': doctorId });

    const result = jobs.map(job => {
      const application = job.applications.find(a => a.doctorId === doctorId);
      return {
        jobId: job._id,
        title: job.title,
        specialization: job.specialization,
        location: job.location,
        salary: job.salary,
        type: job.type,
        hospitalId: job.hospitalId,
        applicationStatus: application?.status || 'applied',
        appliedAt: application?.appliedAt,
        rejectionReason: application?.rejectionReason || '',
        nextStep: application?.nextStep || '',
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.applyForJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (job.status === 'closed') return res.status(400).json({ message: 'Job is closed' });
    if (req.user.role === 'hospital') {
      return res.status(403).json({ message: 'Hospital accounts cannot apply for jobs' });
    }

    const hasApplied = job.applications.some(app => app.doctorId === req.user.id);
    if (hasApplied) return res.status(400).json({ message: 'Already applied' });

    job.applications.push({
      doctorId: req.user.id,
      applicantName: req.body.name || '',
      applicantEmail: req.body.email || '',
      applicantSpecialization: req.body.specialization || '',
    });
    await job.save();
    if (io) io.emit('applicationUpdate', { jobId: job._id, doctorId: req.user.id, status: 'applied' });
    res.status(200).json({ message: 'Application submitted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateApplicationStatus = async (req, res) => {
  try {
    const { jobId, doctorId } = req.params;
    const { status, rejectionReason = '', nextStep = '' } = req.body;

    if (!['shortlisted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be shortlisted or rejected' });
    }

    if (status === 'rejected' && !String(rejectionReason).trim()) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    if (status === 'shortlisted' && !String(nextStep).trim()) {
      return res.status(400).json({ message: 'Next step is required when shortlisting an applicant' });
    }

    const job = await Job.findOneAndUpdate(
      { _id: jobId, hospitalId: req.user.id, 'applications.doctorId': doctorId },
      {
        $set: {
          'applications.$.status': status,
          'applications.$.rejectionReason': status === 'rejected' ? String(rejectionReason).trim() : '',
          'applications.$.nextStep': status === 'shortlisted' ? String(nextStep).trim() : '',
        }
      },
      { new: true }
    );

    if (!job) return res.status(404).json({ message: 'Job or application not found' });
    if (io) {
      io.emit('applicationUpdate', {
        jobId,
        doctorId,
        status,
        rejectionReason: status === 'rejected' ? String(rejectionReason).trim() : '',
        nextStep: status === 'shortlisted' ? String(nextStep).trim() : '',
      });
    }
    res.json({ message: 'Status updated', job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    const job = await Job.findOneAndDelete({ _id: req.params.id, hospitalId: req.user.id });
    if (!job) return res.status(404).json({ message: 'Job not found or unauthorized' });
    
    if (io) io.emit('jobDeleted', req.params.id);
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
