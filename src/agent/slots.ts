// Posting slots are fixed times of day in UTC, e.g. "15:00,21:30".
export function parsePostTimes(list: string): { h: number; m: number }[] {
  const times = list.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(s);
    const h = Number(match?.[1]);
    const m = Number(match?.[2]);
    if (!match || h > 23 || m > 59) throw new Error(`Bad posting time "${s}". Use HH:MM in UTC, e.g. 15:00.`);
    return { h, m };
  });
  if (times.length === 0) throw new Error("AGENT_POST_TIMES_UTC needs at least one time.");
  return times.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
}

// Every future slot from now through the end of `days` days.
export function upcomingSlots(now: Date, days: number, postTimes: string): Date[] {
  const times = parsePostTimes(postTimes);
  const slots: Date[] = [];
  const startDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let d = 0; d <= days; d++) {
    for (const { h, m } of times) {
      const slot = new Date(startDay + d * 86_400_000 + (h * 60 + m) * 60_000);
      if (slot > now && slot.getTime() <= now.getTime() + days * 86_400_000) slots.push(slot);
    }
  }
  return slots;
}

// Slots that no planned, in-progress or posted video already holds.
export function freeSlots(slots: Date[], taken: Date[]): Date[] {
  const used = new Set(taken.map((t) => t.getTime()));
  return slots.filter((s) => !used.has(s.getTime()));
}
