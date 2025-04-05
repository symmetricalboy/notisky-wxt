/**
 * Auth Success Page Helper
 * 
 * This content script is injected into the auth success page to help extract
 * authentication tokens and send them to the extension's background script.
 */

import { browser } from 'wxt/browser';

console.log('Notisky auth success helper loaded');

// Helper function to safely send messages to background script
function sendToBackground(message: any): Promise<any> {
  // Try both browser and chrome APIs to ensure compatibility
  if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
    return browser.runtime.sendMessage(message);
  } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }
  
  return Promise.reject(new Error('No messaging API available'));
}

// Extract authentication data from different sources
async function extractAuthData() {
  console.log('Extracting auth data from page');
  
  try {
    // Strategy 1: Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    if (code && state) {
      console.log('Found auth data in URL parameters');
      await sendAuthData(code, state);
      return true;
    }
    
    // Strategy 2: Check DOM elements
    const authElement = document.getElementById('notisky-auth-data');
    if (authElement) {
      const domCode = authElement.getAttribute('data-code');
      const domState = authElement.getAttribute('data-state');
      
      if (domCode && domState) {
        console.log('Found auth data in DOM element');
        await sendAuthData(domCode, domState);
        return true;
      }
      
      // Try JSON data
      const authJson = authElement.getAttribute('data-auth');
      if (authJson) {
        try {
          const authData = JSON.parse(authJson);
          if (authData.code && authData.state) {
            console.log('Found auth data in JSON attribute');
            await sendAuthData(authData.code, authData.state);
            return true;
          }
        } catch (e) {
          console.warn('Error parsing auth JSON:', e);
        }
      }
    }
    
    // Strategy 3: Check localStorage
    const localCode = localStorage.getItem('notisky_auth_code');
    const localState = localStorage.getItem('notisky_auth_state');
    
    if (localCode && localState) {
      console.log('Found auth data in localStorage');
      await sendAuthData(localCode, localState);
      return true;
    }
    
    console.log('No auth data found');
    return false;
  } catch (error) {
    console.error('Error extracting auth data:', error);
    return false;
  }
}

// Send the auth data to the background script
async function sendAuthData(code: string, state: string) {
  try {
    console.log('Sending auth data to background script');
    
    const response = await sendToBackground({
      type: 'oauth_callback',
      code,
      state
    });
    
    console.log('Background script response:', response);
    
    // Notify the page that data was sent
    const event = new CustomEvent('notisky-auth-detected', {
      detail: { success: true }
    });
    document.dispatchEvent(event);
    window.dispatchEvent(event);
    
    // Update UI if it exists
    updateUI('Authentication data sent to extension!', 'success');
    
    // Set a flag to avoid sending duplicates
    window.localStorage.setItem('notisky_auth_sent', 'true');
    
    // Auto close after a brief delay
    setTimeout(() => {
      try {
        window.close();
      } catch (e) {
        console.log('Could not auto-close tab');
      }
    }, 2000);
    
    return true;
  } catch (error) {
    console.error('Failed to send auth data:', error);
    updateUI('Failed to send authentication data to extension', 'error');
    return false;
  }
}

// Helper to update UI elements if they exist
function updateUI(message: string, status: 'success' | 'error' | 'warning') {
  // Try various potential element IDs
  const potentialStatusElements = [
    'detection-status',
    'auth-status',
    'status'
  ];
  
  let statusElement: HTMLElement | null = null;
  
  for (const id of potentialStatusElements) {
    const element = document.getElementById(id);
    if (element) {
      statusElement = element;
      break;
    }
  }
  
  if (statusElement) {
    statusElement.textContent = message;
    
    // Apply color based on status
    if (status === 'success') {
      statusElement.style.color = '#4caf50';
    } else if (status === 'error') {
      statusElement.style.color = '#f44336';
    } else if (status === 'warning') {
      statusElement.style.color = '#ff9800';
    }
  }
  
  // Set detection complete flag if it exists
  const detectionComplete = document.getElementById('detection-complete');
  if (detectionComplete) {
    detectionComplete.style.display = 'block';
  }
}

// Run extraction immediately
if (!window.localStorage.getItem('notisky_auth_sent')) {
  extractAuthData();
}

// Listen for custom events
window.addEventListener('notisky-auth-available', (event: any) => {
  console.log('Received notisky-auth-available event');
  
  if (window.localStorage.getItem('notisky_auth_sent')) {
    console.log('Auth data already sent, ignoring event');
    return;
  }
  
  const data = event.detail || {};
  
  if (data.code && data.state) {
    sendAuthData(data.code, data.state);
  }
});

// Also run when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, checking for auth data');
  
  if (!window.localStorage.getItem('notisky_auth_sent')) {
    extractAuthData();
  }
});

// Export a dummy object to satisfy WXT module requirements
export default {}; 