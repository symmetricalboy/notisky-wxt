import React, { useState, useEffect } from 'react';

interface UserPreferences {
  updateSiteIcon: boolean;
  updateExtensionIcon: boolean;
  enableNotifications: boolean;
  keepPageAlive: boolean;
  refreshInterval: number;
  notificationServerUrl: string;
  notificationServerUserId: string;
}

const defaultPreferences: UserPreferences = {
  updateSiteIcon: true,
  updateExtensionIcon: true,
  enableNotifications: true,
  keepPageAlive: true,
  refreshInterval: 1,
  notificationServerUrl: 'https://notisky.symm.app',
  notificationServerUserId: ''
};

const App: React.FC = () => {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [activeTab, setActiveTab] = useState<string>('preferences');
  const [statusMessage, setStatusMessage] = useState<{ text: string, type: string } | null>(null);
  const [serverStatus, setServerStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [accountsInfo, setAccountsInfo] = useState<any[]>([]);

  // Load preferences when component mounts
  useEffect(() => {
    loadPreferences();
    fetchLinkedAccounts();
  }, []);

  // Check server connection when component mounts
  useEffect(() => {
    checkServerConnection();
  }, []);

  // Function to load user preferences
  const loadPreferences = async () => {
    try {
      const result = await browser.storage.sync.get(defaultPreferences);
      setPreferences(result as UserPreferences);
      console.log('Preferences loaded:', result);
    } catch (error) {
      console.error('Error loading preferences:', error);
      showStatusMessage('Error loading preferences', 'error');
    }
  };

  // Function to save user preferences
  const savePreferences = async () => {
    try {
      await browser.storage.sync.set(preferences);
      console.log('Preferences saved:', preferences);
      showStatusMessage('Preferences saved!', 'success');
      
      // Notify background script of changes
      await browser.runtime.sendMessage({
        action: 'preferencesUpdated',
        preferences
      });
    } catch (error) {
      console.error('Error saving preferences:', error);
      showStatusMessage('Error saving preferences', 'error');
    }
  };

  // Fetch accounts linked to this extension
  const fetchLinkedAccounts = async () => {
    try {
      const { accounts = [] } = await browser.storage.local.get('accounts');
      setAccountsInfo(accounts);
    } catch (error) {
      console.error('Error fetching linked accounts:', error);
    }
  };

  // Check connection to notification server
  const checkServerConnection = async () => {
    setServerStatus('checking');

    try {
      // Use the fixed Vercel deployment URL
      const url = 'https://notisky.symm.app';
      
      // First try the status.json file which is more reliable
      try {
        const jsonResponse = await fetch(`${url}/api/status.json`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          mode: 'cors'
        });
        
        if (jsonResponse.ok) {
          const contentType = jsonResponse.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await jsonResponse.json();
            if (data.success) {
              setServerStatus('connected');
              setPreferences(prev => ({ ...prev, notificationServerUrl: url }));
              return;
            }
          }
        }
      } catch (jsonError) {
        console.warn('Could not fetch from status.json, trying API endpoint:', jsonError);
      }

      // Fallback to the API endpoint
      const response = await fetch(`${url}/api/status`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        mode: 'cors'
      }).catch(error => {
        console.error('Fetch error:', error);
        throw error;
      });
      
      if (response.ok) {
        // Verify content type is JSON before trying to parse
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          if (data.success) {
            setServerStatus('connected');
            setPreferences(prev => ({ ...prev, notificationServerUrl: url }));
            return;
          } else {
            console.error('Server returned non-success status:', data);
            setServerStatus('error');
          }
        } else {
          console.error('Server returned non-JSON content type:', contentType);
          setServerStatus('error');
        }
      } else {
        console.error('Server returned error status:', response.status);
        setServerStatus('error');
      }
    } catch (error) {
      console.error('Error connecting to notification server:', error);
      setServerStatus('error');
    }
  };

  // Function to show status message
  const showStatusMessage = (text: string, type: string) => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage(null);
    }, 3000);
  };

  // Handle preference change
  const handlePreferenceChange = (key: keyof UserPreferences, value: boolean | number | string) => {
    setPreferences({
      ...preferences,
      [key]: value
    });
  };

  // Open auth portal in new tab
  const openAuthPortal = () => {
    browser.tabs.create({ url: 'https://notisky.symm.app' });
  };

  return (
    <div className="container">
      <header className="app-header">
        <img src="../assets/icons/icon48.png" alt="Notisky Logo" className="logo" />
        <h1>Notisky Notifications</h1>
      </header>

      <div className="tab-navigation">
        <div 
          className={`tab ${activeTab === 'preferences' ? 'active' : ''}`}
          onClick={() => setActiveTab('preferences')}
        >
          Preferences
        </div>
        <div 
          className={`tab ${activeTab === 'accounts' ? 'active' : ''}`}
          onClick={() => setActiveTab('accounts')}
        >
          Accounts
        </div>
        <div 
          className={`tab ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          About
        </div>
      </div>

      <div className={`tab-content ${activeTab === 'preferences' ? 'active' : ''}`} id="preferences-tab">
        <h2>Notification Settings</h2>
        <div className="toggle-container">
          <div className="toggle-option">
            <div>
              <div className="option-label">Update Website Icon</div>
              <div className="option-description">Show notification count on the Bluesky website favicon</div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={preferences.updateSiteIcon}
                onChange={(e) => handlePreferenceChange('updateSiteIcon', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-option">
            <div>
              <div className="option-label">Update Extension Icon</div>
              <div className="option-description">Show notification count on the extension icon</div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={preferences.updateExtensionIcon}
                onChange={(e) => handlePreferenceChange('updateExtensionIcon', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-option">
            <div>
              <div className="option-label">Enable Desktop Notifications</div>
              <div className="option-description">Show desktop notifications for new activity</div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={preferences.enableNotifications}
                onChange={(e) => handlePreferenceChange('enableNotifications', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="toggle-option">
            <div>
              <div className="option-label">Background Checking</div>
              <div className="option-description">Check for notifications in the background</div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={preferences.keepPageAlive}
                onChange={(e) => handlePreferenceChange('keepPageAlive', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        <div className="input-group visible">
          <label htmlFor="refresh-interval">Check Interval (minutes)</label>
          <input
            type="number"
            id="refresh-interval"
            min="1"
            max="60"
            value={preferences.refreshInterval}
            onChange={(e) => handlePreferenceChange('refreshInterval', parseInt(e.target.value) || 1)}
          />
        </div>

        <div className="action-buttons">
          <button onClick={savePreferences} className="primary-button">Save Preferences</button>
        </div>

        {statusMessage && (
          <div className={`message ${statusMessage.type}`}>
            {statusMessage.text}
          </div>
        )}
      </div>
      
      <div className={`tab-content ${activeTab === 'accounts' ? 'active' : ''}`} id="accounts-tab">
        <h2>Bluesky Accounts</h2>
        
        <div className="accounts-section">
          <div className="server-status-banner">
            <div className={`status-indicator ${serverStatus}`}>
              {serverStatus === 'checking' && 'Checking connection to Notisky server...'}
              {serverStatus === 'connected' && 'Connected to Notisky authentication server'}
              {serverStatus === 'error' && 'Error connecting to Notisky server'}
            </div>
          </div>
          
          {accountsInfo.length > 0 ? (
            <div className="accounts-list">
              <h3>Connected Accounts</h3>
              {accountsInfo.map((account, index) => (
                <div key={index} className="account-card">
                  <div className="account-info">
                    <div className="account-handle">@{account.handle}</div>
                    <div className="account-did">{account.did}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-accounts">
              <p>No accounts connected yet.</p>
            </div>
          )}
          
          <div className="auth-actions">
            <button onClick={openAuthPortal} className="primary-button">
              Manage Accounts in Auth Portal
            </button>
          </div>
          
          <div className="accounts-help">
            <p>
              Notisky uses the Authentication Portal to securely manage your Bluesky accounts.
              You can connect multiple accounts to receive real-time notifications from all of them.
            </p>
          </div>
        </div>
      </div>

      <div className={`tab-content ${activeTab === 'about' ? 'active' : ''}`} id="about-tab">
        <h2>About Notisky Notifications</h2>
        <p>
          Notisky is a browser extension that enhances Bluesky with notification features.
          It helps you stay updated with your Bluesky notifications without having to keep checking the site.
        </p>
        <p>
          <strong>Version:</strong> 1.0.0
        </p>
        <p>
          <strong>Supported Browsers:</strong> Chrome, Firefox, Safari
        </p>
        <p>
          <strong>Features:</strong>
        </p>
        <ul>
          <li>Display notification count on the extension icon</li>
          <li>Display notification count on the Bluesky tab favicon</li>
          <li>Background notification checking</li>
          <li>Desktop notifications</li>
          <li>Real-time multi-account notifications via Notisky server</li>
        </ul>
        
        <div className="auth-actions">
          <a href="https://notisky.symm.app" target="_blank" rel="noopener noreferrer" className="secondary-button">
            Visit Auth Portal
          </a>
          <a href="https://github.com/symmetricalboy/notisky" target="_blank" rel="noopener noreferrer" className="secondary-button">
            GitHub Repository
          </a>
        </div>
      </div>
      
      <footer className="app-footer">
        <p className="footer-slogan">Free & open source, for all, forever.</p>
        <p className="footer-contact">
          Feedback, suggestions, assistance, & updates:
          <a href="https://bsky.app/profile/symm.app" target="_blank" rel="noopener noreferrer">@symm.app</a>
        </p>
        <p className="footer-copyright">Copyright (c) 2025 Dylan Gregori Singer (symmetricalboy)</p>
      </footer>
    </div>
  );
};

export default App; 