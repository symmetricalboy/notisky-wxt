import { browser } from 'wxt/browser';

// Define the shape of user preferences
export interface UserPreferences {
  pollingIntervalMinutes: number;
  showDesktopNotifications: boolean;
  showDetailedNotifications: boolean;
  // Add other preferences here as needed
}

// Define default values for preferences
export const defaultPreferences: UserPreferences = {
  pollingIntervalMinutes: 1,
  showDesktopNotifications: true,
  showDetailedNotifications: true,
};

const PREFERENCES_STORAGE_KEY = 'notisky_preferences';

/**
 * Loads user preferences from browser.storage.sync.
 * Returns default preferences if none are found or on error.
 */
export async function loadPreferences(): Promise<UserPreferences> {
  try {
    // Use sync storage for preferences
    const result = await browser.storage.sync.get(PREFERENCES_STORAGE_KEY);
    const storedPrefs = result[PREFERENCES_STORAGE_KEY];
    // Merge stored prefs with defaults to ensure all keys are present
    return { ...defaultPreferences, ...(storedPrefs || {}) };
  } catch (error) {
    console.error('Error loading preferences:', error);
    // Return defaults on error
    return defaultPreferences;
  }
}

/**
 * Saves user preferences to browser.storage.sync.
 */
export async function savePreferences(prefs: UserPreferences): Promise<boolean> {
  try {
    // Validate basic constraints (e.g., interval > 0)
    if (prefs.pollingIntervalMinutes < 1) {
      prefs.pollingIntervalMinutes = 1; // Enforce minimum interval
    }
    
    await browser.storage.sync.set({ [PREFERENCES_STORAGE_KEY]: prefs });
    console.log('Preferences saved:', prefs);
    return true;
  } catch (error) {
    console.error('Error saving preferences:', error);
    return false;
  }
} 