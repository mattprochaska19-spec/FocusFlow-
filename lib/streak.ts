import type { QuestClaim } from './quests';

// Streak tracking based on parent-authored quest claims.
//
// Rule: a "streak day" is any local-calendar day where the kid has at least
// one quest claim that's NOT rejected. Pending claims count too — if the kid
// did the work, slow parent reviews shouldn't break their streak. (A rejected
// claim is the parent saying "no, you didn't actually do it" — that day doesn't
// count.)
//
// The streak is "alive" if today OR yesterday had qualifying activity. Today
// alone is sufficient; if today has nothing yet but yesterday did, the kid
// has until midnight to maintain. After yesterday with no further activity,
// the streak resets to 0.

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Pre-filter claims to a single child before passing in. Returns the number
// of consecutive days ending at today (or yesterday if today is empty).
export function computeStreak(claims: QuestClaim[]): number {
  // Build a set of qualifying day strings (YYYY-MM-DD, local time).
  const days = new Set<string>();
  for (const c of claims) {
    if (c.status === 'rejected') continue;
    days.add(formatLocalDate(new Date(c.claimedAt)));
  }
  if (days.size === 0) return 0;

  const today = formatLocalDate(new Date());
  const yesterday = formatLocalDate(new Date(Date.now() - 86_400_000));

  // Find the most recent qualifying day to start counting from. If neither
  // today nor yesterday qualifies, the streak is dead.
  let cursorDate: Date;
  if (days.has(today)) {
    cursorDate = new Date();
  } else if (days.has(yesterday)) {
    cursorDate = new Date(Date.now() - 86_400_000);
  } else {
    return 0;
  }

  let count = 0;
  while (days.has(formatLocalDate(cursorDate))) {
    count++;
    cursorDate.setDate(cursorDate.getDate() - 1);
  }
  return count;
}
