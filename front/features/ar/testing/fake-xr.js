// Injected before page scripts. Records every WebXR call a page makes, in order.
(() => {
  const log = [];
  let frameCalls = null;
  const rec = (name) => { (frameCalls ?? log).push(name); };
  const ctl = {
    log,
    pose: true,
    hit: { x: 1, y: 0, z: 1 },
    domOverlay: window.__xrConfig?.domOverlay ?? true,
    session: null,
    frames: 0,
  };
  window.__xr = ctl;

  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const projection = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.002, -1, 0, 0, -0.2, 0]);
  const transform = { position: { x: 0, y: 1.5, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 }, matrix: identity, inverse: { matrix: identity } };

  class FakeSession extends EventTarget {
    constructor(mode, options) {
      super();
      this.mode = mode;
      this.visibilityState = 'visible';
      this.inputSources = [];
      this.renderState = {};
      this.enabledFeatures = ['hit-test', 'local-floor'];
      this.environmentBlendMode = 'alpha-blend';
      if (ctl.domOverlay && options.domOverlay) this.domOverlayState = { type: 'screen' };
      this.callbacks = new Map();
      this.nextHandle = 1;
      this.ended = false;
      this.tick = setInterval(() => this.runFrame(), 16);
    }
    addEventListener(type, listener, opts) { rec(`session.addEventListener(${type})`); super.addEventListener(type, listener, opts); }
    removeEventListener(type, listener, opts) { rec(`session.removeEventListener(${type})`); super.removeEventListener(type, listener, opts); }
    async requestReferenceSpace(type) { rec(`session.requestReferenceSpace(${type})`); return { type, addEventListener() {}, removeEventListener() {}, getOffsetReferenceSpace() { return this; } }; }
    async requestHitTestSource(options) { rec(`session.requestHitTestSource(${options.space?.type})`); return { cancel() { rec('hitTestSource.cancel'); } }; }
    updateRenderState(state) { rec(`session.updateRenderState(${Object.keys(state).sort().join(',')})`); Object.assign(this.renderState, state); }
    updateTargetFrameRate() { return Promise.resolve(); }
    requestAnimationFrame(callback) { const handle = this.nextHandle++; this.callbacks.set(handle, callback); return handle; }
    cancelAnimationFrame(handle) { this.callbacks.delete(handle); }
    async end() {
      rec('session.end');
      if (this.ended) return;
      this.ended = true;
      clearInterval(this.tick);
      this.dispatchEvent(new Event('end'));
    }
    setVisibility(state) { this.visibilityState = state; this.dispatchEvent(new Event('visibilitychange')); }
    runFrame() {
      const callbacks = [...this.callbacks.values()];
      this.callbacks.clear();
      if (!callbacks.length) return;
      const session = this;
      const frame = {
        session,
        getViewerPose() { rec('getViewerPose'); return ctl.pose ? { transform, views: [{ eye: 'none', transform, projectionMatrix: projection }] } : null; },
        getPose() { return null; },
        getHitTestResults() {
          rec('getHitTestResults');
          return ctl.hit ? [{ getPose: () => ({ transform: { position: ctl.hit, orientation: { x: 0, y: 0, z: 0, w: 1 } } }) }] : [];
        },
        detectedPlanes: undefined,
      };
      frameCalls = [];
      for (const callback of callbacks) callback(performance.now(), frame);
      const signature = `frame[${frameCalls.join(',')}]`;
      frameCalls = null;
      ctl.frames += 1;
      if (log[log.length - 1] !== signature) log.push(signature);
    }
  }

  window.XRWebGLLayer = class {
    constructor(session, gl, options) {
      rec(`new XRWebGLLayer(${Object.keys(options ?? {}).sort().join(',')})`);
      this.framebuffer = null; this.framebufferWidth = 64; this.framebufferHeight = 64; this.antialias = false; this.ignoreDepthValues = false;
    }
    getViewport() { return { x: 0, y: 0, width: 64, height: 64 }; }
  };
  window.XRSession = FakeSession;

  for (const proto of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) {
    if (!proto) continue;
    proto.makeXRCompatible = async function makeXRCompatible() { rec('gl.makeXRCompatible'); };
    const clear = proto.clear;
    proto.clear = function patchedClear(mask) { if (frameCalls) frameCalls.push('render'); return clear.call(this, mask); };
  }

  Object.defineProperty(Navigator.prototype, 'xr', {
    configurable: true,
    value: {
      addEventListener() {}, removeEventListener() {},
      async isSessionSupported(mode) { rec(`xr.isSessionSupported(${mode})`); return window.__xrConfig?.supported ?? true; },
      requestSession(mode, options) {
        rec(`xr.requestSession(${mode},${JSON.stringify({ required: options.requiredFeatures, optional: options.optionalFeatures, overlay: Boolean(options.domOverlay) })},activation=${navigator.userActivation?.isActive})`);
        ctl.session = new FakeSession(mode, options);
        return Promise.resolve(ctl.session);
      },
    },
  });
})();
