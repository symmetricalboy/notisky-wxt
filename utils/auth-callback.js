// Authentication callback handler for Notisky extension
// This script should be included in the auth callback page on the server

(function() {
  // Function to parse query parameters from URL
  function getQueryParams() {
    const queryParams = {};
    const search = window.location.search.substring(1);
    const pairs = search.split('&');
    
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        queryParams[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    }
    
    return queryParams;
  }
  
  // Function to send authentication code back to the extension
  function sendAuthCodeToExtension() {
    const params = getQueryParams();
    
    // Check if we have the required parameters
    if (params.code && params.state) {
      try {
        // First try to use runtime.sendMessage for Chrome and Firefox
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage(
            'notisky@extension.app', // Extension ID
            {
              source: 'notisky-auth',
              code: params.code,
              state: params.state
            },
            function(response) {
              // Handle response
              if (response && response.success) {
                showSuccessMessage();
              } else {
                showErrorMessage('Extension communication error');
              }
            }
          );
        } 
        // Then try browser.runtime.sendMessage for Firefox
        else if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
          browser.runtime.sendMessage(
            'notisky@extension.app',
            {
              source: 'notisky-auth',
              code: params.code,
              state: params.state
            }
          ).then(response => {
            if (response && response.success) {
              showSuccessMessage();
            } else {
              showErrorMessage('Extension communication error');
            }
          }).catch(error => {
            showErrorMessage('Error: ' + error.message);
          });
        }
        else {
          // No extension API found, show manual instructions
          showManualInstructions(params.code, params.state);
        }
      } catch (error) {
        showErrorMessage('Error: ' + error.message);
      }
    } else {
      showErrorMessage('Missing required parameters');
    }
  }
  
  // Function to show success message
  function showSuccessMessage() {
    const messageElement = document.getElementById('auth-message') || document.createElement('div');
    messageElement.id = 'auth-message';
    messageElement.textContent = 'Authentication successful! You can close this tab now.';
    messageElement.style.backgroundColor = '#e7f7e7';
    messageElement.style.color = '#2c662d';
    messageElement.style.padding = '20px';
    messageElement.style.margin = '20px';
    messageElement.style.borderRadius = '5px';
    messageElement.style.textAlign = 'center';
    messageElement.style.fontFamily = 'Arial, sans-serif';
    
    if (!messageElement.parentNode) {
      document.body.prepend(messageElement);
    }
  }
  
  // Function to show error message
  function showErrorMessage(message) {
    const messageElement = document.getElementById('auth-message') || document.createElement('div');
    messageElement.id = 'auth-message';
    messageElement.textContent = message;
    messageElement.style.backgroundColor = '#fde1e1';
    messageElement.style.color = '#a51b1b';
    messageElement.style.padding = '20px';
    messageElement.style.margin = '20px';
    messageElement.style.borderRadius = '5px';
    messageElement.style.textAlign = 'center';
    messageElement.style.fontFamily = 'Arial, sans-serif';
    
    if (!messageElement.parentNode) {
      document.body.prepend(messageElement);
    }
  }
  
  // Function to show manual instructions when extension communication fails
  function showManualInstructions(code, state) {
    const messageElement = document.getElementById('auth-message') || document.createElement('div');
    messageElement.id = 'auth-message';
    messageElement.innerHTML = `
      <h3>Authentication Code Received</h3>
      <p>The extension could not be contacted automatically. Please copy the code below and enter it in the extension:</p>
      <div style="background-color: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; font-family: monospace;">
        <strong>Code:</strong> ${code}<br>
        <strong>State:</strong> ${state}
      </div>
    `;
    messageElement.style.backgroundColor = '#f8f9fa';
    messageElement.style.padding = '20px';
    messageElement.style.margin = '20px';
    messageElement.style.borderRadius = '5px';
    messageElement.style.textAlign = 'center';
    messageElement.style.fontFamily = 'Arial, sans-serif';
    
    if (!messageElement.parentNode) {
      document.body.prepend(messageElement);
    }
  }
  
  // Execute when the DOM is fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sendAuthCodeToExtension);
  } else {
    sendAuthCodeToExtension();
  }
})(); 