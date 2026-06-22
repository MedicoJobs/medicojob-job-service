import crypto from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.DYNAMODB_JOBS_TABLE || 'medicojobs-jobs';
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }), {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const clone = (value) => structuredClone(value);

const toIso = (value, fallback = null) => {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};

const normalizeApplication = (application = {}) => ({
  doctorId: application.doctorId,
  applicantName: application.applicantName || '',
  applicantEmail: application.applicantEmail || '',
  applicantSpecialization: application.applicantSpecialization || '',
  resumeAnalysis: application.resumeAnalysis || null,
  resumeScore: application.resumeScore === undefined ? null : application.resumeScore,
  resumeSeniority: application.resumeSeniority || '',
  recommendedRoles: Array.isArray(application.recommendedRoles) ? application.recommendedRoles : [],
  missingInformation: Array.isArray(application.missingInformation) ? application.missingInformation : [],
  status: application.status || 'applied',
  appliedAt: toIso(application.appliedAt, new Date().toISOString()),
  rejectionReason: application.rejectionReason || '',
  nextStep: application.nextStep || '',
  interview: {
    scheduledAt: toIso(application.interview?.scheduledAt),
    durationMinutes: Number(application.interview?.durationMinutes || 30),
    mode: application.interview?.mode || 'google_meet',
    meetLink: application.interview?.meetLink || '',
    calendarLink: application.interview?.calendarLink || '',
    location: application.interview?.location || '',
    notes: application.interview?.notes || '',
    reminderSentAt: toIso(application.interview?.reminderSentAt),
    completedAt: toIso(application.interview?.completedAt),
    expiredAt: toIso(application.interview?.expiredAt),
    expiredReason: application.interview?.expiredReason || '',
  },
  offer: {
    note: application.offer?.note || '',
    offeredAt: toIso(application.offer?.offeredAt),
    hiredAt: toIso(application.offer?.hiredAt),
  },
});

const normalizeJob = (data = {}) => {
  const now = new Date().toISOString();
  const id = data.id || data._id || crypto.randomUUID();

  return {
    id,
    _id: id,
    title: data.title,
    specialization: data.specialization,
    salary: Number(data.salary || 0),
    location: data.location,
    hospitalName: data.hospitalName || '',
    experienceRequired: data.experienceRequired || '',
    latitude: data.latitude === undefined || data.latitude === '' ? null : Number(data.latitude),
    longitude: data.longitude === undefined || data.longitude === '' ? null : Number(data.longitude),
    hospitalId: data.hospitalId,
    type: data.type,
    status: data.status || 'open',
    expiryDate: toIso(data.expiryDate),
    description: data.description || '',
    requirements: data.requirements || '',
    applications: Array.isArray(data.applications) ? data.applications.map(normalizeApplication) : [],
    createdAt: toIso(data.createdAt, now),
    updatedAt: now,
  };
};

const matchesValue = (actual, expected) => {
  if (expected && typeof expected === 'object' && '$regex' in expected) {
    return new RegExp(expected.$regex, expected.$options || '').test(String(actual || ''));
  }

  if (expected && typeof expected === 'object' && '$gte' in expected) {
    return Number(actual) >= Number(expected.$gte);
  }

  return actual === expected;
};

const matchesQuery = (job, query = {}) => Object.entries(query).every(([key, expected]) => {
  if (key === '_id') return matchesValue(job.id, expected);

  if (key === 'applications.doctorId') {
    return job.applications.some((application) => application.doctorId === expected);
  }

  return matchesValue(job[key], expected);
});

const sortJobs = (jobs, sortSpec = {}) => {
  const [[field, direction] = []] = Object.entries(sortSpec);
  if (!field) return jobs;

  return [...jobs].sort((a, b) => {
    const left = a[field] || '';
    const right = b[field] || '';
    return direction < 0 ? String(right).localeCompare(String(left)) : String(left).localeCompare(String(right));
  });
};

class Job {
  constructor(data = {}) {
    Object.assign(this, normalizeJob(data));
  }

  static fromItem(item) {
    return item ? new Job(item) : null;
  }

  static async scanAll() {
    const items = [];
    let exclusiveStartKey;

    do {
      const result = await client.send(new ScanCommand({
        TableName: TABLE_NAME,
        ExclusiveStartKey: exclusiveStartKey,
      }));
      items.push(...(result.Items || []));
      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return items.map(Job.fromItem);
  }

  static find(query = {}) {
    const promise = Job.scanAll().then((jobs) => jobs.filter((job) => matchesQuery(job, query)));
    return {
      sort(sortSpec) {
        return promise.then((jobs) => sortJobs(jobs, sortSpec));
      },
      then(resolve, reject) {
        return promise.then(resolve, reject);
      },
      catch(reject) {
        return promise.catch(reject);
      },
    };
  }

  static async findOne(query = {}) {
    const jobs = await Job.scanAll();
    return jobs.find((job) => matchesQuery(job, query)) || null;
  }

  static async findById(id) {
    const result = await client.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: String(id) },
    }));

    return Job.fromItem(result.Item);
  }

  static async findOneAndUpdate(query = {}) {
    return Job.findOne(query);
  }

  static async findOneAndDelete(query = {}) {
    const job = await Job.findOne(query);
    if (!job) return null;

    await client.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { id: job.id },
    }));

    return job;
  }

  static async updateMany(query = {}, update = {}) {
    const jobs = await Job.scanAll();
    const matchingJobs = jobs.filter((job) => matchesQuery(job, query));

    await Promise.all(matchingJobs.map(async (job) => {
      Object.assign(job, update.$set || update);
      await job.save();
    }));

    return { modifiedCount: matchingJobs.length };
  }

  async save() {
    const item = normalizeJob({
      ...clone(this),
      id: this.id,
      createdAt: this.createdAt,
    });

    await client.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }));

    Object.assign(this, item);
    return this;
  }

  toJSON() {
    return normalizeJob(this);
  }
}

export default Job;
