import { defineBackground } from 'wxt/utils/define-background';
import { BskyAgent } from '@atproto/api';

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
    accessJwt: string;
    refreshJwt: string;
  }
  
  // Remove all websocket connection setup and related variables
  const AUTH_SERVER_URL = 'https://notisky.symm.app';
  
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
        try {
          console.log('Notisky: Received message from content script', message, sender);
          
          // First store the request timestamp in local storage for context validation
          try {
            browser.storage.local.set({
              lastMessageTimestamp: Date.now(),
              lastMessageType: message.action
            });
          } catch (storageError) {
            console.error('Notisky: Error writing to storage', storageError);
          }

          // Handle different message types
          if (message.action === 'getPreferences') {
            sendResponse({ 
              success: true, 
              preferences: userPreferences 
            });
          } 
          else if (message.action === 'updateNotificationCount') {
            updateExtensionIcon(message.count);
            sendResponse({ success: true });
          }
          else if (message.action === 'sendNotification') {
            sendNotification(message.title, message.message, message.type);
            sendResponse({ success: true });
          }
          else if (message.action === 'checkForUpdates') {
            refreshBlueskyTab();
            sendResponse({ success: true });
          }
          else if (message.action === 'ping') {
            // Simple ping to check if background script is alive
            sendResponse({ success: true, message: 'pong' });
          }
          else {
            console.error('Notisky: Unknown message action', message);
            sendResponse({ success: false, error: 'Unknown action' });
          }
        } catch (error) {
          console.error('Notisky: Error handling message', message, error);
          try {
            sendResponse({ success: false, error: error.message });
          } catch (responseError) {
            console.error('Notisky: Error sending response', responseError);
            // Try to send a simpler response if JSON serialization failed
            try {
              sendResponse({ success: false, error: "Error processing request" });
            } catch {
              // Last resort, give up gracefully
            }
          }
        }
        
        // Return true to indicate async response
        return true;
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

  // Default user preferences
  interface UserPreferences {
    updateSiteIcon: boolean;
    updateExtensionIcon: boolean;
    enableNotifications: boolean;
    keepPageAlive: boolean;
    refreshInterval: number;
    notificationServerUserId: string;
  }

  // Global variable to store user preferences
  let userPreferences: UserPreferences = {
    updateSiteIcon: true,
    updateExtensionIcon: true,
    enableNotifications: true,
    keepPageAlive: true, 
    refreshInterval: 1, // Default to 1 minute
    notificationServerUserId: ''
  };

  // Load user preferences
  function loadUserPreferences() {
    if (!isRealBrowser) {
      console.log('Notisky: In build mode, skipping loading user preferences');
      return;
    }

    try {
      browser.storage.sync.get({
        updateSiteIcon: true,
        updateExtensionIcon: true,
        enableNotifications: true,
        keepPageAlive: true,
        refreshInterval: 1,
        notificationServerUserId: ''
      }).then((items) => {
        userPreferences = items as UserPreferences;
        console.log('Notisky: Loaded user preferences', userPreferences);
        
        // Initialize auto-checking if preference is enabled
        if (userPreferences.keepPageAlive) {
          setupAutoRefresh();
        }
      }).catch(error => {
        console.error('Notisky: Error accessing storage', error);
        // Continue with defaults if storage access fails
        
        // Try to recover if storage is unavailable for a temporary reason
        setTimeout(() => {
          loadUserPreferences();
        }, 5000);
      });
    } catch (error) {
      console.error('Notisky: Error loading preferences', error);
      // Continue with defaults if storage access fails
      
      // Try to recover if storage is unavailable for a temporary reason
      setTimeout(() => {
        loadUserPreferences();
      }, 5000);
    }
  }

  // Save user preferences
  function saveUserPreferences(prefs: Partial<UserPreferences>) {
    if (!isRealBrowser) return;
    
    try {
      browser.storage.sync.set(prefs).then(() => {
        console.log('Notisky: Saved user preferences', prefs);
        
        // Update local cache
        userPreferences = { ...userPreferences, ...prefs };
        
        // Check if we need to setup or clear auto-refresh
        if ('keepPageAlive' in prefs) {
          if (prefs.keepPageAlive) {
            setupAutoRefresh();
          } else {
            clearAutoRefresh();
          }
        }
        
        // Update refresh interval if changed
        if ('refreshInterval' in prefs && userPreferences.keepPageAlive) {
          clearAutoRefresh();
          setupAutoRefresh();
        }
      }).catch(error => {
        console.error('Notisky: Error saving preferences', error);
      });
    } catch (error) {
      console.error('Notisky: Error saving preferences', error);
    }
  }

  // Setup the alarm for auto-refreshing Bluesky in the background
  function setupAutoRefresh() {
    if (!isRealBrowser) return;
    
    const alarmName = 'notiskyAutoRefresh';
    
    // Clear any existing alarm first
    browser.alarms.clear(alarmName).then(() => {
      // Create a new alarm
      browser.alarms.create(alarmName, {
        periodInMinutes: 15 // Check every 15 minutes
      });
      
      console.log('Notisky: Auto-refresh alarm set for every 15 minutes');
    });
  }

  // Clear the auto-refresh alarm
  function clearAutoRefresh() {
    if (!isRealBrowser) return;
    
    browser.alarms.clear('notiskyAutoRefresh').then((wasCleared) => {
      if (wasCleared) {
        console.log('Notisky: Auto-refresh alarm cleared');
      }
    });
  }

  // Function to find a Bluesky tab or create one
  async function findOrCreateBlueskyTab() {
    if (!isRealBrowser) return null;
    
    try {
      // Check for existing Bluesky tabs
      const tabs = await browser.tabs.query({
        url: ['*://bsky.app/*', '*://*.bsky.social/*']
      });
      
      if (tabs.length > 0) {
        // Return the first found tab
        return tabs[0];
      } else {
        // Create a new Bluesky tab
        return await browser.tabs.create({
          url: 'https://bsky.app/',
          active: false // Create in background
        });
      }
    } catch (error) {
      console.error('Notisky: Error finding or creating Bluesky tab', error);
      return null;
    }
  }

  // Function to refresh a Bluesky tab or ping content script
  async function refreshBlueskyTab() {
    if (!isRealBrowser || !userPreferences.keepPageAlive) return;
    
    try {
      // Find an existing Bluesky tab or create one
      const tab = await findOrCreateBlueskyTab();
      
      if (tab && tab.id) {
        // Send a message to the content script to check for updates
        browser.tabs.sendMessage(tab.id, {
          action: 'checkForUpdates'
        }).catch(error => {
          console.log('Notisky: Content script not responsive, refreshing tab', error);
          
          // If messaging fails, reload the tab
          browser.tabs.reload(tab.id);
        });
      }
    } catch (error) {
      console.error('Notisky: Error refreshing Bluesky tab', error);
    }
  }

  // Helper function to update the extension icon
  function updateExtensionIcon(count: number) {
    if (!isRealBrowser || !userPreferences.updateExtensionIcon) return;
    
    try {
      if (count > 0) {
        // Use different methods based on what's available
        if (typeof browser.action !== 'undefined') {
          // If action API is available (MV3)
          setNotificationBadgeIcon(count);
        } else if (typeof browser.browserAction !== 'undefined') {
          // Fall back to browserAction for MV2 support
          setNotificationBadgeIcon(count);
        } else {
          // No proper action API available, use text badge as fallback
          fallbackToBadgeAPI(count);
        }
      } else {
        // Reset to default icon
        if (typeof browser.action !== 'undefined') {
          // MV3
          browser.action.setIcon({
            path: {
              16: 'icon/16.png',
              32: 'icon/32.png',
              48: 'icon/48.png',
              128: 'icon/128.png'
            }
          }).catch(error => {
            console.error('Notisky: Error resetting extension icon', error);
            // Try the fallback method if the primary method fails
            fallbackToBadgeAPI(0);
          });
          
          // Also clear badge text when count is 0
          browser.action.setBadgeText({ text: '' }).catch(error => {
            console.error('Notisky: Error clearing badge text', error);
          });
        } else if (typeof browser.browserAction !== 'undefined') {
          // MV2
          browser.browserAction.setIcon({
            path: {
              16: 'icon/16.png',
              32: 'icon/32.png',
              48: 'icon/48.png',
              128: 'icon/128.png'
            }
          }).catch(error => {
            console.error('Notisky: Error resetting extension icon', error);
            fallbackToBadgeAPI(0);
          });
          
          browser.browserAction.setBadgeText({ text: '' }).catch(error => {
            console.error('Notisky: Error clearing badge text', error);
          });
        } else {
          // No standard API available
          console.warn('Notisky: No action API available for resetting icon');
        }
      }
    } catch (error) {
      console.error('Notisky: Error updating extension icon', error);
      // Try fallback method
      try {
        fallbackToBadgeAPI(count);
      } catch (fallbackError) {
        console.error('Notisky: Fallback badge update also failed', fallbackError);
      }
    }
  }

  // Helper function to set the notification badge icon
  function setNotificationBadgeIcon(count: number | string) {
    try {
      let iconType: string;
      
      // Determine icon type
      if (typeof count === 'number') {
        if (count > 30) {
          iconType = '30plus';
        } else {
          iconType = count.toString();
        }
      } else {
        iconType = count;
      }
      
      // Use pre-rendered badge icon if available, or dynamically generate if not
      if (badgeIconFilesExist(iconType)) {
        // Use pre-rendered badge icon paths
        browser.action.setIcon({
          path: {
            16: `/icon/notification/${iconType}_16.png`,
            32: `/icon/notification/${iconType}_32.png`,
            48: `/icon/notification/${iconType}_48.png`,
            128: `/icon/notification/${iconType}_128.png`
          }
        });
        
        // Clear any badge text as the count is embedded in the badge icon
        browser.action.setBadgeText({ text: '' });
      } else {
        // If pre-rendered badge doesn't exist, fallback to dynamic generation
        dynamicallyGenerateNotificationBadge(typeof count === 'number' ? count : Number.parseInt(count) || 9);
      }
    } catch (error) {
      console.error('Notisky: Error setting notification badge icon', error);
      // Last resort - use badge API
      fallbackToBadgeAPI(typeof count === 'number' ? count : Number.parseInt(count) || 9);
    }
  }
  
  // Check if the notification badge icon files exist
  function badgeIconFilesExist(iconType: string): boolean {
    try {
      // In production, we have pre-generated all the badge icons (1-30 and 30+)
      // so we can return true as they will be included in the build
      if (process.env.NODE_ENV === 'production') {
        return true;
      }
      
      // For development, try to verify if the file exists
      // This works in modern browsers that support fetch() for extension resources
      const testIcon = new Image();
      let iconExists = false;
      
      // Set up a promise that resolves when the image loads or fails
      let imagePromise = new Promise<boolean>((resolve) => {
        testIcon.onload = () => {
          iconExists = true;
          resolve(true);
        };
        
        testIcon.onerror = () => {
          iconExists = false;
          resolve(false);
        };
        
        // Set a timeout in case the image loading hangs
        setTimeout(() => resolve(false), 200);
      });
      
      // Try to load the badge icon
      testIcon.src = browser.runtime.getURL(`/icon/notification/${iconType}_16.png`);
      
      // If imagePromise immediately resolves to true, we know the file exists
      if (iconExists) {
        return true;
      }
      
      // Default to false in development
      return false;
    } catch (error) {
      console.log('Notisky: Error checking badge icon existence, falling back to dynamic generation', error);
      return false;
    }
  }
  
  // Function to dynamically generate a notification badge icon
  function dynamicallyGenerateNotificationBadge(count: number) {
    // Generate custom badge icon with notification count
    generateBadgeIconWithCount(count).then(iconData => {
      // If we successfully generated the icon data
      if (Object.keys(iconData).length > 0) {
        // Set the icon with our custom badge
        browser.action.setIcon({ 
          imageData: iconData
        });
        
        // Clear any existing badge text since we're embedding it in the badge icon
        browser.action.setBadgeText({ text: '' });
      } else {
        // Fall back to badge API if generation returned empty data
        fallbackToBadgeAPI(count);
      }
    }).catch(error => {
      console.error('Notisky: Error generating notification badge', error);
      // Fall back to badge API
      fallbackToBadgeAPI(count);
    });
  }
  
  // Function to generate badge icon with embedded count
  async function generateBadgeIconWithCount(count: number): Promise<{[key: number]: ImageData}> {
    // Create icons for all required sizes
    const iconSizes = [16, 32, 48, 128];
    const iconData: {[key: number]: ImageData} = {};
    
    try {
      for (const size of iconSizes) {
        // Check if OffscreenCanvas is supported
        if (typeof OffscreenCanvas !== 'undefined') {
          // Use OffscreenCanvas (more efficient)
          const canvas = new OffscreenCanvas(size, size);
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            throw new Error('Failed to get canvas context');
          }
          
          // Create a transparent background
          ctx.clearRect(0, 0, size, size);
          
          // Add notification badge (centered red circle with count)
          drawBadge(ctx, size, count);
          
          // Get image data
          iconData[size] = ctx.getImageData(0, 0, size, size);
        } else {
          // Fallback to regular Canvas for Safari and older browsers
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            throw new Error('Failed to get canvas context');
          }
          
          // Create a transparent background
          ctx.clearRect(0, 0, size, size);
          
          // Add notification badge
          drawBadge(ctx, size, count);
          
          // Get image data
          iconData[size] = ctx.getImageData(0, 0, size, size);
        }
      }
    } catch (error) {
      console.error('Notisky: Error generating badge icon', error);
      // Fall back to default badge API if icon generation fails
      fallbackToBadgeAPI(count);
    }
    
    return iconData;
  }
  
  // Helper function to draw the badge on a canvas context
  function drawBadge(ctx: CanvasRenderingContext2D, size: number, count: number) {
    // Calculate badge size to fill most of the icon space
    const badgeSize = Math.max(size * 0.9, 14); // 90% of icon size
    const badgeX = size / 2; // Center horizontally
    const badgeY = size / 2; // Center vertically
    
    // Draw red circle background
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeSize/2, 0, Math.PI * 2);
    ctx.fillStyle = '#FF4A4A'; // Red badge color
    ctx.fill();
    
    // Format count text
    let countText = count.toString();
    if (count > 30) {
      countText = '30+';
    }
    
    // Add white text
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Scale font size based on badge size and character count
    const fontSize = Math.max(badgeSize * 0.5, 7); // 50% of badge size
    ctx.font = `bold ${fontSize}px Arial`;
    
    // Adjust font size if text is too long
    if (countText.length > 1) {
      ctx.font = `bold ${fontSize * 0.8}px Arial`;
    }
    if (countText.length > 2) {
      ctx.font = `bold ${fontSize * 0.7}px Arial`;
    }
    
    ctx.fillText(countText, badgeX, badgeY);
  }
  
  // Fallback method using badge text API
  function fallbackToBadgeAPI(count: number) {
    console.log('Notisky: Falling back to badge API');
    
    try {
      if (count > 0) {
        // Format badge text
        const badgeText = count > 30 ? '30+' : count.toString();
        
        // Set badge text
        browser.action.setBadgeText({ text: badgeText });
        
        // Set badge color
        browser.action.setBadgeBackgroundColor({ color: '#FF4A4A' });
        
        // Set text color if supported
        if (typeof browser.action.setBadgeTextColor === 'function') {
          browser.action.setBadgeTextColor({ color: '#FFFFFF' });
        }
      } else {
        // Clear badge
        browser.action.setBadgeText({ text: '' });
      }
    } catch (error) {
      console.error('Notisky: Error in badge API fallback', error);
    }
  }

  // Try to recover badge state on load/reload
  async function recoverBadgeState() {
    if (!isRealBrowser || !userPreferences.updateExtensionIcon) {
      return;
    }
    
    try {
      // Check if we have a saved badge state
      const storage = await browser.storage.local.get('badgeState');
      if (storage.badgeState) {
        console.log('Notisky: Recovering badge state');
        
        const { count, timestamp } = storage.badgeState;
        
        // Only recover if the badge state is from the last hour
        const isRecent = Date.now() - timestamp < 60 * 60 * 1000;
        
        if (isRecent && count > 0) {
          console.log('Notisky: Restoring notification count:', count);
          // Update the icon with the saved count
          updateExtensionIcon(count);
        } else {
          console.log('Notisky: Badge state is outdated, clearing');
          // Clear outdated badge state
          browser.storage.local.remove('badgeState');
          
          // Reset to default icon
          browser.action.setIcon({ 
            path: {
              16: '/icon/16.png',
              32: '/icon/32.png',
              48: '/icon/48.png',
              128: '/icon/128.png'
            } 
          });
          
          // Clear any badge
          browser.action.setBadgeText({ text: '' });
        }
      } else {
        console.log('Notisky: No badge state to recover');
      }
    } catch (error) {
      console.error('Notisky: Error recovering badge state', error);
      
      // Make sure the icon is reset to default if recovery fails
      browser.action.setIcon({ 
        path: {
          16: '/icon/16.png',
          32: '/icon/32.png',
          48: '/icon/48.png',
          128: '/icon/128.png'
        } 
      });
      
      // Clear any badge
      browser.action.setBadgeText({ text: '' });
    }
  }

  // Function to send a notification
  function sendNotification(title: string, message: string, type: string = 'notification') {
    if (!isRealBrowser || !userPreferences.enableNotifications) return;
    
    try {
      // Create notification options
      const options = {
        type: 'basic' as browser.notifications.TemplateType,
        title: title,
        message: message,
        iconUrl: type === 'notification' 
          ? browser.runtime.getURL('icon/notification/icon-128.png')
          : browser.runtime.getURL('icon/message/icon-128.png')
      };
      
      // Create unique ID for notification
      const notificationId = `notisky-${type}-${Date.now()}`;
      
      // Show notification
      browser.notifications.create(notificationId, options)
        .catch(error => {
          console.error('Notisky: Error creating notification', error);
        });
    } catch (error) {
      console.error('Notisky: Error sending notification', error);
      // Try a more basic approach if the first method fails
      try {
        // Simplified notification as fallback
        const basicOptions = {
          type: 'basic' as browser.notifications.TemplateType,
          title: title,
          message: message,
          iconUrl: browser.runtime.getURL('icon/128.png')
        };
        
        browser.notifications.create(`notisky-basic-${Date.now()}`, basicOptions)
          .catch(basicError => {
            console.error('Notisky: Error creating basic notification', basicError);
          });
      } catch (fallbackError) {
        console.error('Notisky: Error sending fallback notification', fallbackError);
      }
    }
  }

  // Initalize headless clients for all accounts
  async function initHeadlessClients() {
    try {
      // Get stored accounts from browser storage
      const { accounts = [] } = await browser.storage.local.get('accounts');
      
      console.log(`Initializing ${accounts.length} headless clients`);
      
      // Initialize a headless client for each account
      for (const account of accounts) {
        await initHeadlessClientForAccount(account);
      }
    } catch (error) {
      console.error('Error initializing headless clients:', error);
    }
  }
  
  // Initialize a headless client for a single account
  async function initHeadlessClientForAccount(account: AccountSession) {
    try {
      // Check if client already exists
      if (activeClients[account.did]) {
        console.log(`Headless client for ${account.handle} (${account.did}) already running`);
        return;
      }
      
      console.log(`Initializing headless client for ${account.handle} (${account.did})`);
      
      // Create a new agent
      const agent = new BskyAgent({ service: 'https://bsky.social' });
      
      // Resume session with existing tokens
      try {
        await agent.resumeSession({
          did: account.did,
          handle: account.handle,
          refreshJwt: account.refreshJwt,
          accessJwt: account.accessJwt,
          active: true  // Add the missing 'active' property
        });
        
        console.log(`Resumed session for ${account.handle} (${account.did})`);
      } catch (resumeError) {
        console.error(`Error resuming session for ${account.handle}:`, resumeError);
        return;
      }
      
      // Get user preferences for refresh interval
      const { preferences } = await browser.storage.sync.get({
        preferences: { refreshInterval: 30000 }
      });
      
      // Default to 30 seconds if not specified
      const refreshInterval = preferences.refreshInterval || 30000;
      
      // Initialize client state
      activeClients[account.did] = {
        agent,
        interval: null,
        lastRefresh: 0,
        notificationData: null
      };
      
      // Set up the refresh interval
      activeClients[account.did].interval = window.setInterval(async () => {
        await refreshNotifications(account.did);
      }, refreshInterval);
      
      // Do an initial refresh
      await refreshNotifications(account.did);
      
    } catch (error) {
      console.error(`Error initializing headless client for ${account.did}:`, error);
    }
  }
  
  // Stop a headless client
  function stopHeadlessClient(did: string) {
    if (activeClients[did]) {
      console.log(`Stopping headless client for ${did}`);
      if (activeClients[did].interval !== null) {
        clearInterval(activeClients[did].interval);
      }
      delete activeClients[did];
    }
  }
  
  // Stop all headless clients
  function stopAllHeadlessClients() {
    Object.keys(activeClients).forEach(did => {
      stopHeadlessClient(did);
    });
  }
  
  // Refresh notifications for an account
  async function refreshNotifications(did: string) {
    if (!activeClients[did]) {
      console.warn(`No headless client found for ${did}`);
      return;
    }
    
    const client = activeClients[did];
    
    try {
      // Mark the start of refresh
      client.lastRefresh = Date.now();
      
      // Get the agent
      const agent = client.agent;
      
      // Check if the session is expired and needs refresh
      if (!agent.session) {
        console.log(`Session expired for ${did}, attempting to restore from storage`);
        
        // Try to get session from browser storage
        const { accounts = [] } = await browser.storage.local.get('accounts');
        const account = accounts.find((acc: AccountSession) => acc.did === did);
        
        if (!account) {
          console.error(`No account found for ${did}, stopping headless client`);
          stopHeadlessClient(did);
          return;
        }
        
        // Resume session with stored tokens
        try {
          await agent.resumeSession({
            did: account.did,
            handle: account.handle,
            refreshJwt: account.refreshJwt,
            accessJwt: account.accessJwt,
            active: true
          });
          
          console.log(`Resumed session for ${account.handle} (${account.did})`);
          
          // Update session in storage (in case tokens were refreshed)
          if (agent.session) {
            // Find account index
            const accountIndex = accounts.findIndex((acc: AccountSession) => acc.did === did);
            if (accountIndex !== -1) {
              // Update tokens
              accounts[accountIndex].accessJwt = agent.session.accessJwt || account.accessJwt;
              accounts[accountIndex].refreshJwt = agent.session.refreshJwt || account.refreshJwt;
              
              // Save updated accounts
              await browser.storage.local.set({ accounts });
            }
          }
        } catch (resumeError) {
          console.error(`Failed to resume session for ${did}, stopping headless client`, resumeError);
          stopHeadlessClient(did);
          return;
        }
      }
      
      // Fetch unread notification count
      const notificationCount = await fetchUnreadNotificationCount(agent);
      
      // Fetch unread message count
      const messageCount = await fetchUnreadMessageCount(agent);
      
      // Get current timestamp
      const timestamp = Date.now();
      
      // Get account info
      const accountInfo = {
        did: agent.session!.did,
        handle: agent.session!.handle
      };
      
      // Fetch raw notifications
      const notifications = await fetchRawNotifications(agent);
      
      // Fetch raw messages
      const messages = await fetchRawMessages(agent);
      
      // Calculate total count
      const totalCount = notificationCount + messageCount;
      
      // Create notification data object
      const notificationData: NotificationData = {
        notification: notificationCount,
        message: messageCount,
        total: totalCount,
        notifications,
        messages,
        accountInfo,
        timestamp
      };
      
      // Store the notification data
      client.notificationData = notificationData;
      
      // Process notification update
      processNotificationUpdate([notificationData]);
      
    } catch (error) {
      console.error(`Error refreshing notifications for ${did}:`, error);
    }
  }
  
  // Helper function to fetch unread notification count
  async function fetchUnreadNotificationCount(agent: BskyAgent): Promise<number> {
    try {
      const response = await agent.countUnreadNotifications();
      return response.data.count || 0;
    } catch (error) {
      console.error('Error fetching unread notification count:', error);
      return 0;
    }
  }
  
  // Helper function to fetch raw notifications
  async function fetchRawNotifications(agent: BskyAgent): Promise<any[]> {
    try {
      const response = await agent.listNotifications({ limit: 15 });
      return response.data.notifications || [];
    } catch (error) {
      console.error('Error fetching raw notifications:', error);
      return [];
    }
  }
  
  // Helper function to fetch unread message count
  async function fetchUnreadMessageCount(agent: BskyAgent): Promise<number> {
    try {
      // Using the custom API for unread count, but need to check if it exists
      if (agent.app?.bsky?.unspecced && typeof agent.app.bsky.unspecced.getUnreadCount === 'function') {
        const response = await agent.app.bsky.unspecced.getUnreadCount();
        return response.data.count || 0;
      }
      return 0;
    } catch (error) {
      console.error('Error fetching unread message count:', error);
      return 0;
    }
  }

  // REPLACE handleNotificationsUpdate with processNotificationUpdate
  function processNotificationUpdate(notificationsData: NotificationData[]) {
    if (!notificationsData || !Array.isArray(notificationsData) || notificationsData.length === 0) {
      console.log('Notisky: No notification data received');
      return;
    }
    
    try {
      // Calculate total notifications across all accounts
      let totalCount = 0;
      let notificationCount = 0;
      let messageCount = 0;
      
      notificationsData.forEach(data => {
        totalCount += data.total || 0;
        notificationCount += data.notification || 0;
        messageCount += data.message || 0;
      });
      
      console.log(`Notisky: Notification update - total: ${totalCount}, notifications: ${notificationCount}, messages: ${messageCount}`);
      
      // Update counts in storage
      browser.storage.local.set({
        notificationCounts: {
          total: totalCount,
          notification: notificationCount,
          message: messageCount
        }
      });
      
      // Update extension icon
      updateExtensionIcon(totalCount);
      
      // Send notifications if enabled
      if (userPreferences.enableNotifications && totalCount > 0) {
        // Create a notification for each account that has notifications
        notificationsData.forEach(data => {
          if (data.total > 0) {
            const notificationTitle = `Bluesky Notifications for @${data.accountInfo.handle}`;
            let notificationMessage = '';
            
            if (data.notification > 0) {
              notificationMessage += `${data.notification} notification${data.notification !== 1 ? 's' : ''}`;
            }
            
            if (data.message > 0) {
              if (notificationMessage) {
                notificationMessage += ' and ';
              }
              notificationMessage += `${data.message} message${data.message !== 1 ? 's' : ''}`;
            }
            
            sendNotification(notificationTitle, notificationMessage, 'notification');
          }
        });
      }
    } catch (error) {
      console.error('Notisky: Error processing notification update', error);
    }
  }

  // Send message via WebSocket 
  function sendWebSocketMessage(message: any) {
    // WebSocket functionality is now deprecated as we're moving to a browser extension-only model
    console.log('Notisky: WebSocket functionality is deprecated - using direct method instead');
    
    // Handle any logic that previously depended on WebSocket here
    if (message && message.type === 'subscribe') {
      // If this was a subscribe message, we'll need to handle account updates locally
      handleAccountsUpdate([]);
    }
  }

  // Deprecated WebSocket setup function - no longer connects to remote servers
  async function setupWebSocketConnection() {
    console.log('Notisky: WebSocket connections are deprecated - using extension-only model');
    return;
  }

  function checkWebSocketHealth() {
    // WebSocket functionality is deprecated
    return;
  }

  // Main initialization
  function initialize() {
    console.log('Notisky: Initializing background script');
    
    // Load user preferences
    loadUserPreferences();
    
    // Set up heartbeat alarm for context persistence detection
    if (isRealBrowser && browser.alarms) {
      try {
        browser.alarms.create('notiskyHeartbeat', {
          periodInMinutes: 1
        });
      } catch (error) {
        console.error('Notisky: Error creating alarm', error);
      }
    }
    
    // Always try to connect to the auth server
    setupWebSocketConnection();
    
    // Set up a health check timer for WebSocket connection
    setInterval(checkWebSocketHealth, 60000); // Check every minute
    
    // Set up an alarm to periodically try reconnecting if needed
    if (isRealBrowser && browser.alarms) {
      try {
        browser.alarms.create('notiskyServerConnect', {
          periodInMinutes: 5 // Check every 5 minutes
        });
        
        browser.alarms.onAlarm.addListener((alarm) => {
          if (alarm.name === 'notiskyServerConnect') {
            checkWebSocketHealth();
          }
        });
      } catch (error) {
        console.error('Notisky: Error creating server connection alarm', error);
      }
    }
    
    // Initialize headless clients for any existing accounts
    initHeadlessClients();
  }
  
  // Call initialize on start
  initialize();

  // Listen for preference updates
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'preferencesUpdated') {
      console.log('Notisky: Preferences updated, reconnecting WebSocket if needed');
      setupWebSocketConnection();
      
      // Update polling intervals
      updatePollingIntervals();
      
      sendResponse({ success: true });
    }
    return true;
  });
  
  // Update polling intervals based on user preferences
  async function updatePollingIntervals() {
    try {
      const { preferences } = await browser.storage.sync.get({
        preferences: { refreshInterval: 30000 }
      });
      
      // Default to 30 seconds if not specified
      const refreshInterval = preferences.refreshInterval || 30000;
      
      // Update intervals for all clients
      Object.keys(activeClients).forEach(did => {
        const client = activeClients[did];
        
        // Clear existing interval
        if (client.interval !== null) {
          clearInterval(client.interval);
        }
        
        // Set new interval
        client.interval = window.setInterval(async () => {
          await refreshNotifications(did);
        }, refreshInterval);
      });
      
    } catch (error) {
      console.error('Notisky: Error updating polling intervals', error);
    }
  }

  // On startup, recover state and init
  if (isRealBrowser) {
    // First load preferences
    loadUserPreferences();
    
    // Recover badge state
    recoverBadgeState();
    
    // Register for startup events
    if (browser.runtime && browser.runtime.onStartup) {
      browser.runtime.onStartup.addListener(() => {
        console.log('Notisky: Browser starting up, initializing extension');
        loadUserPreferences();
        recoverBadgeState();
      });
    }
    
    // Register for install/update events
    if (browser.runtime && browser.runtime.onInstalled) {
      browser.runtime.onInstalled.addListener((details) => {
        console.log('Notisky: Extension installed or updated', details);
        loadUserPreferences();
        
        // Create a welcome notification for new installations
        if (details.reason === 'install') {
          sendNotification(
            'Notisky Installed',
            'Thank you for installing Notisky! The extension will now show notifications for new Bluesky activity.',
            'notification'
          );
        }
      });
    }
  }

  // Add these new functions to handle direct polling and OAuth

  // Directly poll Bluesky for notifications
  async function pollBlueskyNotifications(session: AccountSession) {
    try {
      const agent = new BskyAgent({ service: 'https://bsky.social' });
      
      // Resume the session with stored tokens
      await agent.resumeSession({
        did: session.did,
        handle: session.handle,
        accessJwt: session.accessJwt,
        refreshJwt: session.refreshJwt
      });
      
      // Get unread notification count
      const notifications = await agent.listNotifications({
        limit: 30
      });
      
      // Handle notifications
      const unreadCount = notifications.data.notifications.filter(
        notification => !notification.isRead
      ).length;
      
      // Get unread message count
      let unreadMessageCount = 0;
      try {
        const feeds = await agent.app.bsky.feed.getTimeline({ limit: 1 });
        if (feeds.success) {
          const feedView = feeds.data;
          if (feedView && feedView.view) {
            // Check if feedView.view contains unreadCount property
            const messages = await agent.countUnreadNotifications();
            unreadMessageCount = messages.count;
          }
        }
      } catch (messageError) {
        console.error('Error checking unread messages:', messageError);
      }
      
      // Build notification data
      const notificationData: NotificationData = {
        notification: unreadCount,
        message: unreadMessageCount,
        total: unreadCount + unreadMessageCount,
        notifications: notifications.data.notifications,
        messages: [], // We don't load all messages for efficiency
        accountInfo: {
          did: session.did,
          handle: session.handle,
        },
        timestamp: Date.now()
      };
      
      // Update badge and show notifications
      updateNotificationBadge(session.did, notificationData);
      
      // Store the notifications data
      try {
        const { accountNotifications = [] } = await browser.storage.local.get('accountNotifications');
        
        // Find existing notifications for this account
        const existingIndex = accountNotifications.findIndex(
          (an: any) => an.did === session.did
        );
        
        if (existingIndex >= 0) {
          // Update existing notifications
          accountNotifications[existingIndex] = {
            did: session.did,
            handle: session.handle,
            notification: notificationData.notification,
            message: notificationData.message,
            total: notificationData.total,
            timestamp: notificationData.timestamp
          };
        } else {
          // Add new notifications
          accountNotifications.push({
            did: session.did,
            handle: session.handle,
            notification: notificationData.notification,
            message: notificationData.message,
            total: notificationData.total,
            timestamp: notificationData.timestamp
          });
        }
        
        // Save to storage
        await browser.storage.local.set({ accountNotifications });
        
        // Also update global notification counts for backward compatibility
        await browser.storage.local.set({
          notificationCounts: {
            notification: unreadCount,
            message: unreadMessageCount,
            total: unreadCount + unreadMessageCount,
            timestamp: Date.now()
          }
        });
      } catch (storageError) {
        console.error('Error storing notification data:', storageError);
      }
      
      return notificationData;
    } catch (error) {
      console.error('Error polling notifications:', error);
      if (error.message?.includes('token') || error.message?.includes('authentication')) {
        // Handle token refresh issues
        await refreshBskySession(session);
      }
      return null;
    }
  }

  // Function to refresh token
  async function refreshBskySession(session: AccountSession) {
    try {
      const agent = new BskyAgent({ service: 'https://bsky.social' });
      
      // Resume with refresh token
      const refreshed = await agent.resumeSession({
        did: session.did,
        handle: session.handle,
        accessJwt: session.accessJwt,
        refreshJwt: session.refreshJwt
      });
      
      // Update stored tokens
      await browser.storage.local.get('accounts').then(({ accounts = [] }) => {
        const updatedAccounts = accounts.map((account: AccountSession) => {
          if (account.did === session.did) {
            return {
              ...account,
              accessJwt: refreshed.accessJwt,
              refreshJwt: refreshed.refreshJwt
            };
          }
          return account;
        });
        
        return browser.storage.local.set({ accounts: updatedAccounts });
      });
      
      return true;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return false;
    }
  }

  // Set up regular polling via browser alarm
  browser.alarms.create('pollNotifications', { periodInMinutes: 1 });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'pollNotifications') {
      // Get all accounts and poll each one
      const { accounts = [] } = await browser.storage.local.get('accounts');
      
      for (const account of accounts) {
        await pollBlueskyNotifications(account);
      }
    }
  });

  // Generate a random string for PKCE
  function generateRandomString(length: number) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Generate code challenge for PKCE
  async function generateCodeChallenge(verifier: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // Function to initiate OAuth flow
  async function startOAuthFlow() {
    try {
      // Generate state and PKCE values
      const state = crypto.randomUUID();
      const codeVerifier = generateRandomString(64);
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      
      // Store extension ID in localStorage so the auth page can send back to us
      const extensionId = browser.runtime.id;
      
      // Store in extension storage
      const { oauth_states = {} } = await browser.storage.local.get('oauth_states');
      oauth_states[state] = {
        codeVerifier,
        createdAt: Date.now()
      };
      await browser.storage.local.set({ oauth_states });
      
      // Construct the authorization URL
      const authUrl = `https://bsky.app/intent/oauth?client_id=${encodeURIComponent(
        'https://notisky.symm.app/.well-known/oauth-client-metadata.json'
      )}&redirect_uri=${encodeURIComponent(
        'https://notisky.symm.app/auth/callback'
      )}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256&scope=com.atproto.feed:read%20com.atproto.notification:read`;
      
      // Store extension ID in local storage on the auth page
      const authPageUrl = `https://notisky.symm.app/?extensionId=${extensionId}&action=storeExtensionId`;
      
      // First, create a tab to store the extension ID
      const storeTab = await browser.tabs.create({ url: authPageUrl });
      
      // Wait a moment to ensure the extension ID is stored
      setTimeout(async () => {
        // Now open the actual auth URL
        await browser.tabs.update(storeTab.id!, { url: authUrl });
      }, 1000);
      
      return true;
    } catch (error) {
      console.error('Error starting OAuth flow:', error);
      return false;
    }
  }

  // Handle message from popup or content script
  browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === 'startOAuthFlow') {
      const success = await startOAuthFlow();
      sendResponse({ success });
      return true;
    }
  });

  // Handle incoming messages from the auth page
  browser.runtime.onMessageExternal.addListener(
    async (message, sender, sendResponse) => {
      // Verify sender is from our auth page
      if (sender.url && sender.url.startsWith('https://notisky.symm.app')) {
        console.log('Received external message:', message);
        
        if (message.type === 'oauth_callback') {
          const { code, state } = message;
          
          // Get the state from storage to verify
          const { oauth_states = {} } = await browser.storage.local.get('oauth_states');
          const savedState = oauth_states[state];
          
          if (!savedState) {
            sendResponse({ success: false, error: 'Invalid state' });
            return;
          }
          
          try {
            // Exchange code for tokens with Bluesky
            const tokenResponse = await fetch('https://bsky.social/xrpc/com.atproto.server.getServiceAuth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: code,
                code_verifier: savedState.codeVerifier
              })
            });
            
            if (!tokenResponse.ok) {
              throw new Error('Token exchange failed');
            }
            
            const tokenData = await tokenResponse.json();
            
            // Get user profile
            const agent = new BskyAgent({ service: 'https://bsky.social' });
            await agent.resumeSession(tokenData);
            const profile = await agent.app.bsky.actor.getProfile({ actor: agent.session?.did as string });
            
            // Create account session
            const accountSession = {
              did: agent.session?.did as string,
              handle: profile.data.handle,
              accessJwt: tokenData.accessJwt,
              refreshJwt: tokenData.refreshJwt
            };
            
            // Store account
            const { accounts = [] } = await browser.storage.local.get('accounts');
            const accountExists = accounts.some(account => account.did === accountSession.did);
            
            if (accountExists) {
              // Update existing account
              const updatedAccounts = accounts.map(account => {
                if (account.did === accountSession.did) {
                  return accountSession;
                }
                return account;
              });
              
              await browser.storage.local.set({ accounts: updatedAccounts });
            } else {
              // Add new account
              await browser.storage.local.set({ 
                accounts: [...accounts, accountSession] 
              });
            }
            
            // Immediately poll for notifications
            await pollBlueskyNotifications(accountSession);
            
            // Clean up the state
            delete oauth_states[state];
            await browser.storage.local.set({ oauth_states });
            
            sendResponse({ success: true });
          } catch (error) {
            console.error('OAuth error:', error);
            sendResponse({ success: false, error: error.message });
          }
        } else if (message.type === 'checkConnection') {
          // Respond to connection check
          sendResponse({ success: true, extensionId: browser.runtime.id });
        }
      }
      
      return true; // Required for async sendResponse
    }
  );
});
