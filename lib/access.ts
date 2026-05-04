import { checkVideoCached } from './cache';
import type { FocusState } from './focus-context';
import {
  getActiveBlocks,
  isAppBlockedNow,
  minutesToTime,
  type ScheduleBlock,
} from './schedule';
import type { Classification, VideoData } from './youtube-filter';

export type AccessReason =
  | 'focus_off'
  | 'no_api_key'
  | 'fetch_failed'
  | 'not_found'
  | 'educational'
  | 'creator_allowance'
  | 'within_limits'
  | 'daily_limit'
  | 'channel_limit'
  | 'creator_count_limit'
  | 'assignments_required'
  | 'focus_session_active'
  | 'schedule_block'
  | 'schedule_window_limit';

export type AccessDetails = {
  dailyLimitMinutes?: number;
  entertainmentMinutesUsed?: number;
  channelLimitMinutes?: number;
  channelMinutesUsed?: number;
  channelLabel?: string;
  creatorAllowanceVideos?: number;
  creatorVideosUsed?: number;
  creatorName?: string;
  assignmentsRequired?: number;
  assignmentsCompleted?: number;
  focusRemainingSeconds?: number;
  focusAnchorTitle?: string;
  scheduleLabel?: string | null;
  scheduleEndsAtMinutes?: number;
  scheduleWindowLimit?: number;
  scheduleWindowUsed?: number;
};

export type AccessDecision = {
  allowed: boolean;
  reason: AccessReason;
  classification?: Classification;
  video?: VideoData;
  details?: AccessDetails;
  error?: string;
};

export type FocusSessionContext = {
  active: boolean;
  remainingSeconds?: number;
  anchorTitle?: string;
};

export async function decideAccess(
  videoId: string,
  state: FocusState,
  completedAssignmentsToday: number = 0,
  focusSession: FocusSessionContext = { active: false },
  scheduleBlocks: ScheduleBlock[] = []
): Promise<AccessDecision> {
  if (!state.focusModeEnabled) {
    return { allowed: true, reason: 'focus_off' };
  }

  // Schedule block: parent's recurring time-window rule for YouTube.
  //   limitMinutes === null → fully blocked (no YouTube, even educational)
  //   limitMinutes >  0     → entertainment cap during this window;
  //                            educational still passes
  const activeYtBlock = getActiveBlocks(scheduleBlocks).find(
    (b) => b.blockedApps.includes('youtube') || b.blockedApps.includes('all'),
  );

  if (activeYtBlock && (activeYtBlock.limitMinutes === null || activeYtBlock.limitMinutes <= 0)) {
    return {
      allowed: false,
      reason: 'schedule_block',
      details: {
        scheduleLabel: activeYtBlock.label ?? null,
        scheduleEndsAtMinutes: activeYtBlock.endMinutes,
      },
    };
  }

  const result = await checkVideoCached(videoId, {
    apiKey: state.apiKey,
    educationalChannels: state.educationalChannels,
    educationalKeywords: state.educationalKeywords,
    entertainmentKeywords: state.entertainmentKeywords,
  });

  if (!result.ok) {
    if (result.reason === 'missing_api_key') return { allowed: true, reason: 'no_api_key' };
    if (result.reason === 'not_found') return { allowed: false, reason: 'not_found' };
    return { allowed: true, reason: 'fetch_failed', error: result.error };
  }

  const { video, classification } = result;

  if (classification.isEducational) {
    return { allowed: true, reason: 'educational', classification, video };
  }

  // Active focus session locks all entertainment for its duration; educational
  // (above) still passes so kids can use the app for actual research/study.
  if (focusSession.active) {
    return {
      allowed: false,
      reason: 'focus_session_active',
      classification,
      video,
      details: {
        focusRemainingSeconds: focusSession.remainingSeconds,
        focusAnchorTitle: focusSession.anchorTitle,
      },
    };
  }

  // Lock entertainment behind assignment completion if the parent enabled it.
  // Educational content stays allowed (above); only entertainment is gated.
  if (
    state.lockUntilAssignmentsComplete &&
    completedAssignmentsToday < state.assignmentLockThreshold
  ) {
    return {
      allowed: false,
      reason: 'assignments_required',
      classification,
      video,
      details: {
        assignmentsRequired: state.assignmentLockThreshold,
        assignmentsCompleted: completedAssignmentsToday,
      },
    };
  }

  // Creator allowance — match by channelId (set when added via channel search)
  const allowance = state.creatorAllowances.find((c) => c.channelId === video.channelId);
  if (allowance) {
    const used = state.today.creatorVideoCount?.[video.channelId] ?? 0;
    // A video already in today's watched list was counted on first play — let it through.
    const alreadyStarted = state.today.watchedVideoIds.includes(video.id);
    const details: AccessDetails = {
      creatorName: allowance.name,
      creatorAllowanceVideos: allowance.dailyVideoLimit,
      creatorVideosUsed: used,
    };
    if (!alreadyStarted && used >= allowance.dailyVideoLimit) {
      return { allowed: false, reason: 'creator_count_limit', classification, video, details };
    }
    return { allowed: true, reason: 'creator_allowance', classification, video, details };
  }

  // Daily entertainment time limit (with optional override). If a limited
  // schedule window is active for YouTube, its limit_minutes overrides the
  // daily cap during the window — usually a tighter restriction (e.g. 15 min
  // during school hours).
  const overrideMinutes =
    state.allowOverride && state.override && state.override.expiresAt > Date.now()
      ? state.override.minutesAdded
      : 0;
  const baseDailyCap = state.dailyLimitMinutes + overrideMinutes;
  const entertainmentMinutesUsed = Math.floor(state.today.entertainmentSeconds / 60);

  if (activeYtBlock && activeYtBlock.limitMinutes !== null && activeYtBlock.limitMinutes > 0) {
    const windowCap = activeYtBlock.limitMinutes;
    if (entertainmentMinutesUsed >= windowCap) {
      return {
        allowed: false,
        reason: 'schedule_window_limit',
        classification,
        video,
        details: {
          scheduleLabel: activeYtBlock.label ?? null,
          scheduleEndsAtMinutes: activeYtBlock.endMinutes,
          scheduleWindowLimit: windowCap,
          scheduleWindowUsed: entertainmentMinutesUsed,
        },
      };
    }
  } else if (state.today.entertainmentSeconds >= baseDailyCap * 60) {
    return {
      allowed: false,
      reason: 'daily_limit',
      classification,
      video,
      details: { dailyLimitMinutes: baseDailyCap, entertainmentMinutesUsed },
    };
  }

  // Per-channel cap
  const channelLimit = state.channelLimits[video.channelId];
  if (channelLimit) {
    const channelUsed = state.today.channelTime[video.channelId]?.seconds ?? 0;
    const channelMinutesUsed = Math.floor(channelUsed / 60);
    if (channelUsed >= channelLimit.minutes * 60) {
      return {
        allowed: false,
        reason: 'channel_limit',
        classification,
        video,
        details: {
          channelLabel: channelLimit.name,
          channelLimitMinutes: channelLimit.minutes,
          channelMinutesUsed,
        },
      };
    }
  }

  const effectiveCap =
    activeYtBlock && activeYtBlock.limitMinutes !== null && activeYtBlock.limitMinutes > 0
      ? activeYtBlock.limitMinutes
      : baseDailyCap;
  return {
    allowed: true,
    reason: 'within_limits',
    classification,
    video,
    details: { dailyLimitMinutes: effectiveCap, entertainmentMinutesUsed },
  };
}

export function describeDecision(d: AccessDecision): { headline: string; detail: string } {
  switch (d.reason) {
    case 'focus_off':
      return { headline: 'Allowed', detail: 'Focus Mode is off — filtering disabled.' };
    case 'no_api_key':
      return { headline: 'Allowed', detail: 'No API key configured. Filtering can\'t verify videos.' };
    case 'fetch_failed':
      return { headline: 'Allowed', detail: `Couldn't reach YouTube API${d.error ? ` (${d.error})` : ''} — letting through.` };
    case 'not_found':
      return { headline: 'Blocked', detail: 'Video not found on YouTube.' };
    case 'educational':
      return { headline: 'Allowed', detail: `Educational content (${d.classification?.reason}).` };
    case 'creator_allowance': {
      const used = d.details?.creatorVideosUsed ?? 0;
      const limit = d.details?.creatorAllowanceVideos ?? 0;
      return {
        headline: 'Allowed',
        detail: `Approved creator (${d.details?.creatorName}) — ${used} of ${limit} watched today.`,
      };
    }
    case 'within_limits': {
      const used = d.details?.entertainmentMinutesUsed ?? 0;
      const limit = d.details?.dailyLimitMinutes ?? 0;
      return { headline: 'Allowed', detail: `Within entertainment limit (${used}m of ${limit}m used today).` };
    }
    case 'creator_count_limit': {
      const used = d.details?.creatorVideosUsed ?? 0;
      const limit = d.details?.creatorAllowanceVideos ?? 0;
      return {
        headline: 'Blocked',
        detail: `Creator allowance hit — ${used} of ${limit} videos from ${d.details?.creatorName} watched today.`,
      };
    }
    case 'daily_limit': {
      const used = d.details?.entertainmentMinutesUsed ?? 0;
      const limit = d.details?.dailyLimitMinutes ?? 0;
      return { headline: 'Blocked', detail: `Daily entertainment limit hit (${used}m of ${limit}m).` };
    }
    case 'channel_limit': {
      const used = d.details?.channelMinutesUsed ?? 0;
      const limit = d.details?.channelLimitMinutes ?? 0;
      return {
        headline: 'Blocked',
        detail: `Channel cap hit for ${d.details?.channelLabel} (${used}m of ${limit}m).`,
      };
    }
    case 'assignments_required': {
      const done = d.details?.assignmentsCompleted ?? 0;
      const need = d.details?.assignmentsRequired ?? 0;
      const remaining = Math.max(0, need - done);
      return {
        headline: 'Finish your work first',
        detail: `Complete ${remaining} more ${remaining === 1 ? 'assignment' : 'assignments'} (${done} of ${need} done) to unlock entertainment.`,
      };
    }
    case 'focus_session_active': {
      const secs = d.details?.focusRemainingSeconds ?? 0;
      const mm = Math.floor(secs / 60);
      const ss = secs % 60;
      const remaining = secs > 60 ? `${mm} min` : `${mm}:${String(ss).padStart(2, '0')}`;
      const anchor = d.details?.focusAnchorTitle;
      return {
        headline: 'Stay focused',
        detail: anchor
          ? `${remaining} left in your focus session on "${anchor}". Entertainment unlocks when the timer ends or you stop the session.`
          : `${remaining} left in your focus session. Entertainment unlocks when the timer ends or you stop the session.`,
      };
    }
    case 'schedule_block': {
      const label = d.details?.scheduleLabel;
      const endMin = d.details?.scheduleEndsAtMinutes;
      const endStr = endMin !== undefined ? minutesToTime(endMin) : 'later today';
      return {
        headline: label ?? 'Blocked',
        detail: `Entertainment is blocked by your parent's schedule. Unblocks at ${endStr}.`,
      };
    }
    case 'schedule_window_limit': {
      const label = d.details?.scheduleLabel;
      const used = d.details?.scheduleWindowUsed ?? 0;
      const cap = d.details?.scheduleWindowLimit ?? 0;
      const endMin = d.details?.scheduleEndsAtMinutes;
      const endStr = endMin !== undefined ? minutesToTime(endMin) : 'later today';
      return {
        headline: label ? `${label} cap reached` : 'Window cap reached',
        detail: `Used ${used} of ${cap} min for this window. Daily cap resets after ${endStr}.`,
      };
    }
  }
}
