import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema({
  doctorId: { type: String, required: true },
  applicantName: { type: String, default: '' },
  applicantEmail: { type: String, default: '' },
  applicantSpecialization: { type: String, default: '' },
  resumeAnalysis: { type: mongoose.Schema.Types.Mixed, default: null },
  resumeScore: { type: Number, default: null },
  resumeSeniority: { type: String, default: '' },
  recommendedRoles: [{ type: String }],
  missingInformation: [{ type: String }],
  status: {
    type: String,
    enum: ['applied', 'screening', 'shortlisted', 'interview_scheduled', 'interview_completed', 'offer', 'hired', 'joined', 'rejected'],
    default: 'applied'
  },
  appliedAt: { type: Date, default: Date.now },
  rejectionReason: { type: String, default: '' },
  nextStep: { type: String, default: '' },
  interview: {
    scheduledAt: { type: Date },
    durationMinutes: { type: Number, default: 30 },
    mode: { type: String, enum: ['google_meet', 'phone', 'in_person'], default: 'google_meet' },
    meetLink: { type: String, default: '' },
    calendarLink: { type: String, default: '' },
    location: { type: String, default: '' },
    notes: { type: String, default: '' },
    reminderSentAt: { type: Date },
    completedAt: { type: Date },
    expiredAt: { type: Date },
    expiredReason: { type: String, default: '' },
  },
  offer: {
    note: { type: String, default: '' },
    offeredAt: { type: Date },
    hiredAt: { type: Date },
  }
});

const jobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  specialization: { type: String, required: true },
  salary: { type: Number, required: true },
  location: { type: String, required: true },
  hospitalName: { type: String, default: '' },
  experienceRequired: { type: String, default: '' },
  latitude: { type: Number },
  longitude: { type: Number },
  hospitalId: { type: String, required: true },
  type: { type: String, enum: ['full-time', 'part-time', 'emergency'], required: true },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  expiryDate: { type: Date, required: true },
  description: { type: String, default: '' },
  requirements: { type: String, default: '' },
  applications: [applicationSchema]
}, { timestamps: true });

// Indexes for fast querying
jobSchema.index({ specialization: 1 });
jobSchema.index({ location: 1 });
jobSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Job', jobSchema);
