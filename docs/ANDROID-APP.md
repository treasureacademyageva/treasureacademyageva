# Turning the site into an Android app

Notes for the Kotlin/Gradle build. Nothing here is built yet — this records what
the website already provides and which route to take.

## The short version

Do **not** rewrite the school site as native screens. Ship the existing site as
an installed app using **Trusted Web Activity (TWA)**, which is the supported
Google path for exactly this. You get one codebase, and every content change the
school makes on the website shows up in the app with no Play Store release.

## Why TWA and not a WebView

A plain `WebView` app shows a browser-in-a-box: no address bar but also no
service worker guarantees, worse performance, and Google may reject it as a
"webview wrapper". A TWA runs the real Chrome engine full screen with no browser
UI, shares the browser's storage and service worker, and counts as a proper app.

Requirement: the site must pass PWA installability. It already does —

| Requirement | Status |
|---|---|
| Served over HTTPS | yes, on Vercel |
| `site.webmanifest` with name, `start_url`, `display: standalone` | yes |
| 192px and 512px icons | `assets/img/icon-192.png`, `icon-512.png` |
| Maskable icon (Android circle/squircle mask) | `assets/img/icon-maskable-512.png` |
| Registered service worker with an offline fallback | `sw.js`, cache `treasure-v50` |
| `theme_color` for the system bars | `#0B7A37` |

## Build shape

Android Studio, `minSdk 21`, Kotlin. The whole app is Gradle configuration plus
one dependency — there is no Activity to write, because `LauncherActivity` comes
from the library.

`app/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application")
    kotlin("android")
}

android {
    namespace = "ng.ageva.treasureacademy"
    compileSdk = 35

    defaultConfig {
        applicationId = "ng.ageva.treasureacademy"
        minSdk = 21
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}
```

`AndroidManifest.xml` — the launcher activity is provided by the library:

```xml
<activity
    android:name="com.google.androidbrowserhelper.trusted.LauncherActivity"
    android:exported="true">

    <meta-data
        android:name="android.support.customtabs.trusted.DEFAULT_URL"
        android:value="https://www.treasureacademyageva.com/" />

    <meta-data
        android:name="android.support.customtabs.trusted.STATUS_BAR_COLOR"
        android:resource="@color/colorPrimary" />

    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>

    <!-- Makes links to the site open in the app instead of the browser. -->
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https"
              android:host="www.treasureacademyageva.com" />
    </intent-filter>
</activity>
```

Set `colorPrimary` to `#0B7A37` so the status bar matches the site header.

## Digital Asset Links — the step that catches people out

Without this the app opens with a browser address bar visible. The site must
serve a file at:

```
https<no>://www.treasureacademyageva.com/.well-known/assetlinks.json
```

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "ng.ageva.treasureacademy",
    "sha256_cert_fingerprints": ["<SHA-256 of the release signing key>"]
  }
}]
```

Get the fingerprint from the upload key:

```bash
keytool -list -v -keystore upload-keystore.jks -alias upload
```

If you use Play App Signing, take the fingerprint from the Play Console
(Setup → App integrity), not from the local keystore — they differ, and using
the wrong one is the usual reason the address bar refuses to disappear.

Two gotchas with this repo's setup:

1. `vercel.json` has `"cleanUrls": true`. Confirm `/.well-known/assetlinks.json`
   still serves with its exact path and `Content-Type: application/json`.
2. Folders beginning with a dot are easy to lose. Check it is committed and
   actually reachable in production before building the release APK.

## Icons

Reuse what is already in `assets/img/`: `icon-512.png` for the standard icon and
`icon-maskable-512.png` for the adaptive icon foreground. The maskable one is
already full-bleed green with the crest inside the safe zone, so Android's
circle and squircle masks will not clip it.

## Offline

`sw.js` caches the core pages, CSS, JS, the self-hosted fonts and the logo, and
falls back to a cached page when the network drops. That behaviour carries into
the TWA automatically. Worth testing in airplane mode before release — parents
in Okene will not always have a signal.

## Before the first release

- Decide the real domain. Shipping against the `.vercel.app` URL means the
  asset-links fingerprint has to be redone when the school buys a domain.
- Bump `versionCode` on every upload; Play rejects duplicates.
- Screenshots and a feature graphic are required by the Play listing.
- The portal writes to `localStorage`. In a TWA that storage is shared with
  Chrome, so a parent already logged in on the web stays logged in. Confirm that
  is wanted before release.
