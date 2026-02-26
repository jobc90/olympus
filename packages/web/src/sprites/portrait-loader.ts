// Portrait loader — loads pre-generated portrait PNGs for card UI rendering.
// Portraits are extracted from sprite sheets by scripts/generate-portraits.mjs.

const _portraitCache = new Map<string, HTMLImageElement>();
const _portraitLoading = new Map<string, Promise<HTMLImageElement>>();

export function getPortrait(avatar: string): HTMLImageElement | null {
  return _portraitCache.get(avatar) ?? null;
}

export function preloadPortraits(avatars: string[]): Promise<void> {
  const promises = avatars.map(avatar => loadPortrait(avatar));
  return Promise.all(promises).then(() => {});
}

function loadPortrait(avatar: string): Promise<HTMLImageElement> {
  const cached = _portraitLoading.get(avatar);
  if (cached) return cached;

  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      _portraitCache.set(avatar, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = `/portraits/${avatar}.png`;
  });
  _portraitLoading.set(avatar, p);
  return p;
}
