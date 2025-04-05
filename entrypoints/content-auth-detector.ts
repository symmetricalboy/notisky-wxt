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
    
    // Send message to background script
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
      console.log('Sending auth data to extension background script');
      browser.runtime.sendMessage(messageData)
        .then(response => {
          console.log('Background script response:', response);
          
          // Notify the page that we successfully extracted the data
          const event = new CustomEvent('notisky-auth-detected', {
            detail: { success: true }
          });
          document.dispatchEvent(event);
          
          // Update UI elements if they exist
          const statusElement = document.getElementById('auth-status');
          if (statusElement) {
            statusElement.textContent = 'Authentication data received by extension';
            statusElement.className = 'success';
          }
        })
        .catch(error => {
          console.error('Error sending message to background script:', error);
          
          // Notify the page about the error
          const event = new CustomEvent('notisky-auth-detected', {
            detail: { success: false, error }
          });
          document.dispatchEvent(event);
        });
    } else {
      console.error('Browser runtime API not available for sending messages');
      throw new Error('Browser runtime API not available');
    }
  } catch (error) {
    console.error('Error processing auth data:', error);
  }
}

// Check 1: Listen for custom event
document.addEventListener('notisky-auth-available', (event: any) => {
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
      return window.location.href.includes('auth-success.html');
    }
    
    // Fallback: check for specific element that should only be on our auth success page
    return !!document.getElementById('notisky-auth-page') || 
           !!document.getElementById('notisky-auth-data');
  } catch (error) {
    console.warn('Error checking page type:', error);
    return false;
  }
}

// Run checks when DOM is fully loaded
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
      const statusElement = document.getElementById('auth-status');
      if (statusElement) {
        statusElement.textContent = 'Could not find authentication data';
        statusElement.className = 'error';
      }
    }
  }, 500);
});

// Export a dummy function to satisfy WXT's default export requirement
export default {}; 