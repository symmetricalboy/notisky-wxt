import { defineBackground } from 'wxt/utils/define-background';
import { BskyAgent, ComAtprotoSyncSubscribeRepos, AtpAgent } from '@atproto/api';
import { authenticateUser, storeAuthToken, getAuthToken } from '../utils/auth';
import { initiateBlueskyAuth, exchangeCodeForToken } from '../utils/auth';
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
  }
  
  // Account session type
  interface AccountSession {
    did: string;
    handle: string;
    accessToken: string;
    refreshToken: string;
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

  // Setup a heartbeat ping handler to help detect extension context state
  if (isRealBrowser) {
    try {
      browser.alarms.create('notiskyHeartbeat', {
        periodInMinutes: 1 // Check every minute
      });
      
      // Create a persistent alarm to keep the service worker alive in MV3
      browser.alarms.create('notiskyKeepAlive', {
        periodInMinutes: 0.1 // Check every 6 seconds to ensure service worker stays alive
      });
    } catch (error) {
      console.error('Notisky: Error creating heartbeat alarm', error);
    }
  }

  // Safe alarm listener setup
  if (isRealBrowser && browser.alarms && browser.alarms.onAlarm) {
    try {
      browser.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'notiskyHeartbeat') {
          // Write a timestamp to storage as a heartbeat
          try {
            browser.storage.local.set({
              heartbeat: {
                timestamp: Date.now(),
                status: 'active'
              }
            }).catch(error => {
              console.error('Notisky: Error writing heartbeat to storage', error);
            });
          } catch (error) {
            console.error('Notisky: Error in heartbeat alarm', error);
          }
        } else if (alarm.name === 'notiskyKeepAlive') {
          // This is just to keep the service worker alive, no action needed
          // We write a tiny piece of data to keep the service worker active
          try {
            browser.storage.local.set({
              serviceWorkerKeepAlive: Date.now()
            }).catch(() => {
              // Silently ignore error to avoid log spam
            });
          } catch {
            // Silently ignore
          }
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
    setInterval(() => {
      // Small storage operation to keep the service worker alive
      try {
        browser.storage.local.set({
          serviceWorkerKeepAlive: Date.now(),
          serviceWorkerStatus: 'active'
        }).catch((error) => {
          // Log error but don't spam console
          if (Math.random() < 0.1) { // Only log ~10% of errors to reduce spam
            console.warn('Notisky: Error in service worker keep-alive storage operation', error);
          }
        });
      } catch (error) {
        // Log critical errors at a reduced rate
        if (Math.random() < 0.1) {
          console.warn('Notisky: Critical error in service worker keep-alive', error);
        }
      }
    }, 3000); // Every 3 seconds - more frequent than the default 5s
    
    // Register a persistent connection listener
    try {
      if (typeof browser.runtime.onConnect === 'function') {
        browser.runtime.onConnect.addListener((port) => {
          console.log('Notisky: Background script received connection from', port.name || 'unnamed port');
          
          // Set up a listener for disconnect to detect when the port closes
          port.onDisconnect.addListener(() => {
            console.log('Notisky: Port disconnected');
            
            // Check for error
            if (browser.runtime.lastError) {
              console.warn('Notisky: Port disconnected with error:', browser.runtime.lastError);
            }
          });
        });
      }
    } catch (error) {
      console.error('Notisky: Error setting up connection listener', error);
    }
  }

  // Setup robust message handling using browser.runtime.onMessage instead of the destructured onMessage
  if (isRealBrowser && browser.runtime && browser.runtime.onMessage) {
    try {
      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Notisky: Received message:', message, 'from:', sender);

        // Use a flag to indicate if sendResponse will be called asynchronously
        let willRespondAsync = false;

        // Handle different message types
        switch (message.action) {
          // --- Authentication --- 
          case 'authenticate':
            console.log('Initiating authentication flow...');
            willRespondAsync = true; // Indicate async response
            initiateBlueskyAuth(handleAuthCallback)
              .then(result => {
                // Note: initiateBlueskyAuth now just starts the flow.
                // The actual result (tokens) comes via handleAuthCallback.
                // We might need to adjust what this message listener responds with.
                // Maybe just acknowledge that the flow started?
                if (result.success) {
                  console.log('Auth flow initiated successfully.');
                  // Don't send tokens here, they aren't available yet.
                  sendResponse({ success: true, message: 'Auth flow started.' });
                } else {
                  console.error('Failed to initiate auth flow:', result.error);
                  sendResponse({ success: false, error: result.error });
                }
              })
              .catch(error => {
                console.error('Error calling initiateBlueskyAuth:', error);
                sendResponse({ success: false, error: error.message });
              });
            break;
          
          // Remove handlers for old auth flow messages
          // case 'authSuccess': 
          // case 'authError':

          // --- Account Management ---
          case 'getAccounts': // Message to get all stored accounts (for UI)
            willRespondAsync = true;
            getAllAccountSessions()
              .then(accounts => {
                sendResponse({ success: true, accounts: accounts });
              })
              .catch(error => {
                console.error('Error fetching accounts:', error);
                sendResponse({ success: false, error: error.message });
              });
            break;
          case 'removeAccount': // Message to remove an account
            if (!message.did) {
              sendResponse({ success: false, error: 'Missing DID to remove account' });
              break;
            }
            willRespondAsync = true;
            removeAccountSession(message.did)
              .then(removed => {
                if (removed) {
                  // Stop the client if it was running
                  stopHeadlessClient(message.did); 
                  sendResponse({ success: true });
                  // Optionally update UI state immediately
                  updateUIForAuthenticatedState(message.did); 
                } else {
                  sendResponse({ success: false, error: 'Failed to remove account or account not found' });
                }
              })
              .catch(error => {
                console.error('Error removing account:', error);
                sendResponse({ success: false, error: error.message });
              });
            break;

          // --- Preferences --- 
          case 'getPreferences':
            willRespondAsync = true;
            loadPreferences().then(prefs => {
              currentPreferences = prefs; // Update local cache on request too
              sendResponse({ success: true, preferences: currentPreferences });
            }).catch(e => sendResponse({ success: false, error: e.message }));
            break;
          case 'savePreferences':
            if (!message.preferences) {
              sendResponse({ success: false, error: 'Missing preferences data' });
              break;
            }
            willRespondAsync = true;
            savePreferences(message.preferences)
              .then(async (saved) => {
                if (saved) {
                  // Update in-memory prefs and apply changes
                  const oldInterval = currentPreferences.pollingIntervalMinutes;
                  currentPreferences = { ...defaultPreferences, ...message.preferences }; // Update local cache
                  sendResponse({ success: true });
                  // If interval changed, update alarms
                  if (currentPreferences.pollingIntervalMinutes !== oldInterval) {
                    await updatePollingIntervalsOnPreferenceChange(); 
                  }
                  // Optionally notify other UI instances
                  browser.runtime.sendMessage({ action: 'preferencesChanged', preferences: currentPreferences })
                         .catch(() => {/*ignore*/});
                } else {
                  sendResponse({ success: false, error: 'Failed to save preferences' });
                }
              })
              .catch(error => {
                console.error('Error saving preferences via message:', error);
                sendResponse({ success: false, error: error.message });
              });
            break;
          
          // Remove obsolete preference references from other handlers if any exist
          
          // --- Other Actions --- 
          case 'updateNotificationCount':
            // TODO: Implement icon update
            // updateExtensionIcon(message.count);
            sendResponse({ success: true });
            break;
          case 'sendNotification':
            // TODO: Implement browser notification
            // sendNotification(message.title, message.message, message.type);
            sendResponse({ success: true });
            break;
          case 'checkForUpdates':
            // TODO: Implement refresh logic
            // refreshBlueskyTab(); 
            sendResponse({ success: true });
            break;
          case 'ping':
            sendResponse({ success: true, message: 'pong' });
            break;
          case 'clearNewNotificationCount':
            console.log('Popup opened, clearing new notification count.');
            newNotificationCount = 0;
            updateExtensionBadge(); // Update badge immediately
            sendResponse({ success: true });
            break;
          default:
            console.warn('Unknown message action received:', message.action);
            // Optionally send a response for unknown actions
            // sendResponse({ success: false, error: 'Unknown action' });
            // Or return false / undefined to indicate no response
            return false; 
        }

        // Return true to indicate that sendResponse will be called asynchronously
        return willRespondAsync;
      });
      
      // For MV3, also register for connection attempts that content scripts might use to wake up the service worker
      if (typeof browser.runtime.onConnect === 'function') {
        browser.runtime.onConnect.addListener((port) => {
          console.log('Notisky: Background script received connection attempt from content script to wake up service worker');
          // No need to do anything, the connection itself activates the service worker
          // The content script will disconnect immediately
        });
      }
    } catch (error) {
      console.error('Notisky: Error setting up message listener', error);
    }
  }

  // --- Preference Handling ---
  async function loadAndApplyPreferences() {
    currentPreferences = await loadPreferences();
    console.log('Loaded preferences:', currentPreferences);
    // Initial alarm setup happens during initializeExtension
    // Subsequent updates handled by savePreferences handler
  }

  // Function to update polling intervals for all active clients if preference changed
  async function updatePollingIntervalsOnPreferenceChange() {
    if (!browser.alarms) return;
    const pollingInterval = currentPreferences.pollingIntervalMinutes;
    console.log(`Applying updated polling interval: ${pollingInterval} minutes`);
    for (const did in activeClients) {
      const alarmName = `${POLLING_ALARM_NAME_PREFIX}${did}`;
      try {
        // Always clear and recreate the alarm to ensure the new period takes effect
        console.log(`Recreating polling alarm for ${did} with new interval ${pollingInterval} minutes.`);
        await browser.alarms.clear(alarmName);
        // Check if client still exists before recreating alarm
        if (activeClients[did]) { 
          await browser.alarms.create(alarmName, {
            periodInMinutes: pollingInterval,
            delayInMinutes: pollingInterval // Start next poll after one new interval
          });
        }
      } catch (error) {
        console.error(`Error updating polling interval for ${did}:`, error);
      }
    }
  }

  // --- Notification State Management --- 
  async function loadNotificationState() {
    try {
      const result = await browser.storage.local.get(NOTIFICATION_STATE_KEY);
      notificationState = result[NOTIFICATION_STATE_KEY] || {};
      console.log('Loaded notification state:', notificationState);
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
    notificationState[did] = {
      lastSeenCid: lastSeenCid,
      lastCheckedTimestamp: Date.now(),
    };
    saveNotificationState(); 
  }

  // --- Polling Logic --- 
  async function pollAccountNotifications(did: string) {
    console.log(`Polling notifications for DID: ${did}`);
    const client = activeClients[did];
    if (!client || !client.agent) {
      console.warn(`No active client found for polling DID: ${did}. Skipping poll.`);
      await browser.alarms.clear(`${POLLING_ALARM_NAME_PREFIX}${did}`).catch(e=>console.error(e));
      return;
    }

    try {
      const params = { limit: 30 }; 
      const lastSeen = notificationState[did]?.lastSeenCid;
      
      const response = await client.agent.api.app.bsky.notification.listNotifications(params);
      
      if (!response.success || !response.data.notifications) {
        console.error(`Failed to list notifications for ${did}:`, response);
        return;
      }

      const notifications = response.data.notifications;
      let lastSeenIndex = -1;
      if (lastSeen) {
        lastSeenIndex = notifications.findIndex(n => n.cid === lastSeen);
      }

      const newNotifications = lastSeenIndex === -1 
          ? notifications 
          : notifications.slice(0, lastSeenIndex);

      if (newNotifications.length > 0) {
        console.log(`Found ${newNotifications.length} new notifications for ${did}`);
        const latestCid = notifications[0].cid; 
        updateAccountNotificationState(did, latestCid);

        // Increment the badge counter
        newNotificationCount += newNotifications.length;
        await updateExtensionBadge(); // Update badge immediately

        newNotifications.forEach(notification => {
          sendDesktopNotification(did, notification); // Pass the full notification object
        });
      } else {
        // No change in notification list, just update timestamp if needed
        if(notificationState[did]?.lastSeenCid === lastSeen) {
           // Only update timestamp if lastSeenCid hasn't changed by another poll instance
           updateAccountNotificationState(did, lastSeen); 
        }
      }

    } catch (error: any) {
      console.error(`Error polling notifications for ${did}:`, error);
      if (error.message?.includes('Authentication Required') || error.status === 401) {
         console.warn(`Authentication error for ${did}. Stopping client.`);
         await stopPollingForAccount(did);
         stopHeadlessClient(did); // Remove from activeClients
         await removeAccountSession(did);
         await updateUIForAuthenticatedState(did); 
      }
    }
  }

  // --- Badge/Desktop Notifications ---
  async function updateExtensionBadge() {
    // Show the total count of new notifications since the last reset
    const text = newNotificationCount > 0 ? newNotificationCount.toString() : '';
    const color = newNotificationCount > 0 ? '#FF4A4A' : '#AAAAAA'; // Red when new, Grey otherwise
    try {
      await browser.action.setBadgeText({ text: text });
      await browser.action.setBadgeBackgroundColor({ color: color }); 
    } catch(e) { console.error('Error setting badge:', e); }
  }

  function sendDesktopNotification(did: string, notification: any) {
    if (!currentPreferences.showDesktopNotifications) return;

    let title = 'New Bluesky Notification';
    let message = 'You have new activity.'; // Default generic message
    const handle = activeClients[did]?.agent?.session?.handle || did;

    // Construct detailed message if preference is enabled
    if (currentPreferences.showDetailedNotifications) {
      title = `New notification for ${handle}`;
      const authorHandle = notification.author?.handle || 'Someone';
      switch (notification.reason) {
        case 'like':
          message = `${authorHandle} liked your post`;
          // Could potentially fetch the post text if record is small enough
          break;
        case 'repost':
          message = `${authorHandle} reposted your post`;
          break;
        case 'follow':
          message = `${authorHandle} started following you`;
          break;
        case 'mention':
          message = `${authorHandle} mentioned you in a post`;
          break;
        case 'reply':
          message = `${authorHandle} replied to your post`;
          break;
        case 'quote':
          message = `${authorHandle} quoted your post`;
          break;
        default:
          message = `${authorHandle} ${notification.reason || 'interacted with you'}`;
      }
    }

    console.log(`Sending notification for ${did}: ${title} - ${message}`);
    try {
      browser.notifications.create(`${did}_${notification.cid}`, { 
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/128.png'), 
        title: title,
        message: message,
        priority: 0,
      });
    } catch (e) { console.error('Error creating notification:', e); }
  }

  // --- Alarm Management for Polling --- 
  async function startPollingForAccount(did: string) {
    if (!browser.alarms) return;
    const alarmName = `${POLLING_ALARM_NAME_PREFIX}${did}`;
    const pollingInterval = currentPreferences.pollingIntervalMinutes;
    try {
      await browser.alarms.create(alarmName, {
        periodInMinutes: pollingInterval,
        delayInMinutes: Math.max(0.1, Math.random() * pollingInterval)
      });
      console.log(`Started/updated polling alarm for ${did} with interval ${pollingInterval} minutes.`);
    } catch (error) { 
      console.error(`Error starting polling alarm for ${did}:`, error);
    }
  }

  async function stopPollingForAccount(did: string) {
     if (!browser.alarms) return; 
     const alarmName = `${POLLING_ALARM_NAME_PREFIX}${did}`;
     try {
       await browser.alarms.clear(alarmName);
       console.log(`Stopped polling alarm for ${did}`);
     } catch (error) {
       console.error(`Error stopping polling alarm for ${did}:`, error);
     }
  }
  
  // Central alarm listener
  if (isRealBrowser && browser.alarms) {
    browser.alarms.onAlarm.addListener(async (alarm) => {
      // Remove old heartbeat/keepalive handling if not needed
      // if (alarm.name === 'notiskyHeartbeat' || alarm.name === 'notiskyKeepAlive') { ... }
      
      if (alarm.name.startsWith(POLLING_ALARM_NAME_PREFIX)) {
        const did = alarm.name.substring(POLLING_ALARM_NAME_PREFIX.length);
        if (did && activeClients[did]) { // Ensure client still active before polling
          await pollAccountNotifications(did);
        }
      }
    });
  }

  // --- Client Initialization / Stop --- 
  
  async function initHeadlessClientForAccount(did: string) {
    console.log(`Initializing client for DID: ${did}`);
    const session = await getAccountSession(did);

    if (!session) { console.error(`No session found for DID ${did}`); return; }
    if (activeClients[did]) { console.log(`Client already active for DID ${did}`); return; }

    const agent = new BskyAgent({ 
      service: 'https://bsky.social', 
      persistSession: (evt, session) => {
        if (evt === 'update' && session) {
          console.log(`Session updated for ${session.handle}, saving...`);
          const updatedSession: AccountSession = {
            did: session.did,
            handle: session.handle,
            accessToken: session.accessJwt,
            refreshToken: session.refreshJwt,
          };
          storeAccountSession(updatedSession);
        } else if (evt === 'expired') {
           console.warn(`Session expired event for ${did}. Stopping client.`);
           stopPollingForAccount(did);
           stopHeadlessClient(did); 
           removeAccountSession(did);
           updateUIForAuthenticatedState(did);
        }
      }
    }); 
    
    try {
      await agent.resumeSession({
        accessJwt: session.accessToken,
        refreshJwt: session.refreshToken,
        did: session.did,
        handle: session.handle
      });
      activeClients[did] = {
        agent: agent,
        // Remove interval/lastRefresh if using alarms primarily
        intervalId: null, 
        lastRefreshTime: 0, 
        notificationData: null,
        accountDid: did,
      };
      console.log(`Initialized client for ${session.handle}`);
      await startPollingForAccount(did);
      await updateExtensionBadge(); // Update badge after adding a client
    } catch (error) {
      console.error(`Failed to resume session for ${did}:`, error);
      // Remove session if resume fails (likely invalid tokens)
      await removeAccountSession(did);
      await updateUIForAuthenticatedState(did);
    }
  }

  function stopHeadlessClient(did: string) {
    if (activeClients[did]) {
      // Stop alarm first
      stopPollingForAccount(did); 
      delete activeClients[did];
      console.log(`Stopped client for DID: ${did}`);
      updateExtensionBadge(); // Update badge after removing client
    } else {
      console.warn(`Attempted to stop non-existent client for DID: ${did}`);
    }
  }

  // --- Initialization --- 
  async function initializeExtension() {
    console.log('Initializing Notisky background script...');
    // Load state/prefs first
    await Promise.all([
      loadNotificationState(),
      loadPreferences().then(prefs => { currentPreferences = prefs; })
    ]);
    const sessions = await getAllAccountSessions();
    console.log(`Found ${Object.keys(sessions).length} stored sessions.`);
    // Initialize clients without waiting for all to finish (can be slow)
    for (const did in sessions) { 
      initHeadlessClientForAccount(did).catch(e => console.error(`Init error for ${did}`, e));
    }
    // Set initial badge (likely empty as count is 0)
    await updateExtensionBadge();
    console.log('Notisky background script initialized.');
  }

  // Call initialization only in a real browser environment
  if (isRealBrowser) {
    initializeExtension().catch(err => {
      console.error('Failed to initialize Notisky background script:', err);
    });
  }

});
