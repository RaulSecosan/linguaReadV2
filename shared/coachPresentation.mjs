// Older Worker responses used strings and {activity,time}; adapt them on read.
// Nothing here migrates, overwrites, or discards the saved response.
export function normalizeCoach(input = {}) {
  const plan = (Array.isArray(input.plan) ? input.plan : []).map((item, index) => {
    const value = typeof item === "string" ? { activity: item } : item || {};
    return {
      ...value,
      title: value.title || value.activity || `Activitatea ${index + 1}`,
      detail: value.detail || (value.time ? `Ora recomandata: ${value.time}` : ""),
      minutes: value.minutes != null && Number.isFinite(Number(value.minutes)) ? Math.max(1, Number(value.minutes)) : null,
    };
  });
  const normalizeCard = (item) => typeof item === "string" ? { title: item, detail: "", score: null } : {
    ...item, score: typeof item?.score === "number" ? item.score : null,
  };
  const target = Number(input.dailyTarget);
  const inferred = typeof input.dailyTarget === "string" ? input.dailyTarget.match(/(?:învață|invata|learn)\s+(\d+)\s+(?:cuvinte|words)/i) : null;
  return {
    ...input, plan,
    dailyTarget: Number.isFinite(target) && target > 0 ? target : inferred ? Number(inferred[1]) : 10,
    dailyTargetDescription: typeof input.dailyTarget === "string" && !Number.isFinite(target) ? input.dailyTarget : "",
    focusAreas: (Array.isArray(input.focusAreas) ? input.focusAreas : []).map(normalizeCard),
    recommendations: (Array.isArray(input.recommendations) ? input.recommendations : []).map(normalizeCard),
  };
}
