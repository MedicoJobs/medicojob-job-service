import Job from '../models/Job.js';
import { createCalendarLink, createGoogleMeetLink, sendInterviewNotification } from '../utils/interviewScheduling.js';
let io;

export const setIo = (socketIo) => { io = socketIo; };

const expireInterviewLink = (application, reason) => {
  if (!application?.interview) return;
  application.interview.meetLink = '';
  application.interview.expiredAt = new Date();
  application.interview.expiredReason = reason;
};

export const createJob = async (req, res) => {
  try {
    const normalizedTitle = req.body.title?.trim();
    const normalizedLocation = req.body.location?.trim();
    const normalizedHospitalName = req.body.hospitalName?.trim();
    const normalizedExperienceRequired = req.body.experienceRequired?.trim();
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
      hospitalName: normalizedHospitalName || '',
      experienceRequired: normalizedExperienceRequired || '',
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

export const getJobs = async (req, res) => {
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
    if (req.query.hospitalName) query.hospitalName = { $regex: req.query.hospitalName.trim(), $options: 'i' };
    if (req.query.experienceRequired) query.experienceRequired = { $regex: req.query.experienceRequired.trim(), $options: 'i' };
    if (salary) query.salary = { $gte: Number(salary) };
    if (type) query.type = type;

    const jobs = await Job.find(query).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getJobById = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /jobs/my-applications — returns all jobs a doctor has applied to
export const getMyApplications = async (req, res) => {
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
        interview: application?.interview || null,
        offer: application?.offer || null,
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const applyForJob = async (req, res) => {
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
      resumeAnalysis: req.body.resumeAnalysis || null,
      resumeScore: Number.isFinite(Number(req.body.resumeScore)) ? Number(req.body.resumeScore) : req.body.resumeAnalysis?.resume_score ?? null,
      resumeSeniority: req.body.resumeSeniority || req.body.resumeAnalysis?.seniority_level || '',
      recommendedRoles: Array.isArray(req.body.recommendedRoles) ? req.body.recommendedRoles : req.body.resumeAnalysis?.recommended_roles || [],
      missingInformation: Array.isArray(req.body.missingInformation) ? req.body.missingInformation : req.body.resumeAnalysis?.missing_information || [],
    });
    await job.save();
    if (io) io.emit('applicationUpdate', { jobId: job._id, doctorId: req.user.id, status: 'applied' });
    res.status(200).json({ message: 'Application submitted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateApplicationStatus = async (req, res) => {
  try {
    const { jobId, doctorId } = req.params;
    const { status, rejectionReason = '', nextStep = '' } = req.body;

    if (!['screening', 'shortlisted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be screening, shortlisted, or rejected' });
    }

    if (status === 'rejected' && !String(rejectionReason).trim()) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    if (status === 'shortlisted' && !String(nextStep).trim()) {
      return res.status(400).json({ message: 'Next step is required when shortlisting an applicant' });
    }

    const job = await Job.findOneAndUpdate(
      { _id: jobId, hospitalId: req.user.id, 'applications.doctorId': doctorId }
    );
    if (!job) return res.status(404).json({ message: 'Job or application not found' });
    const application = job.applications.find(app => app.doctorId === doctorId);
    application.status = status;
    application.rejectionReason = status === 'rejected' ? String(rejectionReason).trim() : '';
    application.nextStep = status === 'shortlisted' ? String(nextStep).trim() : status === 'screening' ? 'Application moved to screening.' : '';
    if (status === 'rejected') {
      expireInterviewLink(application, 'Application rejected');
    }
    await job.save();

    if (io) {
      io.emit('applicationUpdate', {
        jobId,
        doctorId,
        status,
        rejectionReason: status === 'rejected' ? String(rejectionReason).trim() : '',
          nextStep: application.nextStep,
      });
    }
    res.json({ message: 'Status updated', job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const scheduleInterview = async (req, res) => {
  try {
    const { jobId, doctorId } = req.params;
    const {
      scheduledAt,
      durationMinutes = 30,
      mode = 'google_meet',
      location = '',
      notes = '',
    } = req.body;

    const start = new Date(scheduledAt);
    if (Number.isNaN(start.getTime()) || start <= new Date()) {
      return res.status(400).json({ message: 'Interview date/time must be in the future' });
    }

    const job = await Job.findOne({ _id: jobId, hospitalId: req.user.id, 'applications.doctorId': doctorId });
    if (!job) return res.status(404).json({ message: 'Job or application not found' });

    const application = job.applications.find(app => app.doctorId === doctorId);
    if (!application || !['shortlisted', 'interview_scheduled'].includes(application.status)) {
      return res.status(400).json({ message: 'Candidate must be shortlisted before scheduling interview' });
    }

    const meetLink = mode === 'google_meet' ? createGoogleMeetLink() : '';
    const calendarLocation = mode === 'google_meet' ? meetLink : location;
    const title = `Interview: ${job.title}`;
    const details = [
      `Position: ${job.title}`,
      `Specialization: ${job.specialization}`,
      notes ? `Notes: ${notes}` : '',
      meetLink ? `Video Meeting: ${meetLink}` : '',
    ].filter(Boolean).join('\n');
    const calendarLink = createCalendarLink({
      title,
      details,
      location: calendarLocation,
      startsAt: start,
      durationMinutes: Number(durationMinutes) || 30,
    });

    application.status = 'interview_scheduled';
    application.nextStep = `Interview scheduled for ${start.toLocaleString()}`;
    application.interview = {
      scheduledAt: start,
      durationMinutes: Number(durationMinutes) || 30,
      mode,
      meetLink,
      calendarLink,
      location,
      notes,
    };

    await job.save();

    const notification = await sendInterviewNotification({
      to: application.applicantEmail,
      subject: `Interview scheduled for ${job.title}`,
      message: [
        `Hi ${application.applicantName || 'Candidate'},`,
        '',
        `Your interview for ${job.title} has been scheduled.`,
        `Date & Time: ${start.toLocaleString()}`,
        `Duration: ${Number(durationMinutes) || 30} minutes`,
        meetLink ? `Video Meeting: ${meetLink}` : '',
        notes ? `Notes: ${notes}` : '',
        '',
        'Regards,',
        'MedicoJobs Team',
      ].filter(Boolean).join('\n'),
    });

    if (io) io.emit('applicationUpdate', { jobId, doctorId, status: application.status, interview: application.interview });
    res.json({ message: 'Interview scheduled', job, interview: application.interview, notification });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const completeInterview = async (req, res) => {
  try {
    const { jobId, doctorId } = req.params;
    const job = await Job.findOne({ _id: jobId, hospitalId: req.user.id, 'applications.doctorId': doctorId });
    if (!job) return res.status(404).json({ message: 'Job or application not found' });
    const application = job.applications.find(app => app.doctorId === doctorId);
    if (!application || application.status !== 'interview_scheduled') {
      return res.status(400).json({ message: 'Interview must be scheduled before it can be completed' });
    }
    application.status = 'interview_completed';
    application.nextStep = req.body.note || 'Interview completed. Awaiting hiring decision.';
    application.interview.completedAt = new Date();
    await job.save();
    if (io) io.emit('applicationUpdate', { jobId, doctorId, status: application.status });
    res.json({ message: 'Interview completed', job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const makeOffer = async (req, res) => {
  try {
    const { jobId, doctorId } = req.params;
    const note = String(req.body.note || '').trim();
    if (!note) return res.status(400).json({ message: 'Offer note is required' });
    const job = await Job.findOne({ _id: jobId, hospitalId: req.user.id, 'applications.doctorId': doctorId });
    if (!job) return res.status(404).json({ message: 'Job or application not found' });
    const application = job.applications.find(app => app.doctorId === doctorId);
    if (!application || application.status !== 'interview_completed') {
      return res.status(400).json({ message: 'Interview must be completed before offer' });
    }
    application.status = 'offer';
    application.nextStep = note;
    application.offer = { ...application.offer, note, offeredAt: new Date() };
    await job.save();
    await sendInterviewNotification({
      to: application.applicantEmail,
      subject: `Offer update for ${job.title}`,
      message: note,
    });
    if (io) io.emit('applicationUpdate', { jobId, doctorId, status: application.status });
    res.json({ message: 'Offer sent', job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const markHired = async (req, res) => {
  try {
    const { jobId, doctorId } = req.params;
    const job = await Job.findOne({ _id: jobId, hospitalId: req.user.id, 'applications.doctorId': doctorId });
    if (!job) return res.status(404).json({ message: 'Job or application not found' });
    const application = job.applications.find(app => app.doctorId === doctorId);
    if (!application || application.status !== 'offer') {
      return res.status(400).json({ message: 'Offer must be sent before hiring' });
    }
    application.status = 'joined';
    application.nextStep = req.body.note || 'Candidate joined.';
    application.offer = { ...application.offer, hiredAt: new Date() };
    expireInterviewLink(application, 'Candidate joined');
    await job.save();
    if (io) io.emit('applicationUpdate', { jobId, doctorId, status: application.status });
    res.json({ message: 'Candidate hired', job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteJob = async (req, res) => {
  try {
    const job = await Job.findOneAndDelete({ _id: req.params.id, hospitalId: req.user.id });
    if (!job) return res.status(404).json({ message: 'Job not found or unauthorized' });
    
    if (io) io.emit('jobDeleted', req.params.id);
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
