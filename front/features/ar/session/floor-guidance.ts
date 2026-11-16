/**
 * What to tell the user about finding the floor:
 * - `scan`: the floor height is still being learned;
 * - `scan-slow`: learning is taking long, usually low light or a plain, shiny floor;
 * - `blocked`: the floor is known but a wall or an object is in the way of the aim;
 * - `aim-floor`: the floor is known but the phone has pointed away from it for a while.
 */
export type XrFloorHint = 'none' | 'scan' | 'scan-slow' | 'blocked' | 'aim-floor';

export type FloorGuidanceConfig = Readonly<{ slowScanMs: number; aimDelayMs: number; blockedDelayMs: number }>;

export const DEFAULT_FLOOR_GUIDANCE: FloorGuidanceConfig = { slowScanMs: 8000, aimDelayMs: 1500, blockedDelayMs: 400 };

export type FloorGuidance = Readonly<{
  update: (input: Readonly<{ floorLocked: boolean; hasPoint: boolean; timeMs: number; blocked?: boolean }>) => XrFloorHint;
  /** Restarts the timers, e.g. when tracking is lost or the session is hidden. */
  reset: () => void;
}>;

/** A time heuristic only: it does not measure light or texture. */
export function createFloorGuidance(config: FloorGuidanceConfig = DEFAULT_FLOOR_GUIDANCE): FloorGuidance {
  let scanSince: number | null = null;
  let missingSince: number | null = null;
  let blockedSince: number | null = null;
  return {
    reset: () => { scanSince = null; missingSince = null; blockedSince = null; },
    update: ({ floorLocked, hasPoint, timeMs, blocked = false }) => {
      if (!floorLocked) {
        missingSince = null;
        blockedSince = null;
        scanSince ??= timeMs;
        return timeMs - scanSince >= config.slowScanMs ? 'scan-slow' : 'scan';
      }
      scanSince = null;
      if (hasPoint) { missingSince = null; blockedSince = null; return 'none'; }
      missingSince ??= timeMs;
      if (blocked) {
        blockedSince ??= timeMs;
        if (timeMs - blockedSince >= config.blockedDelayMs) return 'blocked';
      } else {
        blockedSince = null;
      }
      return timeMs - missingSince >= config.aimDelayMs ? 'aim-floor' : 'none';
    },
  };
}
