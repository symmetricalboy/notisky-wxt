import React, { useState, useEffect } from 'react';
import { browser } from 'wxt/browser';
import type { AccountSession } from '../utils/storage'; // Import shared interface
import './App.css';
import './style.css';

function App() {
  // Store accounts as a Record<did, AccountSession>
  const [accounts, setAccounts] = useState<Record<string, AccountSession>>({});
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch accounts from background script
  const fetchAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await browser.runtime.sendMessage({ action: 'getAccounts' });
      if (response.success) {
        setAccounts(response.accounts || {});
      } else {
        console.error('Failed to fetch accounts:', response.error);
        setError('Failed to load account data.');
        setAccounts({}); // Clear accounts on error
      }
    } catch (err: any) {
      console.error('Error messaging background script:', err);
      setError('Could not connect to extension background. Try reloading the extension.');
      setAccounts({}); 
    } finally {
      setLoading(false);
    }
  };

  // Initial load & Badge Reset
  useEffect(() => {
    fetchAccounts();

    // Clear the badge count when popup opens
    browser.runtime.sendMessage({ action: 'clearNewNotificationCount' })
      .catch(err => console.error('Error clearing badge count:', err));

    // Listener for updates from background script
    const messageListener = (message: any) => {
      if (message.action === 'authStateChanged') {
        console.log('Popup received authStateChanged:', message.accounts);
        setAccounts(message.accounts || {});
        setError(null); // Clear error on update
        setAuthenticating(false); // Ensure authenticating state is reset
      }
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
        <div className="status-message">Loading accounts...</div>
      ) : authenticating ? (
        <div className="status-message">Redirecting to Bluesky for login...</div>
      ) : error ? (
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
