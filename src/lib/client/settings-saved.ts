// A window event sent after a settings change is saved, so that parts outside the page's LiveProvider
// (the sidebar's widgets) can read again at once instead of at their next refresh.
export const SETTINGS_SAVED = "lockedin:settings-saved";

export function announceSettingsSaved(): void {
  window.dispatchEvent(new Event(SETTINGS_SAVED));
}
