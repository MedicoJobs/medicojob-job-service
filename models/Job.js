const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  doctorId: { type: String, required: true },
  applicantName: { type: String, default: '' },
  applicantEmail: { type: String, default: '' },
  applicantSpecialization: { type: String, default: '' },
  status: { type: String, enum: ['applied', 'shortlisted', 'rejected'], default: 'applied' },
  appliedAt: { type: Date, default: Date.now },
  rejectionReason: { type: String, default: '' },
  nextStep: { type: String, default: '' }
});

const jobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  specialization: { type: String, required: true },
  salary: { type: Number, required: true },
  location: { type: String, required: true },
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

module.exports = mongoose.model('Job', jobSchema);
