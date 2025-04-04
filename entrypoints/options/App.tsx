import React, { useState, useEffect } from 'react';

interface UserPreferences {
  updateSiteIcon: boolean;
  updateExtensionIcon: boolean;
  enableNotifications: boolean;
  keepPageAlive: boolean;
  refreshInterval: number;
  useNotificationServer: boolean;
  notificationServerUrl: string;
  notificationServerUserId: string;
}

const defaultPreferences: UserPreferences = {
  updateSiteIcon: true,
  updateExtensionIcon: true,
  enableNotifications: true,
  keepPageAlive: true,
  refreshInterval: 1,
  useNotificationServer: false,
  notificationServerUrl: '',
  notificationServerUserId: ''
};

const App: React.FC = () => {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [activeTab, setActiveTab] = useState<string>('preferences');
  const [statusMessage, setStatusMessage] = useState<{ text: string, type: string } | null>(null);
  const [serverStatus, setServerStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  // Load preferences when component mounts
  useEffect(() => {
    loadPreferences();
  }, []);

  // Check server connection when preferences change
  useEffect(() => {
    if (preferences.useNotificationServer && 
        preferences.notificationServerUrl && 
        preferences.notificationServerUserId) {
      checkServerConnection();
    }
  }, [preferences.useNotificationServer, preferences.notificationServerUrl, preferences.notificationServerUserId]);

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

  // Check connection to notification server
  const checkServerConnection = async () => {
    if (!preferences.notificationServerUrl) {
      setServerStatus('error');
      return;
    }

    setServerStatus('checking');

    try {
      // Ensure URL has correct format
      let url = preferences.notificationServerUrl;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      
      // Remove trailing slash if present
      if (url.endsWith('/')) {
        url = url.slice(0, -1);
      }
      
      // Attempt to fetch server status
      const response = await fetch(`${url}/api/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setServerStatus('connected');
          
          // Save normalized URL
          if (url !== preferences.notificationServerUrl) {
            setPreferences({
              ...preferences,
              notificationServerUrl: url
            });
          }
          
          return;
        }
      }
      
      setServerStatus('error');
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

  return (
    <div className="container">
      <h1>
        <img src="../assets/icons/icon48.png" alt="Notisky Logo" />
        Notisky Notifications Options
      </h1>

      <div className="tab-navigation">
        <div 
          className={`tab ${activeTab === 'preferences' ? 'active' : ''}`}
          onClick={() => setActiveTab('preferences')}
        >
          Preferences
        </div>
        <div 
          className={`tab ${activeTab === 'server' ? 'active' : ''}`}
          onClick={() => setActiveTab('server')}
        >
          Notification Server
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
          
          <div className="toggle-option">
            <div>
              <div className="option-label">Use Notification Server</div>
              <div className="option-description">Connect to a notification server for real-time multi-account updates</div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={preferences.useNotificationServer}
                onChange={(e) => handlePreferenceChange('useNotificationServer', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        <div className={`input-group ${preferences.keepPageAlive && !preferences.useNotificationServer ? 'visible' : ''}`}>
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
          <button onClick={savePreferences}>Save Preferences</button>
        </div>

        {statusMessage && (
          <div className={`message ${statusMessage.type}`}>
            {statusMessage.text}
          </div>
        )}
      </div>
      
      <div className={`tab-content ${activeTab === 'server' ? 'active' : ''}`} id="server-tab">
        <h2>Notification Server</h2>
        <p className="server-description">
          Connect to a Notisky notification server to get real-time notifications from multiple Bluesky accounts.
        </p>
        
        <div className="server-settings">
          <div className="form-group">
            <label htmlFor="server-url">Server URL</label>
            <input
              type="text"
              id="server-url"
              placeholder="https://yourserver.com"
              value={preferences.notificationServerUrl}
              onChange={(e) => handlePreferenceChange('notificationServerUrl', e.target.value)}
              disabled={!preferences.useNotificationServer}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="server-userid">User ID</label>
            <input
              type="text"
              id="server-userid"
              placeholder="Your user ID from the notification server"
              value={preferences.notificationServerUserId}
              onChange={(e) => handlePreferenceChange('notificationServerUserId', e.target.value)}
              disabled={!preferences.useNotificationServer}
            />
          </div>
          
          <div className="server-status">
            <span className="status-label">Server Status:</span>
            <span className={`status-indicator ${serverStatus}`}>
              {serverStatus === 'checking' && 'Checking connection...'}
              {serverStatus === 'connected' && 'Connected'}
              {serverStatus === 'error' && 'Connection error'}
            </span>
          </div>
          
          <div className="action-buttons">
            <button 
              onClick={checkServerConnection}
              disabled={!preferences.useNotificationServer || !preferences.notificationServerUrl}
            >
              Test Connection
            </button>
            <button onClick={savePreferences}>Save Settings</button>
          </div>
          
          <div className="server-info">
            <p>
              Don't have a server? Check the <a href="https://github.com/dylanpdx/notisky" target="_blank">Notisky GitHub repository</a> for instructions on setting up your own notification server.
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
          <li>Real-time multi-account notifications via notification server</li>
        </ul>
      </div>
    </div>
  );
};

export default App; 