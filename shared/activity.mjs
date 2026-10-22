export function applyActivity(coach, date, type, payload = {}) {
  coach.dailyActivity ||= {};
  coach.dailyActivity[date] = normalizeActivity(coach.dailyActivity[date]);
  const activity = coach.dailyActivity[date];
  activity.updatedAt = new Date().toISOString();
  if (type === "reading") {
    activity.readingMinutes += Math.max(0, Number(payload.readingMinutes) || 0);
    activity.pagesRead += Math.max(0, Number(payload.pagesRead) || 0);
    if (payload.bookId) {
      activity.books[payload.bookId] ||= { title: payload.bookTitle || "Carte", pagesRead: 0 };
      activity.books[payload.bookId].title = payload.bookTitle || activity.books[payload.bookId].title;
      activity.books[payload.bookId].pagesRead += Math.max(0, Number(payload.pagesRead) || 0);
    }
  }
  if (type === "quiz") {
    activity.quizzesCompleted += 1;
    activity.quizScoreTotal += Math.max(0, Number(payload.score) || 0);
    activity.quizQuestionTotal += Math.max(0, Number(payload.totalQuestions) || 0);
    activity.lastQuiz = {
      bookTitle: payload.bookTitle || "",
      chapterTitle: payload.chapterTitle || "",
      score: Math.max(0, Number(payload.score) || 0),
      totalQuestions: Math.max(0, Number(payload.totalQuestions) || 0),
    };
  }
  if (type === "vocabulary") {
    activity.vocabularyPracticed += Math.max(1, Number(payload.count) || 1);
  }
  if (type === "task") {
    activity.tasksCompleted += 1;
    activity.taskTypes ||= {};
    activity.taskTypes[payload.taskType || payload.taskId || "other"] =
      (activity.taskTypes[payload.taskType || payload.taskId || "other"] || 0) + 1;
  }
}

export function normalizeActivity(activity) {
  return {
    readingMinutes: Number(activity?.readingMinutes) || 0,
    pagesRead: Number(activity?.pagesRead) || 0,
    quizzesCompleted: Number(activity?.quizzesCompleted) || 0,
    quizScoreTotal: Number(activity?.quizScoreTotal) || 0,
    quizQuestionTotal: Number(activity?.quizQuestionTotal) || 0,
    vocabularyPracticed: Number(activity?.vocabularyPracticed) || 0,
    tasksCompleted: Number(activity?.tasksCompleted) || 0,
    books: activity?.books && typeof activity.books === "object" ? activity.books : {},
    taskTypes: activity?.taskTypes && typeof activity.taskTypes === "object" ? activity.taskTypes : {},
    lastQuiz: activity?.lastQuiz && typeof activity.lastQuiz === "object" ? activity.lastQuiz : null,
    updatedAt: activity?.updatedAt || "",
  };
}

export function hasAnyActivity(activity) {
  return activity.readingMinutes > 0
    || activity.pagesRead > 0
    || activity.quizzesCompleted > 0
    || activity.vocabularyPracticed > 0
    || activity.tasksCompleted > 0;
}
