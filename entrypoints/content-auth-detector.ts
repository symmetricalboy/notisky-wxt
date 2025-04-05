/**
 * Auth detector content script for the Notisky extension
 * This script runs on the auth-success.html page to detect and extract authentication data
 */

import { browser } from 'wxt/browser';

console.log('Notisky auth detector content script loaded');

// Function to process auth data after it's found
function processAuthData(code: string, state: string) {
  // Log the data we found
  console.log('Auth data detected:', { code, state });

  try {
    // Store the data in localStorage as a backup
    localStorage.setItem('notisky_auth_code', code);
    localStorage.setItem('notisky_auth_state', state);
    
    // Format data specifically for the background script
    const messageData = {
      type: 'oauth_callback',
      code,
      state
    };
    
    // Try with both browser and chrome APIs to ensure compatibility
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
      console.log('Sending auth data to extension background script via browser API');
      browser.runtime.sendMessage(messageData)
        .then(response => {
          console.log('Background script response:', response);
          notifySuccess();
        })
        .catch(error => {
          console.error('Error sending message via browser API:', error);
          // Fallback to chrome API
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            sendViaChrome(messageData);
          } else {
            throw error;
          }
        });
    } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      sendViaChrome(messageData);
    } else {
      console.error('Neither browser nor chrome runtime API available for sending messages');
      throw new Error('Extension messaging API not available');
    }
  } catch (error) {
    console.error('Error processing auth data:', error);
  }
}

function sendViaChrome(messageData) {
  console.log('Sending auth data to extension background script via Chrome API');
  chrome.runtime.sendMessage(messageData, response => {
    console.log('Background script response (Chrome API):', response);
    notifySuccess();
  });
}

function notifySuccess() {
  // Notify the page that we successfully extracted the data
  const event = new CustomEvent('notisky-auth-detected', {
    detail: { success: true }
  });
  document.dispatchEvent(event);
  window.dispatchEvent(event);
  
  // Update UI elements if they exist
  const statusElement = document.getElementById('detection-status');
  if (statusElement) {
    statusElement.textContent = 'Authentication data received by extension!';
    statusElement.style.color = '#4caf50';
  }
  
  const detectionComplete = document.getElementById('detection-complete');
  if (detectionComplete) {
    detectionComplete.style.display = 'block';
  }
}

// Check 1: Listen for custom event
window.addEventListener('notisky-auth-available', (event: any) => {
  console.log('Detected notisky-auth-available event');
  const detail = event.detail || {};
  
  if (detail.code && detail.state) {
    processAuthData(detail.code, detail.state);
  } else {
    console.warn('Event data missing required fields:', detail);
  }
});

// Check 2: Check for data attributes in DOM
function checkDomForAuthData() {
  console.log('Checking DOM for auth data attributes');
  
  const authElement = document.getElementById('notisky-auth-data');
  if (authElement) {
    const code = authElement.getAttribute('data-code');
    const state = authElement.getAttribute('data-state');
    
    if (code && state) {
      processAuthData(code, state);
      return true;
    }
  }
  
  // Check URL parameters directly
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');
  
  if (code && state) {
    console.log('Found auth data in URL parameters');
    processAuthData(code, state);
    return true;
  }
  
  return false;
}

// Check 3: Check localStorage
function checkLocalStorageForAuthData() {
  console.log('Checking localStorage for auth data');
  
  const code = localStorage.getItem('notisky_auth_code');
  const state = localStorage.getItem('notisky_auth_state');
  
  if (code && state) {
    processAuthData(code, state);
    return true;
  }
  
  return false;
}

// Helper function to check if we're on an auth-success page
function isAuthSuccessPage() {
  try {
    // Check URL pattern if window.location is available
    if (typeof window !== 'undefined' && window.location && window.location.href) {
      return window.location.href.includes('auth-success.html') || 
             window.location.href.includes('auth/extension-callback') ||
             window.location.href.includes('oauth=success');
    }
    
    // Fallback: check for specific element that should only be on our auth success page
    return !!document.getElementById('notisky-auth-page') || 
           !!document.getElementById('notisky-auth-data');
  } catch (error) {
    console.warn('Error checking page type:', error);
    return false;
  }
}

// Run checks right away, don't wait for DOMContentLoaded
console.log('Running initial auth check immediately');
if (isAuthSuccessPage()) {
  checkDomForAuthData() || checkLocalStorageForAuthData();
}

// Also run checks when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded, running auth data checks');
  
  // Only run on auth-success.html pages
  if (!isAuthSuccessPage()) {
    console.log('Not on auth-success page, skipping auth detection');
    return;
  }
  
  // Try DOM check first
  if (checkDomForAuthData()) {
    console.log('Auth data found in DOM elements');
    return;
  }
  
  // Then try localStorage
  if (checkLocalStorageForAuthData()) {
    console.log('Auth data found in localStorage');
    return;
  }
  
  console.log('No auth data found on initial check, setting up interval');
  
  // If initial checks fail, set up a periodic check
  // This helps in case the page loads auth data dynamically
  let checkCount = 0;
  const maxChecks = 10;
  const checkInterval = setInterval(() => {
    checkCount++;
    console.log(`Running periodic check ${checkCount}/${maxChecks}`);
    
    if (checkDomForAuthData() || checkLocalStorageForAuthData()) {
      console.log('Auth data found during periodic check');
      clearInterval(checkInterval);
      return;
    }
    
    if (checkCount >= maxChecks) {
      console.warn('Max checks reached, giving up on finding auth data');
      clearInterval(checkInterval);
      
      // Update UI elements if they exist to show error
      const statusElement = document.getElementById('detection-status');
      if (statusElement) {
        statusElement.textContent = 'Could not find authentication data';
        statusElement.className = 'error';
      }
    }
  }, 500);
});

// Export a dummy function to satisfy WXT's default export requirement
export default {}; 