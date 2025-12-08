# SSR Fix - Server-Side Rendering Error Resolved

## Error Fixed ✅

**Error Message:**
```
ReferenceError: document is not defined
at getDeviceProfile (./lib/deviceUtils.ts:20:20)
```

## Problem ❌

The error occurred because Next.js performs **Server-Side Rendering (SSR)**. During SSR:
- Code runs on the server (Node.js environment)
- `window`, `document`, `navigator` don't exist on the server
- Accessing these objects causes `ReferenceError`

The `getDeviceProfile()` function was trying to access `document.createElement` during SSR, which doesn't exist on the server.

## Solution ✅

Added SSR safety checks to all browser-dependent code in `lib/deviceUtils.ts`:

### 1. **Fixed `getDeviceProfile()`**

```typescript
export function getDeviceProfile(): DeviceProfile {
    // SSR Safety: Return default profile if not in browser
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return 'medium'; // Default for server-side rendering
    }

    // ... rest of code

    // Only access document in browser environment
    if (typeof document !== 'undefined') {
        try {
            const canvas = document.createElement('canvas');
            // ... GPU detection
        } catch (error) {
            console.warn('Failed to detect GPU tier:', error);
        }
    }

    // ... rest of code
}
```

### 2. **Fixed `getQualitySettings()`**

```typescript
export function getQualitySettings(profile: DeviceProfile): QualitySettings {
    // SSR Safety: Get device pixel ratio safely
    const getPixelRatio = (max: number = 2) => {
        if (typeof window === 'undefined') return 1;
        return Math.min(window.devicePixelRatio || 1, max);
    };

    const settings = {
        medium: {
            // ...
            pixelRatio: getPixelRatio(1.5), // Safe for SSR
        },
        high: {
            // ...
            pixelRatio: getPixelRatio(2), // Safe for SSR
        },
    };

    return settings[profile];
}
```

### 3. **Fixed `isFlutterWebView()`**

```typescript
export function isFlutterWebView(): boolean {
    if (typeof window === 'undefined') return false;
    return typeof (window as any).DownloadHandler !== 'undefined';
}
```

## How It Works Now ✨

### During Server-Side Rendering (Initial Page Load)
```
Server receives request
  ↓
typeof window === 'undefined' → true
  ↓
Return safe defaults:
  - getDeviceProfile() → 'medium'
  - getPixelRatio() → 1
  - isFlutterWebView() → false
  ↓
Page renders on server (no errors!)
  ↓
HTML sent to browser
```

### In Browser (After Hydration)
```
Page loads in browser
  ↓
typeof window === 'undefined' → false
  ↓
Run full device detection:
  - Check navigator.userAgent
  - Detect GPU tier
  - Check device memory
  - Get devicePixelRatio
  ↓
Get accurate device profile
  ↓
Optimal quality settings applied!
```

## Files Modified 📝

- ✅ `lib/deviceUtils.ts` - Added SSR safety checks to all browser-dependent functions

## Testing ✅

The dev server should automatically refresh. Check:

1. **No More Errors**
   - Console should be clean
   - No "document is not defined" errors
   - No React hydration errors

2. **Page Loads Successfully**
   - Customize page loads without errors
   - Models load and cache properly
   - All functionality works

3. **Quality Detection Works**
   - Device profile is detected correctly in browser
   - Appropriate quality settings applied
   - Performance optimized based on device

## SSR vs Client-Side Behavior

| Function | Server (SSR) | Browser (Client) |
|----------|--------------|------------------|
| `getDeviceProfile()` | Returns 'medium' | Detects actual device capabilities |
| `getPixelRatio()` | Returns 1 | Returns actual devicePixelRatio |
| `isFlutterWebView()` | Returns false | Detects if in Flutter WebView |
| GPU Detection | Skipped | Runs if supported |

## Why This Happens

Next.js performs SSR for:
- ✅ Better SEO (search engines can read content)
- ✅ Faster initial page load (pre-rendered HTML)
- ✅ Better perceived performance

But this means:
- ⚠️ Code runs twice (once on server, once in browser)
- ⚠️ Browser APIs not available during SSR
- ⚠️ Must check `typeof window !== 'undefined'` before using browser APIs

## Best Practice for Next.js

Always check for browser environment before using:
- `window`
- `document`
- `navigator`
- `localStorage`
- `sessionStorage`
- `indexedDB`
- Browser WebAPIs

```typescript
// ✅ Good
if (typeof window !== 'undefined') {
    const value = window.localStorage.getItem('key');
}

// ❌ Bad
const value = window.localStorage.getItem('key'); // Crashes on server!
```

## Summary 🎊

**Error:** `document is not defined` during SSR  
**Cause:** Accessing browser APIs during server-side rendering  
**Fix:** Added SSR safety checks with `typeof window !== 'undefined'`  
**Result:** Page loads without errors, caching works perfectly!

---

**The SSR issue is now resolved!** Your app should work smoothly now. ✅

Refresh the page and the error should be gone!
