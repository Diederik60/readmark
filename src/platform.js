// Small platform helpers. The UA check is enough here: we only need to know
// whether to show Cmd or Ctrl and whether the native macOS menu is present.
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** True when the platform's primary modifier (Cmd / Ctrl) is held. */
export function primaryModifier(event) {
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

export function shortcutLabel(key) {
  return isMac ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}
