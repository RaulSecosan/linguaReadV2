// Deferred words return after at most three other cards; they never leave the session.
export function advanceReviewQueue(queue, currentId, later = false) {
  const next = [...new Set(queue)].filter((id) => id !== currentId);
  if (later) next.splice(Math.min(3, next.length), 0, currentId);
  return next;
}
