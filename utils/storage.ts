import { browser } from 'wxt/browser';

// Define the shape of the stored session data
export interface AccountSession {
  did: string;
  handle: string;
  accessToken: string; 
  refreshToken: string;
}

// Define the shape of the entire storage object for accounts
interface StoredAccounts {
  accounts: Record<string, AccountSession>; // Keyed by DID
}

const STORAGE_KEY = 'notisky_accounts';

/**
 * Retrieves all stored account sessions.
 * Returns an empty object if no accounts are stored.
 */
export async function getAllAccountSessions(): Promise<Record<string, AccountSession>> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    const storedData = result[STORAGE_KEY] as StoredAccounts | undefined;
    return storedData?.accounts || {};
  } catch (error) {
    console.error('Error getting all account sessions:', error);
    return {}; // Return empty object on error
  }
}

/**
 * Retrieves a specific account session by DID.
 * Returns null if the account is not found or an error occurs.
 */
export async function getAccountSession(did: string): Promise<AccountSession | null> {
  try {
    const allSessions = await getAllAccountSessions();
    return allSessions[did] || null;
  } catch (error) {
    console.error(`Error getting account session for DID ${did}:`, error);
    return null; // Return null on error
  }
}

/**
 * Stores or updates an account session. 
 * Overwrites the session if a session with the same DID already exists.
 */
export async function storeAccountSession(session: AccountSession): Promise<boolean> {
  if (!session || !session.did) {
    console.error('Invalid session provided to storeAccountSession');
    return false;
  }
  try {
    const allSessions = await getAllAccountSessions();
    allSessions[session.did] = session;
    await browser.storage.local.set({ [STORAGE_KEY]: { accounts: allSessions } });
    console.log(`Stored session for DID: ${session.did}`);
    return true;
  } catch (error) {
    console.error(`Error storing account session for DID ${session.did}:`, error);
    return false;
  }
}

/**
 * Removes an account session by DID.
 */
export async function removeAccountSession(did: string): Promise<boolean> {
  if (!did) {
    console.error('Invalid DID provided to removeAccountSession');
    return false;
  }
  try {
    const allSessions = await getAllAccountSessions();
    if (allSessions[did]) {
      delete allSessions[did];
      await browser.storage.local.set({ [STORAGE_KEY]: { accounts: allSessions } });
      console.log(`Removed session for DID: ${did}`);
      return true;
    } else {
      console.warn(`Attempted to remove non-existent session for DID: ${did}`);
      return false; // Indicate session wasn't found
    }
  } catch (error) {
    console.error(`Error removing account session for DID ${did}:`, error);
    return false;
  }
}

/**
 * Clears all stored account sessions.
 */
export async function clearAllAccountSessions(): Promise<boolean> {
  try {
    await browser.storage.local.remove(STORAGE_KEY);
    console.log('Cleared all stored account sessions.');
    return true;
  } catch (error) {
    console.error('Error clearing all account sessions:', error);
    return false;
  }
} 