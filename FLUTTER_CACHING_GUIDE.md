# Flutter WebView Caching Configuration Guide

## Overview

Your Flutter app uses `InAppWebView` to display the 3D model customizer. With the web caching now implemented, the Flutter app will automatically benefit from it. However, you should also configure the Flutter side for optimal performance.

## Good News! 🎉

**You DON'T need to re-implement the caching logic in Flutter!** The web caching (IndexedDB, localStorage, memory cache) works automatically within the WebView. You just need to enable proper WebView caching settings.

## Required Flutter Configuration

### 1. Enable WebView Caching

Update your `InAppWebView` settings to enable caching:

```dart
InAppWebView(
  initialUrlRequest: URLRequest(
    url: Uri.parse('your-web-url'),
  ),
  initialSettings: InAppWebViewSettings(
    // Enable caching
    cacheEnabled: true,
    cacheMode: CacheMode.LOAD_DEFAULT,
    
    // Enable storage APIs (IndexedDB, localStorage)
    domStorageEnabled: true,
    databaseEnabled: true,
    
    // Set cache directory (optional, for more control)
    applicationCacheEnabled: true,
    
    // Enable hardware acceleration for better performance
    hardwareAcceleration: true,
    
    // Allow file access for cached resources
    allowFileAccess: true,
    allowFileAccessFromFileURLs: true,
    allowUniversalAccessFromFileURLs: true,
    
    // Performance optimizations
    useOnLoadResource: false,
    useOnDownloadStart: true,
    
    // Memory and performance
    disabledActionModeMenuItems: ActionModeMenuItem.MENU_ITEM_SHARE,
  ),
  
  onWebViewCreated: (controller) {
    // Store controller for later use
  },
  
  onLoadStop: (controller, url) async {
    // Optional: Inject cache status check
    print('Page loaded: $url');
  },
)
```

### 2. Cache Modes Explanation

Flutter WebView supports different cache modes:

- **`LOAD_DEFAULT`** (Recommended): Use cached resources when available and not expired
- **`LOAD_CACHE_ELSE_NETWORK`**: Prefer cache, even if expired
- **`LOAD_NO_CACHE`**: Don't use cache (forces fresh load)
- **`LOAD_CACHE_ONLY`**: Only use cached content (fail if not cached)

### 3. Optional: Clear Cache Function

Add this function to your Flutter app to allow users to clear the cache:

```dart
Future<void> clearWebViewCache() async {
  // Clear WebView cache
  await InAppWebViewCookieManager().deleteAllCookies();
  
  // Clear all data (cache, storage, etc.)
  if (webViewController != null) {
    await webViewController!.clearCache();
    
    // Also clear IndexedDB and localStorage if needed
    await webViewController!.evaluateJavascript(source: '''
      (async function() {
        // Clear localStorage
        localStorage.clear();
        
        // Clear IndexedDB
        const databases = await indexedDB.databases();
        for (const db of databases) {
          indexedDB.deleteDatabase(db.name);
        }
        
        console.log('All caches cleared');
      })();
    ''');
  }
  
  print('Cache cleared successfully');
}
```

### 4. Check Cache Status from Flutter

You can check if the web app is using cache:

```dart
Future<Map<String, dynamic>> getCacheStats() async {
  if (webViewController == null) return {};
  
  final result = await webViewController!.evaluateJavascript(source: '''
    (async function() {
      const { getCacheStats } = await import('./lib/api.js');
      return await getCacheStats();
    })();
  ''');
  
  return result as Map<String, dynamic>;
}
```

### 5. Preload Models (Optional)

You can trigger model preloading from Flutter:

```dart
Future<void> preloadModels() async {
  if (webViewController == null) return;
  
  await webViewController!.evaluateJavascript(source: '''
    (async function() {
      // Get all model URLs from the gallery
      const response = await fetch('https://threedmockupbackend.onrender.com/api/models?limit=10');
      const data = await response.json();
      const modelUrls = data.data.models.map(m => m.fileUrl);
      
      // Import and use the preloadModels function
      const { preloadModels } = await import('./lib/modelLoader.js');
      await preloadModels(modelUrls);
      
      console.log('Models preloaded');
    })();
  ''');
}
```

## How It Works

### Web Side (Already Implemented ✅)
1. **First Visit**: Downloads model → Stores in IndexedDB + memory cache
2. **Second Visit**: Checks cache → Loads from IndexedDB (instant!)
3. **API Calls**: Cached for 1 hour → Reduces server load

### Flutter Side (Just Configure ⚙️)
1. **WebView Cache**: Caches HTML, CSS, JS files
2. **Storage APIs**: Enabled for IndexedDB and localStorage
3. **Hardware Acceleration**: Faster rendering

## Benefits

✅ **Instant Loading**: Models load instantly on repeat visits
✅ **Offline Support**: Cached models work without internet
✅ **Reduced Data Usage**: No re-downloading of large model files
✅ **Better Performance**: Memory cache = Ultra-fast access
✅ **API Caching**: Fewer server requests = lower costs

## Cache Invalidation

The cache automatically invalidates when:
- Data is older than TTL (1 hour for API, 24 hours for models)
- Cache version changes
- User manually clears cache

## Testing

### Test Web Caching
1. Open the web app in browser
2. Open DevTools → Network tab
3. Load a model
4. Refresh the page
5. You should see "(from cache)" or instant load

### Test Flutter Caching
1. Run the Flutter app
2. Load a model (first time will download)
3. Close and reopen the app
4. Load the same model (should be instant)
5. Check logs for "Loading model from cache"

## Monitoring

Add cache monitoring to your Flutter app:

```dart
// In your main widget's initState
void initState() {
  super.initState();
  
  // Log cache status every 30 seconds
  Timer.periodic(Duration(seconds: 30), (timer) async {
    final stats = await getCacheStats();
    print('Cache Stats: $stats');
  });
}
```

## Troubleshooting

### Cache Not Working?
- Check `domStorageEnabled: true` is set
- Verify `databaseEnabled: true` is set
- Check browser console for errors
- Clear cache and try again

### Models Still Slow?
- Check network connection
- Verify model files are not too large
- Enable hardware acceleration
- Check device performance profile

## Summary

**For your Flutter app, you just need to:**
1. ✅ Set `cacheEnabled: true`
2. ✅ Set `domStorageEnabled: true`
3. ✅ Set `databaseEnabled: true`
4. ✅ Use `CacheMode.LOAD_DEFAULT`

**The web caching handles everything else automatically!** 🚀
