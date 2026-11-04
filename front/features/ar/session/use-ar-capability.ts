'use client';

import { useEffect, useState } from 'react';
import { detectArCapability, type ArCapability, type ArCapabilityStatus } from './ar-capability.ts';

export type ArCapabilityState = Readonly<{
  status: ArCapabilityStatus | 'checking';
  reason?: string;
}>;

/** Starts as `checking` on server and client, so it is safe during hydration. */
export function useArCapability(): ArCapabilityState {
  const [capability, setCapability] = useState<ArCapabilityState>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    void detectArCapability().then((result: ArCapability) => {
      if (!cancelled) setCapability(result);
    });
    return () => { cancelled = true; };
  }, []);

  return capability;
}
