import { normalizeActivity, hasAnyActivity } from './activity.mjs';
export function setCoachTask(coach, date, taskId, completed, now = new Date().toISOString()) {
  const record = coach.dailyProgress?.[date];
  const task = record?.tasks?.find((item) => item.id === taskId);
  if (!task) throw new Error('Task-ul zilnic nu a fost gasit.');
  const previous = Boolean(task.completed);
  task.completed = Boolean(completed);
  task.completedAt = task.completed ? (previous ? task.completedAt || now : now) : null;
  record.updatedAt = now;
  coach.dailyActivity ||= {};
  const activity = normalizeActivity(coach.dailyActivity[date]);
  activity.tasksCompleted = record.tasks.filter((item) => item.completed).length;
  activity.taskTypes = {};
  record.tasks.filter((item) => item.completed).forEach((item) => { const type = item.type || 'practice'; activity.taskTypes[type] = (activity.taskTypes[type] || 0) + 1; });
  activity.updatedAt = now;
  coach.dailyActivity[date] = activity;
  return coach;
}
export function dayProgress(record, activityInput) {
  const activity = normalizeActivity(activityInput);
  const completed = record?.tasks?.filter((task) => task.completed).length || 0;
  const total = record?.tasks?.length || 0;
  // Historical reading days remain visible even when no daily task list was saved.
  const activityPercent = Math.round((Math.min(1, activity.readingMinutes / 15) + Math.min(1, activity.vocabularyPracticed / 10) + Math.min(1, activity.quizzesCompleted)) * 100 / 3);
  return { completed, total, activity, hasActivity: hasAnyActivity(activity) || completed > 0, percent: total ? Math.round(completed * 100 / total) : activityPercent };
}
export function previewCoachTasks(coach, overrides) {
  if (!Object.keys(overrides).length || !coach.tracker?.today) return coach;
  const tracker = coach.tracker, date = tracker.today.date;
  const tasks = tracker.today.tasks.map((task) => Object.prototype.hasOwnProperty.call(overrides, task.id) ? { ...task, completed: overrides[task.id] } : task);
  const today = { ...tracker.today, tasks };
  const days = tracker.days.map((day) => day.date === date ? { ...day, ...dayProgress(today, day.activity) } : day);
  return { ...coach, tracker: { ...tracker, today, days, progressByDate: { ...tracker.progressByDate, [date]: today }, completedThisWeek: days.reduce((sum, day) => sum + day.completed, 0) } };
}
export function coachDateKey(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(date).map((part) => [part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function activityStreak(coach, today) {
  const active = (date) => hasAnyActivity(normalizeActivity(coach.dailyActivity?.[date])) || Boolean(coach.dailyProgress?.[date]?.tasks?.some((task) => task.completed));
  const cursor = new Date(`${today}T12:00:00Z`);
  const key = () => cursor.toISOString().slice(0,10);
  if (!active(key())) cursor.setUTCDate(cursor.getUTCDate()-1);
  let streak=0;
  while (active(key())) { streak++; cursor.setUTCDate(cursor.getUTCDate()-1); }
  return streak;
}
