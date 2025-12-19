# SmartCookBook Troubleshooting Guide

Comprehensive guide for resolving common issues, understanding error codes, and configuring browser/OS settings.

---

## Table of Contents

1. [Error Codes Reference](#error-codes-reference)
2. [Common Issues & Solutions](#common-issues--solutions)
3. [Browser-Specific Issues](#browser-specific-issues)
4. [Microphone Permission Guides](#microphone-permission-guides)
5. [Network & Connectivity Issues](#network--connectivity-issues)
6. [Database & Storage Issues](#database--storage-issues)
7. [Voice Recognition Issues](#voice-recognition-issues)
8. [QuickBooks Integration Issues](#quickbooks-integration-issues)
9. [Deployment Issues](#deployment-issues)

---

## Error Codes Reference

### Application Error Types

| Type | Description | Common Causes |
|------|-------------|---------------|
| `NETWORK` | Network connectivity issues | No internet, server down, CORS |
| `AUTH` | Authentication errors | Wrong credentials, expired session |
| `VALIDATION` | Invalid input data | Missing fields, wrong format |
| `DATABASE` | Local/cloud database errors | Storage full, sync conflicts |
| `FILE` | File upload/processing errors | File too large, wrong format |
| `API` | External API errors | Rate limits, service down |
| `PERMISSION` | Insufficient access rights | Wrong user role, blocked feature |
| `NOT_FOUND` | Resource not found | Deleted item, wrong ID |
| `TIMEOUT` | Operation took too long | Slow connection, large file |
| `UNKNOWN` | Unclassified error | Bug, unexpected state |

### HTTP Status Codes

| Code | Meaning | User Message | Solution |
|------|---------|--------------|----------|
| 400 | Bad Request | Invalid request. Please check your input. | Verify form data is correct |
| 401 | Unauthorized | Please log in to continue. | Re-authenticate |
| 403 | Forbidden | You do not have permission for this action. | Check user role/permissions |
| 404 | Not Found | The requested resource was not found. | Verify URL or item exists |
| 429 | Too Many Requests | Too many requests. Please wait a moment. | Wait 1-2 minutes, retry |
| 500 | Server Error | Server error. Please try again later. | Report issue, try later |
| 502 | Bad Gateway | Server is temporarily unavailable. | Wait and retry |
| 503 | Service Unavailable | Service unavailable. Please try again later. | Check status page |

### Firebase Authentication Errors

| Error Code | Message | Solution |
|------------|---------|----------|
| `auth/email-already-in-use` | This email is already registered. | Use different email or reset password |
| `auth/invalid-email` | Please enter a valid email address. | Check email format |
| `auth/weak-password` | Password should be at least 6 characters. | Use stronger password |
| `auth/user-not-found` | No account found with this email. | Check email or create account |
| `auth/wrong-password` | Incorrect password. Please try again. | Reset password if forgotten |
| `auth/too-many-requests` | Too many attempts. Please wait a moment. | Wait 5-10 minutes |
| `auth/user-disabled` | This account has been disabled. | Contact administrator |
| `auth/requires-recent-login` | Please log in again to complete this action. | Re-authenticate first |
| `auth/invalid-credential` | Invalid credentials. Please check your email and password. | Verify both email and password |

### Database Errors

| Error Name | Message | Solution |
|------------|---------|----------|
| `QuotaExceededError` | Storage is full. Please delete some data. | Delete old recipes/invoices |
| `ConstraintError` | This item already exists. | Use different name |
| `NotFoundError` | The requested item was not found. | Item may have been deleted |
| `InvalidStateError` | Database is not ready. Please refresh. | Refresh page, clear cache |
| `VersionError` | Database upgrade needed. | Clear site data, reload |
| `AbortError` | Transaction was aborted. | Retry the operation |

### Network Errors

| Error Pattern | Message | Solution |
|---------------|---------|----------|
| `Failed to fetch` | Unable to connect to the server. | Check internet connection |
| `NetworkError` | Network error. Please check your connection. | Verify WiFi/ethernet |
| `net::ERR_CONNECTION_REFUSED` | Connection failed. | Server may be down |
| `ECONNREFUSED` | Server is not responding. | Check server status |
| `ETIMEDOUT` | Connection timed out. | Retry with better connection |
| `net::ERR_CERT_AUTHORITY_INVALID` | SSL certificate error. | Clear browser cache |

### QuickBooks Errors

| Error Code | Message | Solution |
|------------|---------|----------|
| `QB_NOT_CONNECTED` | QuickBooks is not connected. | Connect in Settings |
| `QB_TOKEN_EXPIRED` | QuickBooks session expired. | Reconnect to QuickBooks |
| `QB_RATE_LIMIT` | QuickBooks rate limit reached. | Wait 1-2 minutes |
| `invalid_grant` | Authorization expired. | Reconnect OAuth |
| `missing_params` | OAuth callback missing parameters. | Restart OAuth flow |

### Claude API Errors

| Status | Meaning | Solution |
|--------|---------|----------|
| 401 | Invalid API key | Check CLAUDE_API_KEY secret |
| 403 | Access denied | Verify API key permissions |
| 429 | Rate limit exceeded | Wait or upgrade plan |
| 500 | Claude API error | Retry later |
| 529 | Claude overloaded | Wait 30 seconds, retry |

---

## Common Issues & Solutions

### App Won't Load

**Symptoms:** Blank page, loading spinner forever, white screen

**Solutions:**
1. **Clear browser cache**
   - Chrome: `Ctrl+Shift+Delete` > Clear cached images/files
   - Firefox: `Ctrl+Shift+Delete` > Cache
   - Safari: `Cmd+Option+E`

2. **Check console for errors**
   - Press `F12` > Console tab
   - Look for red error messages

3. **Verify environment variables**
   - Check `.env.local` exists
   - All `VITE_` variables are set

4. **Try incognito/private mode**
   - Rules out extension conflicts

### Login Not Working

**Symptoms:** Can't sign in, "Invalid credentials" error

**Solutions:**
1. **Check email format**
   - Must be valid email (user@domain.com)

2. **Reset password**
   - Use "Forgot Password" link

3. **Check for spaces**
   - No leading/trailing spaces in email

4. **Try different browser**
   - May be browser-specific issue

### Data Not Syncing

**Symptoms:** Changes not appearing on other devices

**Solutions:**
1. **Check sync status icon**
   - Cloud icon in menu bar shows sync status

2. **Verify internet connection**
   - Open another website to test

3. **Force sync**
   - Refresh page (`F5` or `Cmd+R`)

4. **Check Firestore rules**
   - Ensure user has write permission

### Voice Input Not Working

**Symptoms:** Microphone button doesn't respond, no transcription

**Solutions:**
1. **Check microphone permissions**
   - See [Microphone Permission Guides](#microphone-permission-guides)

2. **Use HTTPS**
   - Voice only works on HTTPS or localhost

3. **Check browser support**
   - Use Chrome, Edge, or Safari
   - Firefox has limited support

4. **Test microphone**
   - Try in another app (Voice Recorder, etc.)

---

## Browser-Specific Issues

### Google Chrome

| Issue | Solution |
|-------|----------|
| Microphone blocked | Click lock icon > Site settings > Microphone > Allow |
| IndexedDB errors | Settings > Privacy > Clear browsing data > Cookies |
| Service worker issues | DevTools > Application > Service Workers > Unregister |
| Cache not updating | Hard refresh: `Ctrl+Shift+R` |
| CORS errors | Check if extensions blocking requests |
| High memory usage | Close unused tabs, disable extensions |

**Chrome-Specific Tips:**
- Enable hardware acceleration: Settings > System > Use hardware acceleration
- Check chrome://flags for experimental features
- Use chrome://indexeddb-internals/ to debug IndexedDB

### Mozilla Firefox

| Issue | Solution |
|-------|----------|
| Voice recognition limited | Firefox uses different speech API - some features may not work |
| Storage quota errors | about:config > dom.indexedDB.enabled > true |
| CORS strict mode | Disable Enhanced Tracking Protection for site |
| Service worker issues | about:debugging > This Firefox > Service Workers |

**Firefox-Specific Tips:**
- Voice recognition is not fully supported - use Chrome for voice features
- Check about:config for dom.* settings
- Use about:storage-access-api for permission debugging

### Safari (macOS/iOS)

| Issue | Solution |
|-------|----------|
| IndexedDB in private mode | IndexedDB doesn't persist in Private Browsing |
| Voice recognition | Uses native Speech Recognition - check System Preferences |
| Camera/mic blocked | Safari > Settings for This Website > Allow |
| PWA not installing | Add to Home Screen from Share menu |

**Safari-Specific Tips:**
- Enable "Allow websites to check for Apple Pay" in preferences
- Check Develop menu for debugging (enable in Preferences > Advanced)
- iOS: Settings > Safari > Advanced > Website Data

### Microsoft Edge

| Issue | Solution |
|-------|----------|
| Microphone blocked | Click lock icon > Permissions > Microphone > Allow |
| IE mode issues | Disable IE mode for this site |
| Sync conflicts | Sign out of Microsoft account, clear cache |
| Extensions blocking | Try InPrivate mode |

**Edge-Specific Tips:**
- Edge uses same engine as Chrome - most Chrome solutions apply
- Check edge://settings/content/microphone for permissions
- Use edge://flags for experimental features

### Mobile Browsers

#### Chrome Mobile (Android)
| Issue | Solution |
|-------|----------|
| Microphone permission | Settings > Apps > Chrome > Permissions > Microphone |
| Site not loading | Chrome > Settings > Site Settings > Clear data |
| PWA not updating | Uninstall PWA, clear cache, reinstall |

#### Safari Mobile (iOS)
| Issue | Solution |
|-------|----------|
| Microphone not working | Settings > Safari > Microphone > Allow |
| PWA crashes | Delete PWA, clear Safari cache, re-add |
| Keyboard covers input | Scroll page or rotate device |

---

## Microphone Permission Guides

### Windows 11/10

#### Enable System-Wide Microphone Access

1. **Open Settings**
   - Press `Windows + I`
   - Or click Start > Settings

2. **Go to Privacy & Security**
   - Click "Privacy & security" in sidebar
   - Click "Microphone"

3. **Enable Microphone Access**
   - Turn ON "Microphone access"
   - Turn ON "Let apps access your microphone"
   - Turn ON "Let desktop apps access your microphone"

4. **Check App-Specific Permissions**
   - Scroll down to see which apps have access
   - Ensure your browser is listed and enabled

#### Browser-Specific (Windows)

**Chrome:**
1. Click the lock icon (left of URL)
2. Click "Site settings"
3. Find "Microphone" > Select "Allow"

**Edge:**
1. Click the lock icon
2. Click "Permissions for this site"
3. Set Microphone to "Allow"

**Firefox:**
1. Click the lock icon
2. Click "Connection secure"
3. Click "More Information"
4. Go to "Permissions" tab
5. Find Microphone > "Allow"

### macOS

#### Enable System-Wide Microphone Access

1. **Open System Preferences**
   - Click Apple menu >  > System Preferences
   - Or System Settings on macOS Ventura+

2. **Go to Security & Privacy**
   - Click "Security & Privacy"
   - Click "Privacy" tab
   - Click "Microphone" in sidebar

3. **Enable Browser Access**
   - Check the box next to your browser (Chrome, Safari, Firefox)
   - You may need to click the lock icon and enter password first

4. **Restart Browser**
   - Quit and reopen browser for changes to take effect

#### macOS Ventura+ (System Settings)

1. **Open System Settings**
   - Apple menu > System Settings

2. **Privacy & Security**
   - Click "Privacy & Security" in sidebar
   - Click "Microphone"

3. **Enable Browser**
   - Toggle ON for your browser

### Linux (Ubuntu/Debian)

#### Check Microphone Hardware

```bash
# List audio devices
arecord -l

# Test microphone
arecord -d 5 test.wav && aplay test.wav
```

#### PulseAudio Settings

```bash
# Open PulseAudio volume control
pavucontrol

# Go to "Input Devices" tab
# Ensure microphone is not muted
# Set as default if needed
```

#### Browser Permissions

**Chrome/Chromium:**
1. Go to `chrome://settings/content/microphone`
2. Add site to "Allowed" list

**Firefox:**
1. Go to `about:preferences#privacy`
2. Scroll to "Permissions"
3. Click "Settings" next to Microphone

### Android

#### Enable System Microphone

1. **Open Settings**
   - Swipe down > tap gear icon

2. **Apps & Notifications**
   - Tap "Apps" or "Apps & notifications"
   - Find and tap your browser (Chrome)

3. **Permissions**
   - Tap "Permissions"
   - Tap "Microphone"
   - Select "Allow" or "Allow only while using the app"

#### Per-Site Permission (Chrome)

1. Open the website
2. Tap the lock icon in address bar
3. Tap "Permissions"
4. Enable "Microphone"

### iOS (iPhone/iPad)

#### Enable System Microphone

1. **Open Settings**
   - Tap Settings app

2. **Find Safari/Chrome**
   - Scroll down to Safari or Chrome
   - Tap to open

3. **Enable Microphone**
   - Toggle ON "Microphone"

#### Per-Site Permission (Safari)

1. Open the website in Safari
2. Tap "aA" in address bar
3. Tap "Website Settings"
4. Set Microphone to "Allow"

### Troubleshooting Microphone Issues

#### Microphone Test Steps

1. **Test in another app**
   - Windows: Voice Recorder
   - macOS: QuickTime > New Audio Recording
   - Linux: `arecord -d 5 test.wav`
   - Mobile: Voice Memo app

2. **Check browser console**
   - Press F12 > Console
   - Look for permission errors

3. **Check HTTPS**
   - Microphone only works on HTTPS or localhost
   - Check URL starts with `https://`

4. **Try incognito/private mode**
   - Rules out extension conflicts

#### Common Microphone Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `NotAllowedError` | Permission denied | Enable in browser/OS settings |
| `NotFoundError` | No microphone detected | Connect microphone, check drivers |
| `NotReadableError` | Microphone in use | Close other apps using mic |
| `OverconstrainedError` | Requested settings not available | Use default settings |
| `SecurityError` | Not HTTPS | Use HTTPS or localhost |

---

## Network & Connectivity Issues

### Diagnosing Connection Problems

#### Step 1: Check Internet Connection
```bash
# Windows
ping google.com

# macOS/Linux
ping -c 4 google.com
```

#### Step 2: Check DNS
```bash
# Windows
nslookup smartcookbook-2afe2.web.app

# macOS/Linux
dig smartcookbook-2afe2.web.app
```

#### Step 3: Check Firewall
- Ensure ports 443 (HTTPS) and 80 (HTTP) are open
- Check corporate firewall/proxy settings

### Offline Mode

SmartCookBook works offline with these limitations:

| Feature | Offline | Online |
|---------|---------|--------|
| View recipes | Yes | Yes |
| Edit recipes | Yes | Yes |
| Add recipes | Yes | Yes |
| Delete recipes | Yes | Yes |
| Voice input | No | Yes |
| PDF import | No | Yes |
| Cloud sync | No | Yes |
| QuickBooks | No | Yes |

**Sync Recovery:**
1. Changes are saved locally in IndexedDB
2. When online, sync automatically resumes
3. Conflicts resolved by timestamp (last-write-wins)

---

## Database & Storage Issues

### Clear IndexedDB Data

**Chrome:**
1. Press `F12` (DevTools)
2. Go to Application tab
3. Expand "IndexedDB" in sidebar
4. Right-click database > Delete database

**Firefox:**
1. Press `F12`
2. Go to Storage tab
3. Expand "Indexed DB"
4. Right-click > Delete All

**Safari:**
1. Enable Develop menu (Preferences > Advanced)
2. Develop > Show Web Inspector
3. Storage tab > Indexed Databases > Delete

### Storage Quota Issues

**Check Storage Usage:**
```javascript
// In browser console (F12)
navigator.storage.estimate().then(estimate => {
  console.log('Used:', (estimate.usage / 1024 / 1024).toFixed(2), 'MB');
  console.log('Quota:', (estimate.quota / 1024 / 1024).toFixed(2), 'MB');
});
```

**Increase Storage (Chrome):**
```javascript
// Request persistent storage
navigator.storage.persist().then(granted => {
  console.log('Persistent storage:', granted ? 'granted' : 'denied');
});
```

---

## Voice Recognition Issues

### Supported Languages

| Language | Code | Support Level |
|----------|------|---------------|
| English (US) | en-US | Full |
| English (UK) | en-GB | Full |
| French (Canada) | fr-CA | Full (default) |
| French (France) | fr-FR | Full |
| Spanish | es-ES | Full |
| German | de-DE | Full |

### Voice Recognition Tips

1. **Speak clearly** - Moderate pace, clear pronunciation
2. **Reduce background noise** - Find quiet environment
3. **Use good microphone** - Built-in laptop mics work but external is better
4. **Stay close** - 6-12 inches from microphone
5. **Wait for indicator** - Ensure recording has started

### Voice Commands (Bulk Dictation)

When dictating multiple items:
- Pause briefly between items
- Say "next" or pause 1-2 seconds for new line
- Speak ingredient name, then quantity
- Review and edit after dictation

---

## QuickBooks Integration Issues

### Connection Troubleshooting

1. **Check Environment**
   - Sandbox vs Production mode in Settings
   - Use Sandbox for testing

2. **Reconnect OAuth**
   - Settings > QuickBooks > Disconnect
   - Wait 10 seconds
   - Click Connect again

3. **Check Redirect URI**
   - Must match exactly in Intuit Developer Portal
   - `https://us-central1-smartcookbook-2afe2.cloudfunctions.net/quickbooksCallback`

4. **Verify Credentials**
   - Client ID and Secret must be correct for environment
   - Production requires Intuit approval

### Sync Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Vendor not found" | QB vendor doesn't exist | Create vendor first |
| "Account not found" | Invalid expense account | Select valid account |
| "Duplicate bill" | Bill already created | Check existing bills |
| "Invalid date" | Date format issue | Use YYYY-MM-DD format |

---

## Deployment Issues

### Firebase Hosting

```bash
# Check deployment status
firebase hosting:channel:list

# View deployment logs
firebase hosting:log

# Rollback to previous version
firebase hosting:clone SOURCE_SITE:SOURCE_CHANNEL TARGET_SITE:TARGET_CHANNEL
```

### Cloud Functions

```bash
# View function logs
firebase functions:log

# View specific function
firebase functions:log --only claudeProxy

# Check function status
firebase functions:list
```

### Common Deployment Errors

| Error | Solution |
|-------|----------|
| "Functions deployment failed" | Check Node.js version (18+), run `npm install` in functions/ |
| "Hosting deployment failed" | Run `npm run build` first, check dist/ exists |
| "Permission denied" | Run `firebase login` to re-authenticate |
| "Quota exceeded" | Check Firebase plan, upgrade if needed |

---

## Getting Help

### Collect Debug Information

When reporting issues, include:

1. **Browser & Version**
   - Chrome: `chrome://version`
   - Firefox: `about:support`

2. **Console Errors**
   - Press F12 > Console
   - Copy any red error messages

3. **Network Errors**
   - F12 > Network tab
   - Filter by "Fetch/XHR"
   - Check for failed requests

4. **Steps to Reproduce**
   - What were you doing?
   - What did you expect?
   - What happened instead?

### Report Issues

- GitHub Issues: https://github.com/your-repo/issues
- Include debug information above
- Screenshots help!

---

*Last Updated: 2025-12-07*
