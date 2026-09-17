// The procedural map rasterises sign text through a 2D canvas; give it the same
// no-op DOM the collider dump uses so it can build headless under vitest.
export function installHeadlessDom(): void {
  const noopContext = new Proxy({}, {
    get: (_target, key) => {
      if (key === "measureText") return () => ({ width: 1 });
      if (key === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      return () => undefined;
    },
    set: () => true,
  });
  const fakeElement = () => ({
    width: 1, height: 1, style: {},
    getContext: () => noopContext,
    toDataURL: () => "",
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    setAttribute: () => undefined,
    appendChild: () => undefined,
    set src(_value: string) { /* headless */ },
  });
  const g = globalThis as Record<string, unknown>;
  g.document ??= { createElement: fakeElement, createElementNS: fakeElement, body: { appendChild: () => undefined, removeChild: () => undefined } };
  g.window ??= { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, location: { search: "" }, addEventListener: () => undefined, removeEventListener: () => undefined };
  g.navigator ??= { userAgent: "node" };
  g.Image ??= class { set src(_value: string) { /* headless */ } addEventListener() { /* noop */ } };
}
