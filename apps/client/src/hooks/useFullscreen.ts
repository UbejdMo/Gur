import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Full screen in a browser. A phone's browser keeps its address bar on screen, which costs a
 * sideways table a fifth of its height; full screen gives that back. Not every browser can
 * (Safari on an iPhone cannot): there, adding Gur to the home screen does the same job.
 */

// Older Safari only knows the prefixed names.
type FullscreenDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const onWeb = Platform.OS === 'web' && typeof document !== 'undefined';
const doc = () => document as FullscreenDocument;

function subscribe(changed: () => void): () => void {
  if (!onWeb) return () => {};
  document.addEventListener('fullscreenchange', changed);
  document.addEventListener('webkitfullscreenchange', changed);
  return () => {
    document.removeEventListener('fullscreenchange', changed);
    document.removeEventListener('webkitfullscreenchange', changed);
  };
}

const isFullscreen = () => onWeb && Boolean(doc().fullscreenElement ?? doc().webkitFullscreenElement);

/** Whether this browser can show a page full screen at all. */
export function fullscreenSupported(): boolean {
  return onWeb && Boolean(doc().fullscreenEnabled ?? doc().webkitFullscreenEnabled);
}

/** Whether Gur was opened from the home screen, where it already runs without browser bars. */
export function runsAsApp(): boolean {
  if (!onWeb || typeof window === 'undefined') return false;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || window.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches === true;
}

/** Whether Gur runs in a browser tab on a touch device: the case where the address bar is in the way. */
export function inPhoneBrowser(): boolean {
  return onWeb && !runsAsApp() && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
}

function toggle(): void {
  if (!onWeb) return;
  // Browsers refuse when it isn't a direct answer to a tap; nothing to do about that, so it is ignored.
  const ignore = () => {};
  try {
    if (isFullscreen()) {
      void Promise.resolve((doc().exitFullscreen ?? doc().webkitExitFullscreen)?.call(doc())).catch(ignore);
    } else {
      const root = document.documentElement as FullscreenElement;
      void Promise.resolve((root.requestFullscreen ?? root.webkitRequestFullscreen)?.call(root)).catch(ignore);
    }
  } catch {
    ignore();
  }
}

export function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const active = useSyncExternalStore(subscribe, isFullscreen, () => false);
  return { supported: fullscreenSupported(), active, toggle };
}
