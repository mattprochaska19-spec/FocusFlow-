import { checkVideoCached } from './cache';
import type { FocusState } from './focus-context';
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
  | 'creator_count_limit';

export type AccessDetails = {
  dailyLimitMinutes?: number;
  entertainmentMinutesUsed?: number;
  channelLimitMinutes?: number;
  channelMinutesUsed?: number;
  channelLabel?: string;
  creatorAllowanceVideos?: number;
  creatorVideosUsed?: number;
  creatorName?: string;
};

export type AccessDecision = {
  allowed: boolean;
  reason: AccessReason;
  classification?: Classification;
  video?: VideoData;
  details?: AccessDetails;
  error?: string;
};

export async function decideAccess(videoId: string, state: FocusState): Promise<AccessDecision> {
  if (!state.focusModeEnabled) {
    return { allowed: true, reason: 'focus_off' };
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

  // Daily entertainment time limit (with optional override)
  const overrideMinutes =
    state.allowOverride && state.override && state.override.expiresAt > Date.now()
      ? state.override.minutesAdded
      : 0;
  const dailyLimitMinutes = state.dailyLimitMinutes + overrideMinutes;
  const entertainmentMinutesUsed = Math.floor(state.today.entertainmentSeconds / 60);
  if (state.today.entertainmentSeconds >= dailyLimitMinutes * 60) {
    return {
      allowed: false,
      reason: 'daily_limit',
      classification,
      video,
      details: { dailyLimitMinutes, entertainmentMinutesUsed },
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

  return {
    allowed: true,
    reason: 'within_limits',
    classification,
    video,
    details: { dailyLimitMinutes, entertainmentMinutesUsed },
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
  }
}
