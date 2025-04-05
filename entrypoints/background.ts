import { defineBackground } from 'wxt/utils/define-background';
import { BskyAgent, ComAtprotoSyncSubscribeRepos, AtpAgent } from '@atproto/api';
import { authenticateUser, storeAuthToken, getAuthToken, initiateBlueskyAuth, exchangeCodeForToken } from '../utils/auth';
import { browser } from 'wxt/browser';
import {
  AccountSession,
  storeAccountSession,
  getAccountSession,
  getAllAccountSessions,
  removeAccountSession
} from '../utils/storage';
import {
  UserPreferences,
  loadPreferences,
  savePreferences,
  defaultPreferences
} from '../utils/preferences';

// Background script for Notisky Browser Extension
export default defineBackground((context) => {
  console.log('Notisky background script loaded');

  // Track active headless clients
  type HeadlessClient = {
    agent: BskyAgent;
    interval: number | null;
    lastRefresh: number;
    notificationData: NotificationData | null;
  };
  
  // Storage for active account clients
  const activeClients: Record<string, HeadlessClient> = {};
  
  // Cached accounts data for synchronous popup access
  let cachedAccounts: Record<string, StoredAccountSession> | null = null;
  
  // Notification data type
  interface NotificationData {
    notification: number;
    message: number;
    total: number;
    notifications: Array<any>;
    messages: Array<any>;
    accountInfo: {
      did: string;
      handle: string;
    };
    timestamp: number;
    error?: string | null;
  }
  
  // Updated AccountSession interface to match storage functions
  interface StoredAccountSession {
    did: string;
    handle: string;
    accessJwt: string;
    refreshJwt: string;
    userId?: string;
  }
  
  // Check if we're in a real browser environment (vs. build environment)
  const isRealBrowser = (() => {
    try {
      return typeof browser !== 'undefined' &&
            typeof browser.action !== 'undefined' &&
            typeof browser.action.setIcon === 'function' &&
            !browser.action.setIcon.toString().includes('not implemented');
    } catch (e) {
      console.log('Notisky: Not in a real browser environment', e);
      return false;
    }
  })();

  // Setup robust message handling using browser.runtime.onMessage
  if (isRealBrowser && browser.runtime && browser.runtime.onMessage) {
    console.log('Setting up runtime message listener');
    
    browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      console.log('Background received message:', message, 'from:', sender);
      
      // Handle OAuth callback from content scripts
      if (message.type === 'oauth_callback' && message.code && message.state) {
        console.log('Received oauth_callback with code and state:', { 
          code: message.code.substring(0, 5) + '...',
          state: message.state.substring(0, 5) + '...'
        });
        
        try {
          // Create a mock redirect URL to use with the existing handleAuthCallback function
          const mockRedirectUrl = `notisky://auth?code=${encodeURIComponent(message.code)}&state=${encodeURIComponent(message.state)}`;
          
          // Store the values we need for OAuth exchange first
          const storageData = await browser.storage.local.get([
            'auth_state_expected',
            'auth_code_verifier',
            'auth_client_id',
            'auth_redirect_uri'
          ]);
          
          // Check if we have all the required data
          if (
            !storageData.auth_state_expected ||
            !storageData.auth_code_verifier ||
            !storageData.auth_client_id ||
            !storageData.auth_redirect_uri
          ) {
            console.log('Missing OAuth data in storage, using the state from message');
            
            // Store the state from the message as the expected state
            // This allows the auth flow to work even if the state was generated elsewhere
            await browser.storage.local.set({
              'auth_state_expected': message.state,
              // Code verifier is technically required, but we use the state as a fallback
              'auth_code_verifier': storageData.auth_code_verifier || message.state,
              'auth_client_id': storageData.auth_client_id || 'https://notisky.symm.app/client-metadata.json',
              'auth_redirect_uri': storageData.auth_redirect_uri || 'https://notisky.symm.app/auth/extension-callback'
            });
          }
          
          // Try to use the exchangeCodeForToken function directly since we have the code and state
          console.log('Attempting direct token exchange');
          try {
            const tokenData = await exchangeCodeForToken(
              message.code,
              storageData.auth_client_id || 'https://notisky.symm.app/client-metadata.json',
              storageData.auth_code_verifier || message.state,
              storageData.auth_redirect_uri || 'https://notisky.symm.app/auth/extension-callback'
            );
            
            if (tokenData.success && tokenData.did && tokenData.accessJwt && tokenData.refreshJwt && tokenData.handle) {
              console.log('Direct token exchange successful for:', tokenData.handle);
              
              const newSession: StoredAccountSession = {
                did: tokenData.did,
                handle: tokenData.handle,
                accessJwt: tokenData.accessJwt,
                refreshJwt: tokenData.refreshJwt,
              };
              
              await storeAccountSession(newSession);
              console.log('Account session stored successfully for DID:', newSession.did);
              
              // Update cache after storing
              cachedAccounts = await getAllAccountSessions();
              
              await initHeadlessClientForAccount(newSession.did);
              
              // Close the authentication tab if we can identify it
              if (sender.tab && sender.tab.id) {
                try {
                  await browser.tabs.remove(sender.tab.id);
                  console.log('Closed authentication tab');
                } catch (e) {
                  console.warn('Could not close authentication tab:', e);
                }
              }
              
              // Send success response
              sendResponse({ success: true, message: 'Authentication processed successfully' });
              
              // Notify popup if it's open
              try {
                await browser.runtime.sendMessage({ action: 'accountAdded', account: newSession });
                console.log('Sent accountAdded message to UI');
              } catch (msgError) {
                console.warn('Could not send accountAdded message, UI might not be open:', msgError);
              }
              
              return true;
            } else {
              throw new Error(tokenData.error || 'Token exchange failed');
            }
          } catch (directExchangeError) {
            console.warn('Direct token exchange failed, falling back to handleAuthCallback:', directExchangeError);
            // Process the auth callback with the full handleAuthCallback function as fallback
            await handleAuthCallback(mockRedirectUrl);
          }
          
          // Close the authentication tab if we can identify it
          if (sender.tab && sender.tab.id) {
            try {
              await browser.tabs.remove(sender.tab.id);
              console.log('Closed authentication tab');
            } catch (e) {
              console.warn('Could not close authentication tab:', e);
            }
          }
          
          // Send success response
          sendResponse({ success: true, message: 'Authentication processed successfully' });
        } catch (error) {
          console.error('Error processing OAuth callback:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
        
        return true; // Keep the message channel open for async response
      }
      
      // Handle standard popup actions
      if (message.action) {
        console.log('Processing action:', message.action);
        
        switch (message.action) {
          // Handle getAccounts action from popup
          case 'getAccounts':
            try {
              // Use cached accounts or fetch them
              if (!cachedAccounts) {
                cachedAccounts = await getAllAccountSessions();
              }
              console.log('Returning accounts:', cachedAccounts);
              sendResponse({ success: true, accounts: cachedAccounts });
            } catch (error) {
              console.error('Error getting accounts:', error);
              sendResponse({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Failed to retrieve accounts' 
              });
            }
            return true;
            
          // Handle ping/pong for testing connection
          case 'ping':
            console.log('Received ping, sending pong');
            sendResponse('pong');
            return true;
            
          // Handle authentication request
          case 'authenticate':
            console.log('Initiating authentication flow...');
            // Start the flow without waiting for it to finish
            initiateBlueskyAuth()
              .then(async (resultUrl) => {
                console.log('Authentication flow returned URL, processing callback...');
                await handleAuthCallback(resultUrl);
              })
              .catch(error => {
                console.error('Error initiating authentication flow:', error);
                browser.runtime.sendMessage({
                  action: 'authInitiationError',
                  error: error instanceof Error ? error.message : 'Failed to initiate authentication'
                }).catch(e => console.warn('Could not send authInitiationError message', e));
              });
            
            // Respond immediately that the flow has started
            sendResponse({ success: true, message: 'Authentication flow initiated.' });
            return true;
            
          // Handle account removal
          case 'removeAccount':
            if (!message.did) {
              sendResponse({ success: false, error: 'Missing DID to remove account' });
              return true;
            }
            
            const didToRemove = message.did;
            console.log(`Initiating removal for account: ${didToRemove}`);
            
            try {
              // Stop the headless client if it exists
              await stopHeadlessClient(didToRemove);
              
              // Remove the account session
              const removed = await removeAccountSession(didToRemove);
              
              if (removed) {
                console.log('Account removed successfully:', didToRemove);
                // Update cached accounts
                cachedAccounts = await getAllAccountSessions();
                
                // Update the badge
                updateExtensionBadge();
                
                // Notify UI about the removal
                browser.runtime.sendMessage({ 
                  action: 'accountRemoved', 
                  did: didToRemove 
                }).catch(console.warn);
              } else {
                console.warn('Account not found or already removed:', didToRemove);
              }
              
              sendResponse({ success: true, message: 'Account removal completed' });
            } catch (error) {
              console.error('Error removing account:', error);
              sendResponse({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Failed to remove account' 
              });
            }
            return true;
            
          // Handle get preferences request
          case 'getPreferences':
            console.log('Getting preferences for options panel');
            try {
              const prefs = await loadPreferences();
              console.log('Returning preferences:', prefs);
              sendResponse({ success: true, preferences: prefs });
            } catch (error) {
              console.error('Error getting preferences:', error);
              sendResponse({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Failed to retrieve preferences' 
              });
            }
            return true;

          // Handle save preferences request
          case 'savePreferences':
            console.log('Saving preferences from options panel:', message.preferences);
            try {
              if (!message.preferences) {
                throw new Error('No preferences data provided');
              }
              
              const success = await savePreferences(message.preferences);
              if (success) {
                // Update current preferences
                currentPreferences = message.preferences;
                // Apply changes immediately
                await updatePollingIntervalsOnPreferenceChange();
                console.log('Preferences saved and applied successfully');
                sendResponse({ success: true });
              } else {
                throw new Error('Failed to save preferences');
              }
            } catch (error) {
              console.error('Error saving preferences:', error);
              sendResponse({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Failed to save preferences' 
              });
            }
            return true;

          // Handle clear notification count
          case 'clearNewNotificationCount':
            console.log('Clearing notification badge count');
            try {
              newNotificationCount = 0;
              await updateExtensionBadge();
              sendResponse({ success: true });
            } catch (error) {
              console.error('Error clearing badge:', error);
              sendResponse({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Failed to clear badge' 
              });
            }
            return true;
        }
      }
      
      // Default response for unhandled messages
      console.warn('Unhandled message type:', message);
      sendResponse({ success: false, error: 'Unhandled message type' });
      return true; // Keep the message channel open
    });
  } else {
    console.warn('Notisky: browser.runtime.onMessage API not available.');
  }

  // Store notification state (last seen CID per DID)
  let notificationState: Record<string, NotificationState> = {};
  let currentPreferences: UserPreferences = defaultPreferences;
  let newNotificationCount = 0; // Counter for badge

  // Define structure for storing last seen notification timestamp per account
  interface NotificationState {
    lastSeenCid: string | null;
    lastCheckedTimestamp: number;
  }
  const NOTIFICATION_STATE_KEY = 'notisky_notification_state';
  const POLLING_INTERVAL_MINUTES = 1; // How often to check for notifications
  const POLLING_ALARM_NAME_PREFIX = 'notisky_poll_'; // Prefix for per-account alarms

  // ==============================================================
  // === Define handleAuthCallback INSIDE defineBackground scope ===
  // ==============================================================
  async function handleAuthCallback(redirectUrl?: string): Promise<void> {
    console.log('Handling auth callback with redirect URL:', redirectUrl);

    if (!redirectUrl) {
        console.error('Authentication flow failed or was cancelled (no redirect URL received).');
        // Optionally notify UI
        return;
    }

    // Check if this is our special URL format
    if (redirectUrl.startsWith('notisky://auth?tab_id=')) {
        console.log('This is a tab-based auth flow, waiting for message from auth server...');
        // The actual code and token will come via message passing, so we don't need to do anything here
        // The tab handling is done in the auth-ext.html page
        return;
    }

    // For backward compatibility, we'll keep the original URL parsing logic
    // Define keys to retrieve from storage
    const storageKeys = ['auth_state_expected', 'auth_code_verifier', 'auth_client_id', 'auth_redirect_uri'];

    try {
        const url = new URL(redirectUrl);
        const params = url.searchParams;
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');
        const errorDescription = params.get('error_description');

        // --- Retrieve stored values --- 
        const storedData = await browser.storage.local.get(storageKeys);
        const expectedState = storedData.auth_state_expected;
        const codeVerifier = storedData.auth_code_verifier;
        const clientId = storedData.auth_client_id;
        const storedRedirectUri = storedData.auth_redirect_uri;

        // Clean up stored values immediately after retrieval
        await browser.storage.local.remove(storageKeys);

        // --- Validate retrieved data --- 
        if (!expectedState || !codeVerifier || !clientId || !storedRedirectUri) {
            console.error('Authentication callback failed: Missing expected data from storage.', { storedData });
            return;
        }

        // --- State Validation --- 
        if (state !== expectedState) {
            console.error('Authentication failed: Invalid state parameter.', { received: state, expected: expectedState });
            return;
        }
        console.log('State validation successful.');

        // --- Handle Errors from Redirect --- 
        if (error) {
            console.error('Authentication failed (from redirect):', error, errorDescription || '(no description)');
            return;
        }

        // --- Proceed with Code Exchange --- 
        if (code) {
            console.log(`Exchanging code for token... Code: ${code}`);
            // Pass all necessary retrieved values
            const tokenResult = await exchangeCodeForToken(
                code, 
                clientId, 
                codeVerifier, 
                storedRedirectUri
            );

            if (tokenResult.success && tokenResult.did && tokenResult.accessJwt && tokenResult.refreshJwt && tokenResult.handle) {
                console.log('Token exchange successful, session data:', tokenResult);

                const newSession: StoredAccountSession = {
                    did: tokenResult.did,
                    handle: tokenResult.handle,
                    accessJwt: tokenResult.accessJwt,
                    refreshJwt: tokenResult.refreshJwt,
                };

                await storeAccountSession(newSession);
                console.log('Account session stored successfully for DID:', newSession.did);

                // Update cache after storing
                cachedAccounts = await getAllAccountSessions();

                await initHeadlessClientForAccount(newSession.did);

                try {
                    await browser.runtime.sendMessage({ action: 'accountAdded', account: newSession });
                    console.log('Sent accountAdded message to UI');
                } catch(msgError) {
                    console.warn('Could not send accountAdded message, UI might not be open:', msgError);
                }

            } else {
                console.error('Token exchange failed:', tokenResult.error || 'Unknown error during token exchange');
            }
        } else {
            console.error('Auth callback missing authorization code.');
        }

    } catch (error: any) {
        console.error('Error processing auth callback:', error);
        // Ensure stored values are cleaned up even if processing fails mid-way
        await browser.storage.local.remove(storageKeys).catch(e => console.error("Error cleaning up auth storage on failure:", e));
    }
  }
  // --- End of handleAuthCallback definition ---

  // Setup a heartbeat ping handler to help detect extension context state
  if (isRealBrowser) {
    try {
      browser.alarms.create('notiskyHeartbeat', {
        periodInMinutes: 1 // Check every minute
      });
      
      // Create a persistent alarm to keep the service worker alive in MV3
      browser.alarms.create('notiskyKeepAlive', {
        periodInMinutes: 0.25 // Check every 15 seconds for MV3 keep-alive
      });
    } catch (error) {
      console.error('Notisky: Error creating core alarms', error);
    }
  }

  // Safe alarm listener setup
  if (isRealBrowser && browser.alarms && browser.alarms.onAlarm) {
    try {
      browser.alarms.onAlarm.addListener(async (alarm) => {
        if (alarm.name === 'notiskyHeartbeat') {
          // Write a timestamp to storage as a heartbeat
          try {
            await browser.storage.local.set({
              heartbeat: {
                timestamp: Date.now(),
                status: 'active'
              }
            });
          } catch (error) {
            console.error('Notisky: Error writing heartbeat to storage', error);
          }
        } else if (alarm.name === 'notiskyKeepAlive') {
          // This is just to keep the service worker alive, no action needed
          // We write a tiny piece of data to keep the service worker active
          try {
            await browser.storage.local.set({ serviceWorkerKeepAlive: Date.now() });
          } catch {
            // Silently ignore
          }
        } else if (alarm.name.startsWith(POLLING_ALARM_NAME_PREFIX)) {
          const did = alarm.name.substring(POLLING_ALARM_NAME_PREFIX.length);
          console.log(`Polling alarm triggered for DID: ${did}`);
          await pollAccountNotifications(did);
        }
      });
    } catch (error) {
      console.error('Notisky: Error setting up alarm listener', error);
    }
  }
  
  // For MV3, set up a keep-alive interval as a backup strategy for the alarm
  if (isRealBrowser && 
      typeof browser !== 'undefined' && 
      typeof browser.runtime !== 'undefined' && 
      typeof browser.runtime.getManifest === 'function' && 
      browser.runtime.getManifest().manifest_version === 3) {
    
    console.log('Notisky: Running in MV3 mode, setting up additional keep-alive strategies');
    
    // Setup periodic state checking and recovery
    const keepAliveInterval = setInterval(() => {
      // Small storage operation to keep the service worker alive
      try {
        browser.storage.local.set({
          serviceWorkerKeepAliveInterval: Date.now(),
          serviceWorkerStatus: 'active_interval'
        }).catch(() => {});
      } catch (error) {
        if (Math.random() < 0.05) {
          console.warn('Notisky: Critical error in service worker keep-alive interval', error);
        }
      }

      // Try to create offscreen document (Chrome 116+) for better persistence
      if (typeof browser.offscreen !== 'undefined' && typeof browser.offscreen.createDocument === 'function') {
        try {
          browser.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['KEEP_ALIVE'],
            justification: 'Keep notification service active'
          }).catch(e => {
            // Ignore error if document already exists
            if (!e.message?.includes('already exists')) {
              console.warn('Failed to create offscreen document:', e);
            }
          });
        } catch (offscreenError) {
          // Ignore API not available
          if (Math.random() < 0.01) console.debug('Offscreen API not fully available:', offscreenError);
        }
      }
    }, 60 * 1000); // Run every minute
    
    // Register a persistent connection listener
    try {
      if (typeof browser.runtime.onConnect === 'function') {
        browser.runtime.onConnect.addListener((port) => {
          console.log('Notisky: Background script received connection from', port.name || 'unnamed port');
          port.onDisconnect.addListener(() => {
            console.log('Notisky: Port disconnected:', port.name || 'unnamed');
            if (browser.runtime.lastError) {
              console.warn('Notisky: Port disconnected with error:', browser.runtime.lastError.message);
            }
          });
          
          port.onMessage.addListener((msg) => {
            console.log('Received message on port', port.name, msg);
          });
        });
      }
    } catch (error) {
      console.error('Notisky: Error setting up connection listener', error);
    }
  }

  // --- Preference Handling ---
  async function loadAndApplyPreferences() {
    console.log('Loading and applying preferences...');
    try {
      currentPreferences = await loadPreferences();
      console.log('Preferences loaded:', currentPreferences);
      updatePollingIntervalsOnPreferenceChange();
    } catch (error) {
      console.error('Failed to load preferences on init:', error);
      currentPreferences = defaultPreferences;
    }
  }

  // Function to update polling intervals for all active clients if preference changed
  async function updatePollingIntervalsOnPreferenceChange() {
    console.log('Updating polling intervals based on preferences...');
    const intervalMinutes = currentPreferences.pollingIntervalMinutes ?? POLLING_INTERVAL_MINUTES;
     console.log(`Setting polling interval to ${intervalMinutes} minutes for all active accounts.`);

    const allAlarms = await browser.alarms.getAll();
    const pollingAlarms = allAlarms.filter(alarm => alarm.name.startsWith(POLLING_ALARM_NAME_PREFIX));
    const didsToUpdate = pollingAlarms.map(alarm => alarm.name.substring(POLLING_ALARM_NAME_PREFIX.length));

    for (const alarm of pollingAlarms) {
        await browser.alarms.clear(alarm.name);
    }

    for (const did of didsToUpdate) {
        if (activeClients[did]) {
            const alarmName = `${POLLING_ALARM_NAME_PREFIX}${did}`;
            try {
                console.log(`Creating/updating polling alarm "${alarmName}" with interval ${intervalMinutes} minutes.`);
                await browser.alarms.create(alarmName, {
                    periodInMinutes: intervalMinutes
                });
            } catch (alarmError) {
                console.error(`Failed to create/update polling alarm for ${did}:`, alarmError);
            }
        } else {
             console.log(`Skipping alarm update for removed/inactive client ${did}`);
        }
    }
  }

  // --- Notification State Management --- 
  async function loadNotificationState() {
    try {
      const result = await browser.storage.local.get(NOTIFICATION_STATE_KEY);
      if (result && result[NOTIFICATION_STATE_KEY]) {
        notificationState = result[NOTIFICATION_STATE_KEY];
        console.log('Loaded notification state:', notificationState);
      } else {
        console.log('No previous notification state found.');
        notificationState = {};
      }
    } catch (error) {
      console.error('Error loading notification state:', error);
      notificationState = {};
    }
  }

  async function saveNotificationState() {
    try {
      await browser.storage.local.set({ [NOTIFICATION_STATE_KEY]: notificationState });
    } catch (error) {
      console.error('Error saving notification state:', error);
    }
  }

  function updateAccountNotificationState(did: string, lastSeenCid: string | null) {
    if (!notificationState[did]) {
      notificationState[did] = { lastSeenCid: null, lastCheckedTimestamp: 0 };
    }
    if (notificationState[did].lastSeenCid !== lastSeenCid) {
        notificationState[did].lastSeenCid = lastSeenCid;
        console.log(`Updated lastSeenCid for ${did} to ${lastSeenCid}`);
        saveNotificationState();
    }
    notificationState[did].lastCheckedTimestamp = Date.now();
  }

  // --- Polling Logic --- 
  async function pollAccountNotifications(did: string) {
    console.log(`Polling notifications for ${did}`);
    const client = activeClients[did];
    if (!client || !client.agent) {
      console.warn(`No active client found for ${did} during polling.`);
      const session = await getAccountSession(did);
      if (session) {
          console.log(`Found session for ${did}, attempting reinitialization...`);
          await initHeadlessClientForAccount(did);
      } else {
          console.error(`Cannot poll for ${did}, no session found.`);
          await stopPollingForAccount(did);
      }
      return;
    }

    try {
      const countResult = await client.agent.api.app.bsky.notification.getUnreadCount({
      });

      if (!countResult.success) {
          console.error(`Failed to get unread count for ${did}:`, countResult);
          if (countResult.status === 401 || countResult.status === 400) {
            console.warn(`Authentication error polling ${did}. Stopping client.`);
            await stopHeadlessClient(did);
          }
          return;
      }

      const unreadCount = countResult.data.count;
      console.log(`Unread notification count for ${did}: ${unreadCount}`);

      let newNotifications: any[] = [];
      if (unreadCount > 0) {
          const listResult = await client.agent.api.app.bsky.notification.listNotifications({
              limit: Math.min(unreadCount + 10, 50),
          });

          if (listResult.success) {
              const lastCheckTimestamp = notificationState[did]?.lastCheckedTimestamp || 0;
              newNotifications = listResult.data.notifications.filter(n =>
                  n.isRead === false && new Date(n.indexedAt).getTime() > lastCheckTimestamp
              );

              console.log(`Found ${newNotifications.length} new notifications for ${did} since last check.`);

              if (currentPreferences.desktopNotificationsEnabled && newNotifications.length > 0) {
                  sendDesktopNotification(did, newNotifications[0]);
              }

          } else {
              console.error(`Failed to list notifications for ${did}:`, listResult);
              newNotifications = [];
          }
      } else {
          newNotifications = [];
      }

      const newNotificationCountForAccount = newNotifications.length;

      client.notificationData = {
        notification: newNotificationCountForAccount,
        message: 0,
        total: unreadCount,
        notifications: newNotifications,
        messages: [],
        accountInfo: {
          did: did,
          handle: client.agent.session?.handle || 'unknown',
        },
        timestamp: Date.now(),
        error: null
      };
      client.lastRefresh = Date.now();

      updateAccountNotificationState(did, notificationState[did]?.lastSeenCid);

      await updateExtensionBadge();

      if (newNotificationCountForAccount > 0 || client.notificationData.total !== null) {
           try {
               await browser.runtime.sendMessage({
                   action: 'notificationUpdate',
                   did: did,
                   data: client.notificationData
               });
               console.log(`Sent notificationUpdate for ${did}`);
           } catch (msgError) {
               console.warn(`Could not send notificationUpdate for ${did}:`, msgError);
           }
      }

    } catch (error: any) {
      console.error(`Error polling notifications for ${did}:`, error);
      if (error.message?.includes('Authentication Required') || error.message?.includes('expired') || error.status === 401) {
          console.warn(`Authentication potentially expired for ${did}. Stopping client.`);
          await stopHeadlessClient(did);
          try {
            await browser.runtime.sendMessage({ action: 'reAuthRequired', did: did });
          } catch {}
      }
      client.notificationData = {
        ...(client.notificationData || {
            notification: 0, message: 0, total: 0, notifications: [], messages: [],
            accountInfo: { did: did, handle: client.agent?.session?.handle || 'error' }
        }),
        error: error.message || 'Polling failed',
        timestamp: Date.now(),
    };
    updateAccountNotificationState(did, notificationState[did]?.lastSeenCid);

     await updateExtensionBadge();
      try {
         await browser.runtime.sendMessage({
             action: 'notificationUpdate',
             did: did,
             data: client.notificationData
         });
      } catch (msgError) {
         console.warn(`Could not send notification error update for ${did}:`, msgError);
      }
    }
  }

  // --- Badge/Desktop Notifications ---
  async function updateExtensionBadge() {
    let totalNewCount = 0;
    let hasError = false;
    let accountHandles: string[] = [];

    for (const did in activeClients) {
        const clientData = activeClients[did]?.notificationData;
        totalNewCount += clientData?.notification || 0;
        if (clientData?.error) {
            hasError = true;
        }
        if(activeClients[did]?.agent?.session?.handle) {
            accountHandles.push(activeClients[did].agent.session.handle);
        }
    }
    newNotificationCount = totalNewCount;

    console.log(`Updating badge count to: ${newNotificationCount}, Has Error: ${hasError}`);

    if (isRealBrowser) {
      try {
        const text = hasError ? 'ERR' : (newNotificationCount > 0 ? String(newNotificationCount) : '');
        await browser.action.setBadgeText({ text: text });

        const color = hasError ? '#d9534f' : '#1d9bf0';
        await browser.action.setBadgeBackgroundColor({ color: color }); 

        let tooltipText = `Notisky`;
        if (accountHandles.length > 0) {
            tooltipText += ` (${accountHandles.join(', ')})`;
            if (hasError) {
                tooltipText += ` - Error polling one or more accounts`;
            } else if (newNotificationCount > 0) {
                tooltipText += ` - ${newNotificationCount} new notifications`;
            } else {
                 tooltipText += ` - No new notifications`;
            }
        } else {
             tooltipText += ` (No accounts logged in)`;
        }
         await browser.action.setTitle({ title: tooltipText });

      } catch (error) {
        if (!error.message?.includes('Receiving end does not exist')) {
             console.error('Error updating extension badge:', error);
        }
      }
    }
  }

  function sendDesktopNotification(did: string, notification: any) {
    if (!isRealBrowser || !currentPreferences.desktopNotificationsEnabled || !notification) {
        return;
    }

    const client = activeClients[did];
    const handle = client?.notificationData?.accountInfo?.handle || did;

     let title = `New Notification (${handle})`;
     let message = 'You have a new notification on Bluesky.';
     let icon = browser.runtime.getURL('icon-128.png');

    try {
        if (notification && notification.reason) {
            title = `Bluesky: ${notification.reason.charAt(0).toUpperCase() + notification.reason.slice(1)} (${handle})`;
            if (notification.author?.displayName) {
                 message = `${notification.author.displayName} (${notification.author.handle})`;
                 if (notification.reason === 'like') message += ' liked your post.';
                 else if (notification.reason === 'repost') message += ' reposted your post.';
                 else if (notification.reason === 'follow') message += ' followed you.';
                 else if (notification.reason === 'mention') message += ' mentioned you.';
                 else if (notification.reason === 'reply') message += ' replied to your post.';
                 else message += ` (${notification.reason})`;

                 if (notification.record?.text) {
                     message += `
"${notification.record.text.substring(0, 50)}${notification.record.text.length > 50 ? '...' : ''}"`;
                 }
            }
            if (notification.author?.avatar) {
              icon = notification.author.avatar;
            }
        }

        browser.notifications.create(`notisky-${did}-${notification?.cid || Date.now()}`, {
            type: 'basic',
            iconUrl: icon,
            title: title,
            message: message,
            priority: 0
        }).catch(err => console.error("Failed to create desktop notification:", err));

    } catch (error) {
        console.error('Error creating desktop notification:', error);
    }
  }

  // --- Alarm Management for Polling --- 
  async function startPollingForAccount(did: string) {
    const intervalMinutes = currentPreferences.pollingIntervalMinutes ?? POLLING_INTERVAL_MINUTES;
    const alarmName = `${POLLING_ALARM_NAME_PREFIX}${did}`;

    try {
        await browser.alarms.clear(alarmName);
        console.log(`Creating polling alarm "${alarmName}" with interval ${intervalMinutes} minutes.`);
        await browser.alarms.create(alarmName, {
          delayInMinutes: 0.1,
          periodInMinutes: intervalMinutes
        });
        setTimeout(() => {
          pollAccountNotifications(did).catch(err => {
              console.error(`Initial poll failed for ${did}:`, err);
          });
        }, 500);

    } catch (error) {
        console.error(`Failed to create or schedule polling alarm for ${did}:`, error);
    }
  }

  async function stopPollingForAccount(did: string) {
     if (!browser.alarms) return; 
     const alarmName = `${POLLING_ALARM_NAME_PREFIX}${did}`;
     try {
       await browser.alarms.clear(alarmName);
       console.log(`Stopped polling alarm for ${did}`);
     } catch (error) {
       if (!error.message?.includes('No alarm')) {
            console.error(`Error clearing polling alarm for ${did}:`, error);
       }
     }
  }
  
  // Central alarm listener
  if (isRealBrowser && browser.alarms) {
    browser.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name.startsWith(POLLING_ALARM_NAME_PREFIX)) {
        const did = alarm.name.substring(POLLING_ALARM_NAME_PREFIX.length);
        if (did && activeClients[did]) {
          await pollAccountNotifications(did);
        }
      }
    });
  }

  // --- Client Initialization / Stop --- 
  
  async function initHeadlessClientForAccount(did: string) {
    console.log(`Initializing client for DID: ${did}`);
    if (!isRealBrowser) {
      console.log('Not in a real browser env, skipping client init.');
      return;
    }

    if (activeClients[did]?.agent?.session) {
        console.log(`Client already exists for ${did}. Skipping re-initialization unless forced.`);
        const alarm = await browser.alarms.get(`${POLLING_ALARM_NAME_PREFIX}${did}`);
        if (!alarm) {
           console.warn(`Polling alarm missing for existing client ${did}. Restarting polling.`);
           await startPollingForAccount(did);
        }
        return;
    }

    const session = await getAccountSession(did);
    if (!session || !session.accessJwt || !session.refreshJwt) {
      console.error(`Cannot initialize client for ${did}: Missing or incomplete session data.`);
      await removeAccountSession(did);
      await stopPollingForAccount(did);
      await updateExtensionBadge();
      return;
    }

    await stopHeadlessClient(did);

    try {
      const agent = new BskyAgent({
         service: 'https://bsky.social',
         persistSession: (evt, sess) => {
           if (evt === 'update' && sess) {
             console.log(`Session updated via persistSession callback for ${did}`);
             const updatedSession: StoredAccountSession = {
               did: sess.did,
               handle: sess.handle,
               accessJwt: sess.accessJwt,
               refreshJwt: sess.refreshJwt,
             };
             storeAccountSession(updatedSession).catch(err => {
               console.error(`Failed to store updated session for ${did}:`, err);
             });
           } else if (evt === 'expired') {
               console.warn(`Session expired event for ${did}. Re-auth needed.`);
                stopHeadlessClient(did);
                browser.runtime.sendMessage({ action: 'reAuthRequired', did: did }).catch(console.warn);
           }
        }
     });

    const resumeResult = await agent.resumeSession(session);
    if (!resumeResult.success) {
         console.error(`Failed to resume session for ${did}. Error: ${resumeResult.error || 'Unknown resume error'}. Removing session.`);
          console.warn(`Session resume failed for ${did}. Authentication may be required.`);
          await removeAccountSession(did);
          await stopPollingForAccount(did);
          await updateExtensionBadge();
          browser.runtime.sendMessage({ action: 'reAuthRequired', did: did, reason: 'Session resume failed' }).catch(console.warn);
          return;
    }

    console.log(`Session resumed successfully for ${did}, handle: ${agent.session?.handle}`);

    activeClients[did] = {
      agent: agent,
      interval: null,
      lastRefresh: 0,
      notificationData: null
    };

    await startPollingForAccount(did);

    console.log(`Client initialized and polling started for ${did}`);
    await updateExtensionBadge();

  } catch (error: any) {
    console.error(`Fatal error initializing client for ${did}:`, error);
    delete activeClients[did];
     await stopPollingForAccount(did);
     await updateExtensionBadge();
     if (error.message?.includes('Authentication Required') || error.message?.includes('invalid') || error.status === 401) {
         await removeAccountSession(did);
         browser.runtime.sendMessage({ action: 'reAuthRequired', did: did, reason: 'Client init failed' }).catch(console.warn);
     }
  }
}

async function stopHeadlessClient(did: string) {
  console.log(`Stopping headless client for DID: ${did}`);
  const client = activeClients[did];
  if (client) {
      delete activeClients[did];
      console.log(`Client removed for ${did}.`);
  } else {
      console.log(`No active client found for ${did} to stop.`);
  }
  await stopPollingForAccount(did);
  await updateExtensionBadge();
}

// --- Initialization --- 
async function initializeExtension() {
   console.log('Initializing Notisky extension...');
   await loadAndApplyPreferences();
   await loadNotificationState();

   const accountsObject = await getAllAccountSessions(); // Get the object { did: session, ... }
   const accountList = Object.values(accountsObject || {}); // Get array of session objects [] or [session1, ...]
   console.log(`Found ${accountList.length} stored account(s).`); // Use length of the array
   
   // Update the cache
   cachedAccounts = accountsObject || {};

   // Map over the array of session objects
   await Promise.all(accountList.map(account => initHeadlessClientForAccount(account.did)));

   if (accountList.length === 0) {
       console.log('No accounts found. Waiting for user to authenticate.');
       updateExtensionBadge();
   } else {
       await updateExtensionBadge();
   }

   console.log('Extension initialization complete.');
}

setTimeout(() => {
   initializeExtension().catch(error => {
       console.error("Critical error during extension initialization:", error);
   });
}, 500);

});
