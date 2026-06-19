import crypto from 'crypto';
import nodemailer from 'nodemailer';

const formatGoogleDate = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export const createGoogleMeetLink = () => {
  const roomId = crypto.randomBytes(12).toString('hex');
  return `https://meet.jit.si/medicojobs-${roomId}`;
};

export const createCalendarLink = ({ title, details, location, startsAt, durationMinutes }) => {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${formatGoogleDate(start)}/${formatGoogleDate(end)}`,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

export const sendInterviewNotification = async ({ to, subject, message }) => {
  if (!to) return { sent: false, reason: 'missing-recipient' };

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('[MAIL:DRY_RUN]', { to, subject, message });
    return { sent: false, reason: 'smtp-not-configured' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"MedicoJobs" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: message,
    });

    return { sent: true };
  } catch (error) {
    console.error('[MAIL:FAILED]', { to, subject, error: error.message });
    return { sent: false, reason: error.message };
  }
};
