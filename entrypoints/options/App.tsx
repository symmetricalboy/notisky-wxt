import React, { useState, useEffect, useCallback } from 'react';
import { browser } from 'wxt/browser';
import type { AccountSession } from '../../utils/storage'; // Correct path
import type { UserPreferences } from '../../utils/preferences'; // Correct path
import { defaultPreferences } from '../../utils/preferences'; // Correct path
// Assuming shared styles with popup or dedicated options styles
// import './App.css'; 
import './style.css'; // Use existing style for now

// No need to redefine UserPreferences interface - use the imported one

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'accounts' | 'preferences' | 'about'>('accounts');
  const [accounts, setAccounts] = useState<Record<string, AccountSession>>({});
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Fetch accounts from background script
  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setError(null);
    try {
      const response = await browser.runtime.sendMessage({ action: 'getAccounts' });
      if (response.success) {
        setAccounts(response.accounts || {});
      } else {
        console.error('Failed to fetch accounts:', response.error);
        setError('Failed to load account data.');
        setAccounts({});
      }
    } catch (err: any) {
      console.error('Error messaging background script:', err);
      setError('Could not connect to extension background. Try reloading the extension.');
      setAccounts({});
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  const fetchPreferences = useCallback(async () => {
    setLoadingPreferences(true);
    setError(null);
    try {
      const response = await browser.runtime.sendMessage({ action: 'getPreferences' });
      if (response.success) {
        setPreferences(response.preferences || defaultPreferences);
      } else {
        setError('Failed to load preferences: ' + response.error);
        setPreferences(defaultPreferences);
      }
    } catch (err: any) {
      setError('Could not connect to extension background for preferences.');
      setPreferences(defaultPreferences);
    } finally {
      setLoadingPreferences(false);
    }
  }, []);

  // Initial load and listener setup
  useEffect(() => {
    fetchAccounts();
    fetchPreferences();

    // Listener for updates from background script
    const messageListener = (message: any) => {
      if (message.action === 'authStateChanged') {
        console.log('Options received authStateChanged:', message.accounts);
        setAccounts(message.accounts || {});
        setError(null); // Clear error on update
      } else if (message.action === 'preferencesChanged') {
        console.log('Options received preferencesChanged:', message.preferences);
        setPreferences(message.preferences || defaultPreferences);
        setError(null);
      }
    };

    browser.runtime.onMessage.addListener(messageListener);

    // Cleanup listener on component unmount
    return () => {
      browser.runtime.onMessage.removeListener(messageListener);
    };
  }, [fetchAccounts, fetchPreferences]);

  // Start Authentication Flow (same as popup)
  const handleLogin = async () => {
    setError(null);
    try {
      const response = await browser.runtime.sendMessage({ action: 'authenticate' });
      if (!response.success) {
        setError(response.error || 'Failed to start login.');
      }
      // Background script handles the rest
    } catch (err: any) {
      setError('Failed to communicate with extension for login.');
    }
  };

  // Remove an Account (same as popup)
  const handleRemoveAccount = async (did: string) => {
    setError(null);
    try {
      const response = await browser.runtime.sendMessage({ action: 'removeAccount', did: did });
      if (!response.success) {
        setError(response.error || 'Failed to remove account.');
      }
      // UI update via authStateChanged listener
    } catch (err: any) {
      setError('Failed to communicate with extension to remove account.');
    }
  };
  
  const handlePreferenceChange = (key: keyof UserPreferences, value: any) => {
    // Basic type coercion for form elements
    let processedValue = value;
    if (typeof defaultPreferences[key] === 'number') {
      processedValue = parseInt(value, 10) || 0; 
    } else if (typeof defaultPreferences[key] === 'boolean') {
      processedValue = !!value; // Ensure boolean
    }
    setPreferences(prev => ({ ...prev, [key]: processedValue }));
    setStatusMessage(null); // Clear status on change
  };

  const handleSavePreferences = async () => {
    setSavingPreferences(true);
    setError(null);
    setStatusMessage(null);
    try {
      const response = await browser.runtime.sendMessage({
        action: 'savePreferences',
        preferences: preferences
      });
      if (response.success) {
        setStatusMessage('Preferences saved successfully!');
      } else {
        setError('Failed to save preferences: ' + response.error);
      }
    } catch (err: any) {
      setError('Error communicating with extension to save preferences.');
    } finally {
      setSavingPreferences(false);
    }
  };

  const accountList = Object.values(accounts);

  return (
    <div className="container options-container"> {/* Add specific options class? */} 
      <header className="app-header">
        {/* Use relative path for assets in options page */} 
        <img src="../icon/48.png" alt="Notisky Logo" className="logo" /> 
        <h1>Notisky Settings</h1>
      </header>

      <div className="tab-navigation">
        <button 
          className={`tab ${activeTab === 'accounts' ? 'active' : ''}`}
          onClick={() => setActiveTab('accounts')}
        >
          Accounts
        </button>
        <button 
          className={`tab ${activeTab === 'preferences' ? 'active' : ''}`}
          onClick={() => setActiveTab('preferences')}
        >
          Preferences
        </button>
        <button 
          className={`tab ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          About
        </button>
      </div>

      {error && <div className="error-message">Error: {error}</div>}
      {statusMessage && <div className="status-message success-message">{statusMessage}</div>}

      {/* Accounts Tab */} 
      <div className={`tab-content ${activeTab === 'accounts' ? 'active' : ''}`} id="accounts-tab">
        <h2>Accounts</h2>
        {loadingAccounts ? (
          <p>Loading accounts...</p>
        ) : accountList.length > 0 ? (
          <ul className="accounts-list options-accounts-list">
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
        ) : (
          <p>No accounts logged in.</p>
        )}
        <button onClick={handleLogin} className="login-button add-account-button">
          {accountList.length > 0 ? 'Add Another Account' : 'Login with Bluesky'}
        </button>
      </div>

      {/* Preferences Tab */} 
      <div className={`tab-content ${activeTab === 'preferences' ? 'active' : ''}`} id="preferences-tab">
        <h2>Preferences</h2>
        {loadingPreferences ? <p>Loading preferences...</p> : (
          <div className="preferences-form">
            <div className="form-group">
              <label htmlFor="pollingInterval">Check for Notifications Every:</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  id="pollingInterval"
                  min="1"
                  value={preferences.pollingIntervalMinutes}
                  onChange={(e) => handlePreferenceChange('pollingIntervalMinutes', e.target.value)}
                  disabled={savingPreferences}
                />
                <span>minutes</span>
              </div>
              <small>Minimum 1 minute. More frequent checks use more resources.</small>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={preferences.showDesktopNotifications}
                  onChange={(e) => {
                    // Update both properties for compatibility
                    handlePreferenceChange('showDesktopNotifications', e.target.checked);
                    handlePreferenceChange('desktopNotificationsEnabled', e.target.checked);
                  }}
                  disabled={savingPreferences}
                />
                Show Desktop Notifications
              </label>
              <small>Display a system notification when new activity is found.</small>
            </div>

            {/* New Preference Toggle */}
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={preferences.showDetailedNotifications}
                  onChange={(e) => handlePreferenceChange('showDetailedNotifications', e.target.checked)}
                  disabled={savingPreferences || !preferences.showDesktopNotifications} // Disable if desktop notifications are off
                />
                Show Notification Details
              </label>
              <small>Include details like username and post content in desktop notifications. Disable for more privacy.</small>
            </div>
            
            {/* Add more preference controls here */} 

            <button onClick={handleSavePreferences} disabled={savingPreferences} className="save-button">
              {savingPreferences ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        )}
      </div>

      {/* About Tab */} 
      <div className={`tab-content ${activeTab === 'about' ? 'active' : ''}`} id="about-tab">
        <h2>About Notisky</h2>
        <p>Version: {browser.runtime.getManifest().version}</p>
        <p>Enhances Bluesky with multi-account notifications.</p>
        {/* TODO: Add links to GitHub, privacy policy etc. */} 
      </div>

    </div>
  );
};

export default App; 