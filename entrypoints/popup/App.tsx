import React, { useState, useEffect } from 'react';
import { browser } from 'wxt/browser';
import type { AccountSession } from '../../utils/storage'; // Corrected import path assumed based on wxt structure
import './App.css';
import './style.css';

// Helper function for retrying promises - Temporarily remove retry logic
/*
const retry = <T,>(fn: () => Promise<T>, retries = 3, delay = 300): Promise<T> => {
  return new Promise((resolve, reject) => {
    const attempt = (n: number) => {
      fn()
        .then(resolve)
        .catch((err) => {
          console.log('Retry attempt failed with error:', err);
          if (n <= 1) {
            reject(err);
          } else {
            console.log(`Retrying (${retries - n + 1}/${retries})...`);
            setTimeout(() => attempt(n - 1), delay);
          }
        });
    };
    attempt(retries);
  });
};
*/

function App() {
  // Store accounts as a Record<did, AccountSession>
  const [accounts, setAccounts] = useState<Record<string, AccountSession>>({});
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting'); // Add connection status

  // Fetch accounts from background script with retry
  const fetchAccounts = React.useCallback(async () => { // Use useCallback
    setLoading(true);
    setError(null);
    setConnectionStatus('connecting'); // Start as connecting

    try {
       // Temporarily remove retry - direct call with logging
       console.log('[Popup] Attempting direct fetch accounts...');
       let response: any;
       try {
           response = await browser.runtime.sendMessage({ action: 'getAccounts' });
           console.log('[Popup] Received response from sendMessage:', response);
       } catch (sendMessageError) {
           console.error('[Popup] Error calling sendMessage:', sendMessageError);
           setError('Error communicating with background script.');
           setConnectionStatus('error');
           setLoading(false);
           return; // Stop if sendMessage itself fails
       }

       if (response && response.success) {
         console.log('[Popup] Fetch successful, accounts:', response.accounts);
         setAccounts(response.accounts || {});
         setConnectionStatus('connected');
       } else {
         // Handle unsuccessful response or undefined
         const errorMsg = response?.error || 'Unknown error from background';
         console.error('[Popup] Fetch failed:', errorMsg, '(Response:', response, ')');
         setError(`Failed to load accounts: ${errorMsg}`);
         setAccounts({});
         setConnectionStatus('error');
       }
    } catch (err: any) { // Catch unexpected errors during processing
       console.error('[Popup] Unexpected error in fetchAccounts:', err);
       setError('An unexpected error occurred.');
       setAccounts({});
       setConnectionStatus('error');
    } finally {
      setLoading(false);
    }
  }, []); // Empty dependency array for useCallback

  // Initial load & Badge Reset
  useEffect(() => {
    // Test basic ping/pong communication
    const testPing = async () => {
      try {
        console.log('[Popup] Sending ping...');
        const pongResponse = await browser.runtime.sendMessage({ action: 'ping' });
        console.log('[Popup] Received pong response:', pongResponse);
      } catch (err) {
        console.error('[Popup] Error during ping test:', err);
      }
    };
    testPing();

    fetchAccounts();

    // Clear the badge count when popup opens
    browser.runtime.sendMessage({ action: 'clearNewNotificationCount' })
      .catch(err => console.error('Error clearing badge count:', err));

    // Listener for updates from background script
    const messageListener = (message: any) => {
      // Listen for specific account changes
      if (message.action === 'accountAdded') {
        console.log('Popup received accountAdded:', message.account);
        setAccounts(prevAccounts => ({
          ...prevAccounts,
          [message.account.did]: message.account
        }));
        setError(null);
        setAuthenticating(false); 
      } else if (message.action === 'accountRemoved') {
         console.log('Popup received accountRemoved:', message.did);
         setAccounts(prevAccounts => {
           const newAccounts = { ...prevAccounts };
           delete newAccounts[message.did];
           return newAccounts;
         });
         setError(null);
      }
      // Add handlers for other messages like 'reAuthRequired' or 'notificationUpdate' if needed
    };

    browser.runtime.onMessage.addListener(messageListener);

    // Cleanup listener on component unmount
    return () => {
      browser.runtime.onMessage.removeListener(messageListener);
    };
  }, [fetchAccounts]); // Add fetchAccounts dependency

  // Start Authentication Flow
  const handleLogin = async () => {
    setAuthenticating(true);
    setError(null);
    try {
      // Tell the background script to start the flow
      const response = await browser.runtime.sendMessage({ action: 'authenticate' });
      if (!response.success) {
        console.error('Failed to initiate auth flow:', response.error);
        setError(response.error || 'Failed to start login.');
        setAuthenticating(false);
      }
      // No need to do anything else here; the messageListener will handle the update
      // when the auth flow completes and handleAuthCallback runs in background.
    } catch (err: any) {
      console.error('Error sending authenticate message:', err);
      setError('Failed to communicate with extension for login.');
      setAuthenticating(false);
    }
  };

  // Remove an Account
  const handleRemoveAccount = async (did: string) => {
    // Optional: Add a confirmation dialog here
    setError(null);
    try {
      const response = await browser.runtime.sendMessage({ action: 'removeAccount', did: did });
      if (!response.success) {
        console.error('Failed to remove account:', response.error);
        setError(response.error || 'Failed to remove account.');
      }
      // UI update will happen via the authStateChanged listener
    } catch (err: any) {
      console.error('Error sending removeAccount message:', err);
      setError('Failed to communicate with extension to remove account.');
    }
  };

  const openOptions = () => {
    browser.runtime.openOptionsPage();
    window.close(); // Close popup after opening options
  };

  const accountList = Object.values(accounts); // Get array of accounts for rendering

  return (
    <div className="popup-container">
      <div className="popup-header">
        <img src="/icon/48.png" alt="Notisky Logo" className="logo" />
        <h1>Notisky</h1>
        <button onClick={openOptions} className="options-button" title="Open Settings">⚙️</button>
      </div>

      {loading ? (
        <div className="status-message">Connecting...</div> // Changed initial loading message
      ) : authenticating ? (
        <div className="status-message">Redirecting to Bluesky for login...</div>
      ) : connectionStatus === 'error' ? ( // Check connectionStatus for error display
        <div className="error-message">Error: {error}</div>
      ) : (
        <>
          {accountList.length > 0 ? (
            <div className="accounts-list">
              <h2>Logged In Accounts:</h2>
              <ul>
                {accountList.map((account) => (
                  <li key={account.did} className="account-item">
                    <span>@{account.handle}</span>
                    <button 
                      onClick={() => handleRemoveAccount(account.did)} 
                      className="remove-button"
                      title={`Log out ${account.handle}`}
                    >
                      Logout
                    </button>
                  </li>
                ))}
              </ul>
              <button onClick={handleLogin} className="login-button add-account-button">
                Add Another Account
              </button>
            </div>
          ) : (
            <div className="login-section">
              <p>Log in to Bluesky to start receiving notifications.</p>
              <button onClick={handleLogin} className="login-button">
                Login with Bluesky
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
