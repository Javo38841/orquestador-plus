import es from '../../../locales/es.json';
import { REMINDER_LATE_AFTER_MS } from '../../shared/reminders';

export interface ReminderNotification {
  title: string;
  body: string;
}

/** Builds the notification of a fired reminder; the text comes from `locales/es.json` (RNF-16). */
export function buildReminderNotification(
  task: { title: string; reminderAt: string },
  firedAt: Date,
  reminderInstant: Date,
): ReminderNotification {
  const late = firedAt.getTime() - reminderInstant.getTime() > REMINDER_LATE_AFTER_MS;
  const texts = es.reminders.notification;
  const time = task.reminderAt.slice(11, 16);
  const date = task.reminderAt.slice(0, 10);
  return {
    title: task.title,
    body: (late ? texts.late : texts.body).replace('{{date}}', date).replace('{{time}}', time),
  };
}
