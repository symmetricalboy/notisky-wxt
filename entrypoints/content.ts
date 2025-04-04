import { defineContentScript } from 'wxt/utils/define-content-script';

// Content script for Notisky Browser Extension
// This script runs on Bluesky to monitor notification and message badges

export default defineContentScript({
  matches: ['*://bsky.app/*', '*://*.bsky.social/*'],
  main() {
    console.log('Notisky content script loaded');

    // Check if we're in a real browser environment (vs. build environment)
    const isRealBrowser = (() => {
      try {
        return typeof browser !== 'undefined' && 
              typeof browser.runtime !== 'undefined' &&
              typeof browser.runtime.sendMessage === 'function' &&
              !browser.runtime.sendMessage.toString().includes('not implemented');
      } catch (e) {
        console.log('Notisky: Not in a real browser environment', e);
        return false;
      }
    })();
    
    let lastNotificationCount = 0;
    let lastMessageCount = 0;
    let isObserving = false;
    let updateTimer: number | null = null;
    let originalFavicon: string | null = null; // Store the original favicon URL
    
    // User preferences with defaults
    interface UserPreferences {
      updateSiteIcon: boolean;
      updateExtensionIcon: boolean;
      enableNotifications: boolean;
      keepPageAlive: boolean;
      refreshInterval: number;
    }
    
    let userPreferences: UserPreferences = {
      updateSiteIcon: true,
      updateExtensionIcon: true,
      enableNotifications: true,
      keepPageAlive: true,
      refreshInterval: 1 // Default to 1 minute
    };
    
    // Variables to track extension context state
    let extensionContextValid = true;
    let reconnectAttemptTimer: number | null = null;
    let reconnectAttemptCount = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    const RECONNECT_DELAY = 5000; // 5 seconds between reconnect attempts
    
    // Save the original favicon when the page loads
    function saveOriginalFavicon() {
      try {
        console.log('Notisky: Attempting to save original favicon');
        
        // First, check if we already have one saved
        if (originalFavicon) {
          console.log('Notisky: Original favicon already saved:', originalFavicon);
          return;
        }
        
        // Look for favicon link tags
        const faviconLinks = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
        if (faviconLinks.length > 0) {
          // Use the first favicon link found
          originalFavicon = faviconLinks[0].getAttribute('href');
          console.log('Notisky: Saved original favicon:', originalFavicon);
          
          // Check if the favicon URL is valid
          if (!originalFavicon) {
            console.log('Notisky: Invalid href attribute on favicon link, using default');
            originalFavicon = 'https://bsky.app/static/favicon-32x32.png';
            return;
          }
          
          // Try to create a URL object to check if it's a valid URL
          try {
            // Some favicons might be relative paths or data URLs, handle them carefully
            let faviconUrl: URL;
            
            if (originalFavicon.startsWith('data:')) {
              // It's a data URL, which is fine to use directly
              console.log('Notisky: Favicon is a data URL, using as-is');
              return;
            } else if (originalFavicon.startsWith('http://') || originalFavicon.startsWith('https://')) {
              // Absolute URL
              faviconUrl = new URL(originalFavicon);
              
              // Check if the favicon URL is from the same origin
              const currentUrl = new URL(window.location.href);
              if (faviconUrl.origin !== currentUrl.origin) {
                console.log('Notisky: Favicon is from different origin, using default to avoid CORS issues');
                originalFavicon = 'https://bsky.app/static/favicon-32x32.png';
              }
            } else {
              // Relative URL, make it absolute
              console.log('Notisky: Converting relative favicon URL to absolute');
              faviconUrl = new URL(originalFavicon, window.location.href);
              originalFavicon = faviconUrl.href;
            }
          } catch (urlError) {
            console.log('Notisky: Error parsing favicon URL, using default', urlError);
            originalFavicon = 'https://bsky.app/static/favicon-32x32.png';
          }
        } else {
          // Try to find it from other clues if no favicon link elements
          const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
          if (appleTouchIcon && appleTouchIcon.getAttribute('href')) {
            originalFavicon = appleTouchIcon.getAttribute('href') || '';
            console.log('Notisky: Using apple-touch-icon as favicon:', originalFavicon);
          } else {
            // If no favicon found, check if we can construct the default one from the current domain
            try {
              const domain = window.location.hostname;
              if (domain.includes('bsky.app')) {
                originalFavicon = 'https://bsky.app/static/favicon-32x32.png';
              } else if (domain.includes('bsky.social')) {
                originalFavicon = 'https://bsky.social/static/favicon-32x32.png';
              } else {
                // Generic fallback
                originalFavicon = '/favicon.ico';
              }
              console.log('Notisky: Using constructed favicon path:', originalFavicon);
            } catch (e) {
              // Ultimate fallback
              originalFavicon = 'https://bsky.app/static/favicon-32x32.png';
              console.log('Notisky: Using default Bluesky favicon');
            }
          }
        }
      } catch (error) {
        console.error('Notisky: Error saving original favicon', error);
        // Fallback to default Bluesky favicon
        originalFavicon = 'https://bsky.app/static/favicon-32x32.png';
      }
    }
    
    // Function to create a favicon with a badge count
    function createFaviconWithBadge(count: number): Promise<string> {
      try {
        if (count <= 0) {
          // Return the original favicon if no notifications
          console.log('Notisky: Returning original favicon (no notifications)');
          return Promise.resolve(originalFavicon || 'https://bsky.app/static/favicon-32x32.png');
        }

        // Determine the badge icon type
        let iconType: string;
        if (count > 30) {
          iconType = '30plus';
        } else {
          iconType = count.toString();
        }

        // Try to use pre-generated badge notification icons first
        if (isRealBrowser && extensionContextValid) {
          try {
            // Use the 32px size icon for favicon (best match for most favicon sizes)
            const badgeIconUrl = browser.runtime.getURL(`/icon/notification/${iconType}_32.png`);
            console.log(`Notisky: Using extension badge icon: ${badgeIconUrl}`);
            return Promise.resolve(badgeIconUrl);
          } catch (error) {
            console.log('Notisky: Error getting badge icon URL, falling back to dynamic generation', error);
            // Don't mark context as invalid, just fall through to dynamic generation
          }
        } else {
          console.log('Notisky: Not using extension resources, falling back to dynamic generation');
        }
        
        // Dynamic generation approach (for development or fallback)
        console.log('Notisky: Generating dynamic badge icon');
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          console.warn('Notisky: Could not get canvas context, returning original favicon');
          return Promise.resolve(originalFavicon || 'https://bsky.app/static/favicon-32x32.png');
        }

        // Create a standalone red notification badge
        // Clear the canvas
        ctx.clearRect(0, 0, 32, 32);
        
        // Calculate badge size to fill most of the icon space
        const badgeSize = Math.max(32 * 0.9, 14); // 90% of icon size
        const badgeX = 32 / 2; // Center horizontally
        const badgeY = 32 / 2; // Center vertically
        
        // Draw red circle background
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeSize/2, 0, Math.PI * 2);
        ctx.fillStyle = '#FF4A4A'; // Red badge color
        ctx.fill();
        
        // Format count text
        let countText;
        if (count > 30) {
          countText = '30+';
        } else {
          countText = count.toString();
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
        
        const dataUrl = canvas.toDataURL('image/png');
        console.log('Notisky: Generated dynamic badge icon');
        return Promise.resolve(dataUrl);
      } catch (error) {
        console.error('Notisky: Error creating favicon', error);
        return Promise.resolve(originalFavicon || 'https://bsky.app/static/favicon-32x32.png');
      }
    }
    
    // Function to safely apply the favicon
    function applyFavicon(faviconUrl: string | Promise<string>) {
      try {
        if (!faviconUrl) {
          console.warn('Notisky: No favicon URL provided, skipping update');
          return;
        }
        
        if (!userPreferences.updateSiteIcon) {
          console.log('Notisky: Site icon updates disabled in preferences, skipping update');
          return;
        }
    
        // Handle promises returned by createFaviconWithBadge
        Promise.resolve(faviconUrl)
          .then(url => {
            if (!url) {
              console.warn('Notisky: Empty favicon URL after promise resolution, skipping update');
              return;
            }
            
            console.log(`Notisky: Applying favicon: ${url.substring(0, 50)}${url.length > 50 ? '...' : ''}`);
            
            try {
              // First, try to update existing favicon link elements
              let linkElements = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
        
              if (linkElements.length > 0) {
                // Update existing favicon links
                linkElements.forEach(link => {
                  link.setAttribute('href', url);
                });
                console.log(`Notisky: Updated ${linkElements.length} existing favicon links`);
              } else {
                // Create a new favicon link if none exists
                const link = document.createElement('link');
                link.rel = 'icon';
                link.type = 'image/png';
                link.href = url;
                document.head.appendChild(link);
                console.log('Notisky: Created new favicon link');
              }
              
              // Verify the change was applied
              setTimeout(() => {
                const currentFavicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
                if (currentFavicon) {
                  const currentHref = currentFavicon.getAttribute('href');
                  if (currentHref !== url) {
                    console.warn('Notisky: Favicon update may not have applied correctly');
                  } else {
                    console.log('Notisky: Favicon update verified');
                  }
                }
              }, 100);
            } catch (domError) {
              console.error('Notisky: DOM error when applying favicon', domError);
            }
          })
          .catch(error => {
            console.error('Notisky: Error resolving favicon URL', error);
          });
      } catch (error) {
        console.error('Notisky: Critical error applying favicon', error);
      }
    }
    
    // Function to update the extension icon (toolbar icon)
    function updateExtensionIcon(count: number) {
      try {
        if (!isRealBrowser || !userPreferences.updateExtensionIcon) return;
        
        safelyMessageBackground({
          action: 'updateNotificationCount',
          count: count
        }).then(response => {
          if (response && response.success) {
            console.log('Notisky: Extension icon update successful');
          } else if (response === null) {
            // No need to log; safelyMessageBackground already handled the error
          } else {
            console.log('Notisky: No success response from extension icon update');
          }
        }).catch(error => {
          // This shouldn't happen due to the promise handling in safelyMessageBackground
          console.error('Notisky: Unexpected error in extension icon update', error);
        });
      } catch (error) {
        handleInvalidContext(error);
      }
    }
    
    // Function to extract badge count from an element
    function getBadgeCount(element: Element | null): number {
      if (!element) return 0;
    
      try {
        const text = element.textContent?.trim() || '';
        if (!text) return 0;
    
        // If it's like "30+", return 30
        if (text.endsWith('+')) {
          return parseInt(text.slice(0, -1), 10);
        }
    
        return parseInt(text, 10) || 0;
      } catch (error) {
        console.error('Notisky: Error getting badge count', error);
        return 0;
      }
    }
    
    // Function to find notification badge elements
    function findNotificationBadges() {
      try {
        // Look for badge elements that could be notifications
        // They typically have a specific aria-label and class
        const badges = document.querySelectorAll('div[aria-label*="unread item"]');
    
        let notificationBadge: Element | null = null;
        let messageBadge: Element | null = null;
    
        // Identify which badge is for notifications and which is for messages
        badges.forEach(badge => {
          // Check parent links to determine badge type
          const parentLink = badge.closest('a');
          if (!parentLink) return;
    
          const href = parentLink.getAttribute('href');
          if (href === '/notifications') {
            notificationBadge = badge;
          } else if (href === '/messages') {
            messageBadge = badge;
          }
        });
    
        return {
          notificationBadge,
          messageBadge
        };
      } catch (error) {
        console.error('Notisky: Error finding notification badges', error);
        return { notificationBadge: null, messageBadge: null };
      }
    }
    
    // Function to update badge counts and icons based on DOM elements
    function updateBadges(forceUpdate = false) {
      try {
        if (isRealBrowser && !extensionContextValid) {
          console.log('Notisky: Skipping badge update due to invalid extension context');
          return;
        }
        
        const { notificationBadge, messageBadge } = findNotificationBadges();
        
        const notificationCount = getBadgeCount(notificationBadge);
        const messageCount = getBadgeCount(messageBadge);
        const totalCount = notificationCount + messageCount;
        
        console.log(`Notisky: Found notification count: ${notificationCount}, message count: ${messageCount}, total: ${totalCount}`);
        
        // Only update if counts have changed or if forceUpdate is true
        if (forceUpdate || totalCount !== lastNotificationCount + lastMessageCount) {
          console.log(`Notisky: Updating icons with count ${totalCount}`);
          
          // Update favicon with badge
          try {
            createFaviconWithBadge(totalCount)
              .then(iconUrl => {
                if (iconUrl) {
                  applyFavicon(iconUrl);
                } else {
                  console.error('Notisky: Failed to create badge icon, favicon not updated');
                }
              })
              .catch(error => {
                console.error('Notisky: Error in favicon creation/application chain', error);
                if (originalFavicon) {
                  applyFavicon(originalFavicon);
                }
              });
          } catch (error) {
            console.error('Notisky: Critical error in favicon update process', error);
          }
          
          // Update extension icon
          try {
            updateExtensionIcon(totalCount);
          } catch (error) {
            console.error('Notisky: Error updating extension icon', error);
          }
          
          // Store counts in extension storage
          if (isRealBrowser) {
            try {
              browser.storage.local.set({
                notificationCounts: {
                  notification: notificationCount,
                  message: messageCount,
                  total: totalCount
                }
              }).catch(error => {
                console.warn('Notisky: Failed to save notification counts to storage', error);
                handleInvalidContext(error);
              });
            } catch (error) {
              console.warn('Notisky: Error accessing storage', error);
              handleInvalidContext(error);
            }
          }
        }
        
        // Check for new notifications to show a system notification
        const newNotifications = notificationCount - lastNotificationCount;
        const newMessages = messageCount - lastMessageCount;
        
        if (newNotifications > 0 && userPreferences.enableNotifications) {
          sendNotification(
            'New Bluesky Notifications',
            `You have ${newNotifications} new notification${newNotifications > 1 ? 's' : ''}`,
            'notification'
          );
        }
        
        if (newMessages > 0 && userPreferences.enableNotifications) {
          sendNotification(
            'New Bluesky Messages',
            `You have ${newMessages} new message${newMessages > 1 ? 's' : ''}`,
            'message'
          );
        }
        
        // Update stored counts
        lastNotificationCount = notificationCount;
        lastMessageCount = messageCount;
      } catch (error) {
        console.error('Notisky: Error updating badges', error);
        handleInvalidContext(error);
      }
    }
    
    // Function to start observing changes in notification and message badges
    function observeBadges() {
      try {
        if (isObserving || (isRealBrowser && !extensionContextValid)) {
          console.log('Notisky: Not starting badge observation (already observing or invalid context)');
          return;
        }
        
        isObserving = true;
        updateTimer = window.setInterval(() => {
          if (isRealBrowser && !extensionContextValid) {
            console.log('Notisky: Skipping scheduled badge update due to invalid context');
            return;
          }
          updateBadges();
        }, userPreferences.refreshInterval * 60 * 1000);
        
        console.log('Notisky: Started observing badges');
      } catch (error) {
        console.error('Notisky: Error observing badges', error);
        handleInvalidContext(error);
      }
    }
    
    // Function to stop observing changes in notification and message badges
    function stopObservingBadges() {
      try {
        if (!isObserving) return;
    
        isObserving = false;
        if (updateTimer !== null) {
          clearInterval(updateTimer);
          updateTimer = null;
        }
        console.log('Notisky: Stopped observing badges');
      } catch (error) {
        console.error('Notisky: Error stopping observation', error);
      }
    }
    
    // Function to send a notification
    function sendNotification(title: string, message: string, type: string = 'notification') {
      try {
        if (!isRealBrowser || !userPreferences.enableNotifications) return;
        
        // Use the safer messaging helper
        safelyMessageBackground({
          action: 'sendNotification',
          title: title,
          message: message,
          type: type
        });
      } catch (error) {
        console.error('Notisky: Error sending notification', error);
      }
    }
    
    // Function to safely send messages to the background script
    function safelyMessageBackground(message: any, retryCount = 0): Promise<any> {
      return new Promise((resolve, reject) => {
        try {
          if (!isRealBrowser) {
            console.log('Notisky: Not in a real browser environment, skipping message', message);
            resolve(null);
            return;
          }
          
          if (!extensionContextValid) {
            // For ping messages, still try even with invalid context
            if (message.action === 'ping') {
              console.log('Notisky: Attempting ping despite invalid context state');
            } else {
              console.log(`Notisky: Skipping message due to invalid extension context: ${message.action}`);
              resolve(null);
              return;
            }
          }
          
          browser.runtime.sendMessage(message)
            .then(resolve)
            .catch(error => {
              const errorMessage = error?.message || 'Unknown error';
              const isContextError = 
                errorMessage.includes('Extension context invalidated') ||
                errorMessage.includes('Invalid extension context') ||
                errorMessage.includes('Extension context is invalidated') ||
                errorMessage.includes('Could not establish connection') ||
                errorMessage.includes('Receiving end does not exist') ||
                errorMessage.includes('Service worker') ||
                (typeof error.code === 'number' && error.code === 15); // Some browsers use code 15
                
              if (isContextError) {
                console.log(`Notisky: Extension context invalidated for message: ${message.action}`, error);
                handleInvalidContext(error);
                
                // For critical messages, we might want to retry after waking up the service worker
                const importantActions = ['getPreferences', 'updateNotificationCount'];
                if (importantActions.includes(message.action) && retryCount < 2) {
                  console.log(`Notisky: Will retry important action "${message.action}" after a delay`);
                  
                  // Try to wake up service worker first
                  try {
                    if (browser.runtime && browser.runtime.connect) {
                      const port = browser.runtime.connect({name: 'notisky-wake-up'});
                      setTimeout(() => {
                        try { port.disconnect(); } catch {}
                        
                        // Retry after a delay
                        setTimeout(() => {
                          console.log(`Notisky: Retrying "${message.action}" (attempt ${retryCount + 1})`);
                          safelyMessageBackground(message, retryCount + 1)
                            .then(resolve)
                            .catch(() => resolve(null));
                        }, 800);
                      }, 200);
                      return;
                    }
                  } catch {}
                }
                
                resolve(null);
              } else {
                console.error(`Notisky: Error sending message: ${message.action}`, error);
                reject(error);
              }
            });
        } catch (error) {
          console.error('Notisky: Error in safelyMessageBackground', error);
          resolve(null);
        }
      });
    }
    
    // Function to check if the extension context is valid
    function checkExtensionContext() {
      if (!isRealBrowser) return;
      
      console.log('Notisky: Checking extension context validity');
      
      try {
        pingBackgroundScript()
          .then(isValid => {
            if (isValid) {
              if (!extensionContextValid) {
                console.log('Notisky: Extension context has been restored via ping');
                extensionContextValid = true;
                
                // Clear reconnect timer
                if (reconnectAttemptTimer) {
                  clearInterval(reconnectAttemptTimer);
                  reconnectAttemptTimer = null;
                  reconnectAttemptCount = 0;
                }
                
                // Re-initialize after a short delay
                setTimeout(() => {
                  initialize();
                }, 1000);
              }
              return;
            }
            
            // Ping failed, try storage access
            tryStorageAccessCheck();
          })
          .catch(() => {
            // Error pinging, try storage access
            tryStorageAccessCheck();
          });
      } catch (error) {
        // Error in the entire ping process, try storage access
        tryStorageAccessCheck();
      }
    }
    
    // Try to access storage as a way to check extension context validity
    function tryStorageAccessCheck() {
      try {
        // Try to access browser.storage as another validity check
        browser.storage.local.get('contextCheck')
          .then(() => {
            if (!extensionContextValid) {
              console.log('Notisky: Extension context has been restored via storage access');
              extensionContextValid = true;
              
              // Clear reconnect timer
              if (reconnectAttemptTimer) {
                clearInterval(reconnectAttemptTimer);
                reconnectAttemptTimer = null;
                reconnectAttemptCount = 0;
              }
              
              // Re-initialize after a short delay
              setTimeout(() => {
                initialize();
              }, 1000);
            }
          })
          .catch(error => {
            handleInvalidContext(error);
          });
      } catch (error) {
        handleInvalidContext(error);
      }
    }
    
    // Function to ping the background script to check if it's alive
    function pingBackgroundScript(): Promise<boolean> {
      return new Promise(resolve => {
        if (!isRealBrowser) {
          resolve(false);
          return;
        }
        
        try {
          // Set a timeout for the ping
          const pingTimeout = setTimeout(() => {
            console.log('Notisky: Ping timed out');
            resolve(false);
          }, 2000);
          
          // Check if we're in Manifest V3 mode (service worker)
          const isMV3 = 
            typeof browser !== 'undefined' && 
            typeof browser.runtime !== 'undefined' && 
            typeof browser.runtime.getManifest === 'function' && 
            browser.runtime.getManifest().manifest_version === 3;
          
          console.log('Notisky: Running in MV3 mode?', isMV3);
          
          // In MV3, check if extension ID is available first
          if (isMV3) {
            try {
              const extensionId = browser.runtime.id;
              console.log('Notisky: Extension ID available:', extensionId);
            } catch (e) {
              console.log('Notisky: Extension runtime ID not accessible, service worker may be inactive');
              clearTimeout(pingTimeout);
              resolve(false);
              return;
            }
          }
          
          // Send a ping message to background
          browser.runtime.sendMessage({ action: 'ping' })
            .then(response => {
              clearTimeout(pingTimeout);
              if (response && response.success && response.message === 'pong') {
                console.log('Notisky: Ping successful');
                resolve(true);
              } else {
                console.log('Notisky: Ping returned unexpected response', response);
                resolve(false);
              }
            })
            .catch(error => {
              clearTimeout(pingTimeout);
              console.log('Notisky: Ping error', error);
              
              // Handle service worker termination in MV3
              if (error.message && (
                  error.message.includes('Could not establish connection') ||
                  error.message.includes('Receiving end does not exist') ||
                  error.message.includes('Service worker') ||
                  error.message.includes('status code: 15') ||
                  error.message.includes('Extension context invalidated')
                )) {
                console.log('Notisky: Service worker may be terminated or not ready');
                
                // Attempt to wake up the service worker by connecting briefly
                try {
                  if (browser.runtime && browser.runtime.connect) {
                    // Create and immediately disconnect a port to wake up service worker
                    const port = browser.runtime.connect();
                    setTimeout(() => {
                      try {
                        port.disconnect();
                        console.log('Notisky: Attempted to wake up service worker');
                      } catch (e) {
                        console.log('Notisky: Error disconnecting port', e);
                      }
                    }, 100);
                    
                    // Wait a short time and try ping again
                    setTimeout(() => {
                      browser.runtime.sendMessage({ action: 'ping' })
                        .then(response => {
                          if (response && response.success) {
                            console.log('Notisky: Service worker woken up successfully');
                            resolve(true);
                          } else {
                            resolve(false);
                          }
                        })
                        .catch(() => resolve(false));
                    }, 500);
                    return;
                  }
                } catch (e) {
                  console.log('Notisky: Failed to wake up service worker', e);
                }
              }
              
              resolve(false);
            });
        } catch (error) {
          console.log('Notisky: Error sending ping', error);
          resolve(false);
        }
      });
    }
    
    // Handle an invalid extension context
    function handleInvalidContext(error: any) {
      if (extensionContextValid) {
        console.log('Notisky: Extension context has become invalid', error);
        extensionContextValid = false;
        
        // Reset reconnection state
        reconnectAttemptCount = 0;
        if (reconnectAttemptTimer) {
          clearInterval(reconnectAttemptTimer);
        }
        
        // Start trying to reconnect
        reconnectAttemptTimer = window.setInterval(() => {
          reconnectAttemptCount++;
          console.log(`Notisky: Reconnection attempt ${reconnectAttemptCount} of ${MAX_RECONNECT_ATTEMPTS}`);
          checkExtensionContext();
          
          // After several failed attempts, reload the page
          if (reconnectAttemptCount >= MAX_RECONNECT_ATTEMPTS) {
            console.log('Notisky: Multiple reconnection attempts failed, reloading page');
            clearInterval(reconnectAttemptTimer);
            reconnectAttemptTimer = null;
            
            // Only reload if we're on a Bluesky page to avoid interfering with other sites
            if (window.location.hostname.includes('bsky.app') || 
                window.location.hostname.includes('bsky.social')) {
              console.log('Notisky: Reloading page to recover from invalid context');
              try {
                // Try to persist information about the reload in local storage first
                localStorage.setItem('notiskyReloadTime', Date.now().toString());
                localStorage.setItem('notiskyReloadReason', 'extension_context_invalid');
              } catch (e) {
                // Ignore storage errors
              }
              window.location.reload();
            }
          }
        }, RECONNECT_DELAY);
      }
    }
    
    // Initialize everything
    function initialize() {
      console.log('Notisky: Initializing content script');
      
      // Reset counters
      lastNotificationCount = 0;
      lastMessageCount = 0;
      isObserving = false;
      if (updateTimer !== null) {
        clearInterval(updateTimer);
        updateTimer = null;
      }
      
      // Save the original favicon
      saveOriginalFavicon();
      
      // Set up extension context checking
      if (isRealBrowser) {
        // Initial context check
        checkExtensionContext();
        
        // Periodic context checks
        setInterval(() => {
          checkExtensionContext();
        }, 60 * 1000); // Check every minute
        
        // Check when tab becomes visible
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            console.log('Notisky: Tab became visible, checking extension context');
            checkExtensionContext();
          }
        });
      }
      
      // Load preferences and start observing
      if (!isRealBrowser || extensionContextValid) {
        if (isRealBrowser) {
          safelyMessageBackground({ action: 'getPreferences' })
            .then(response => {
              if (response && response.preferences) {
                userPreferences = response.preferences;
                console.log('Notisky: Loaded user preferences', userPreferences);
              } else {
                console.log('Notisky: Using default preferences due to error or extension reload');
              }
              
              // Start observing badges and force an initial update
              observeBadges();
              updateBadges(true);
            })
            .catch(error => {
              console.error('Notisky: Error loading preferences, using defaults', error);
              observeBadges();
              updateBadges(true);
            });
        } else {
          // In development mode, just use defaults
          observeBadges();
          updateBadges(true);
        }
      } else {
        console.log('Notisky: Skipping initialization due to invalid extension context');
      }
    }
    
    // Load user preferences from storage
    if (isRealBrowser) {
      // Load preferences from storage first
      browser.storage.sync.get({
        updateSiteIcon: true,
        updateExtensionIcon: true,
        enableNotifications: true,
        keepPageAlive: true,
        refreshInterval: 1
      })
        .then(items => {
          userPreferences = items as UserPreferences;
          console.log('Notisky: Loaded user preferences', userPreferences);
          initialize();
        })
        .catch(error => {
          console.error('Notisky: Error loading preferences', error);
          initialize();
        });
      
      // Listen for messages from background script
      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
          if (message.action === 'checkForUpdates') {
            console.log('Notisky: Received request to check for updates');
            updateBadges(true);
            sendResponse({ success: true });
          }
          return true;
        } catch (error) {
          console.error('Notisky: Error handling message from background', error);
          sendResponse({ success: false, error: error.message });
          return true;
        }
      });
      
      // Listen for preference changes
      browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync') {
          let needRestart = false;
          
          for (const key in changes) {
            if (Object.prototype.hasOwnProperty.call(userPreferences, key)) {
              // If refresh interval changed and we're observing, we need to restart observation
              if (key === 'refreshInterval' && updateTimer) {
                needRestart = true;
              }
              
              (userPreferences as any)[key] = changes[key].newValue;
            }
          }
          
          console.log('Notisky: Updated preferences after storage change', userPreferences);
          
          if (needRestart && isObserving) {
            stopObservingBadges();
            observeBadges();
          }
        }
      });
      
      // Start/stop observation when tab visibility changes
      document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
          stopObservingBadges();
        } else {
          observeBadges();
          updateBadges(true);
        }
      });
      
      // Clean up when tab is unloaded
      window.addEventListener('beforeunload', function() {
        stopObservingBadges();
      });
      
      // Initialize when loaded
      window.addEventListener('load', function() {
        initialize();
      });
    } else {
      console.log('Notisky: In build environment, skipping initialization');
    }

    // Listen for messages from the background script
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Content script received message:', message);
      
      // Handle any specific message types here
      if (message.action === 'checkPage') {
        sendResponse({ success: true, url: window.location.href });
      }
      
      return true;
    });

    // Check if we're on the auth callback page
    const isAuthCallbackPage = window.location.href.includes('/auth/callback');

    if (isAuthCallbackPage) {
      console.log('Detected auth callback page, processing auth response');
      processAuthCallback();
    }

    /**
     * Process the authentication callback
     */
    function processAuthCallback() {
      try {
        // Parse URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');
        
        if (error) {
          console.error('Auth error received:', error);
          // Send error to background script
          browser.runtime.sendMessage({
            action: 'authError',
            error: error
          });
          return;
        }
        
        if (!code || !state) {
          console.error('Missing required parameters in auth callback');
          return;
        }
        
        console.log('Auth callback received code and state, sending to background');
        
        // Method 1: Send message to background script
        browser.runtime.sendMessage({
          action: 'authSuccess',
          code: code,
          state: state
        });
        
        // Method 2: Store in local storage for the listener in auth.ts
        browser.storage.local.set({
          auth_code: code,
          auth_state: state,
          auth_timestamp: Date.now()
        });
        
        // Show a success message
        const statusElement = document.getElementById('status');
        if (statusElement) {
          statusElement.textContent = 'Authentication successful! You can close this tab.';
          statusElement.className = 'success';
        }
        
        // Auto-close the tab after a delay
        setTimeout(() => {
          try {
            window.close();
          } catch (e) {
            console.log('Could not auto-close tab:', e);
            // Update status message
            if (statusElement) {
              statusElement.textContent = 'Authentication complete! You can now close this tab manually.';
            }
          }
        }, 3000);
        
      } catch (error) {
        console.error('Error processing auth callback:', error);
      }
    }
  }
});
