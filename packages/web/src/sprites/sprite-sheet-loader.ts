// Sprite sheet loader — loads pixel-olympus-nobg/{Name}-Photoroom.png
// Full sprite sheet (1120×960) per character, pre-background-removed.

const _sheetCache = new Map<string, HTMLImageElement>();
const _sheetLoading = new Map<string, Promise<HTMLImageElement>>();

// avatar → Photoroom file stem
export const AVATAR_TO_SHEET_NAME: Record<string, string> = {
  zeus:        'Zeus',
  hera:        'Hera',
  poseidon:    'Poseidon',
  demeter:     'Demeter',
  athena:      'Athena',
  apollo:      'Apollo',
  artemis:     'Artemis',
  ares:        'Ares',
  aphrodite:   'Aphrodite',
  hephaestus:  'Hephaestus',
  hermes:      'Hermes',
  dionysus:    'Dionysus',
  hades:       'Hades',
  persephone:  'Persephone',
  hestia:      'Hestia',
  eros:        'Eros',
  gaia:        'Gaia',
  nyx:         'Nyx',
  helios:      'Helios',
  selene:      'Selene',
  pan:         'Pan',
  heracles:    'Heracles',
};

export function getSpriteSheet(avatar: string): HTMLImageElement | null {
  return _sheetCache.get(avatar) ?? null;
}

export function preloadSpriteSheets(avatars: string[]): Promise<void> {
  const promises = avatars.map((av) => loadSpriteSheet(av));
  return Promise.all(promises).then(() => {});
}

function loadSpriteSheet(avatar: string): Promise<HTMLImageElement> {
  const cached = _sheetLoading.get(avatar);
  if (cached) return cached;

  const stem = AVATAR_TO_SHEET_NAME[avatar];
  if (!stem) return Promise.reject(new Error(`No sheet for avatar: ${avatar}`));

  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      _sheetCache.set(avatar, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load sheet: ${avatar}`));
    img.src = `/pixel-olympus-nobg/${stem}-Photoroom.png`;
  });
  _sheetLoading.set(avatar, p);
  return p;
}
