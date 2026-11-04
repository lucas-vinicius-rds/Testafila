export type ArCapabilityStatus = 'supported' | 'unsupported' | 'no-webxr' | 'insecure' | 'error';

export type ArCapability = Readonly<{
  status: ArCapabilityStatus;
  /** Only set for `error`, when the browser gave a message. */
  reason?: string;
}>;

type ArEnvironment = Readonly<{
  isSecureContext: boolean;
  xr?: Pick<XRSystem, 'isSessionSupported'>;
}>;

function browserEnvironment(): ArEnvironment {
  return { isSecureContext: window.isSecureContext, xr: navigator.xr };
}

/**
 * Asks the browser whether it offers `immersive-ar`. This is the only supported
 * way to decide: never branch on the user agent. `supported` is what the browser
 * announces; the features are only negotiated when a session is requested.
 */
export async function detectArCapability(environment: ArEnvironment = browserEnvironment()): Promise<ArCapability> {
  if (!environment.isSecureContext) return { status: 'insecure' };
  if (!environment.xr) return { status: 'no-webxr' };
  try {
    const supported = await environment.xr.isSessionSupported('immersive-ar');
    return { status: supported ? 'supported' : 'unsupported' };
  } catch (cause) {
    return cause instanceof Error ? { status: 'error', reason: cause.message } : { status: 'error' };
  }
}
