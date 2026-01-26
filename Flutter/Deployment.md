# Flutter App Deployment Guide

This guide covers the steps to prepare and deploy a Flutter application to the Google Play Store (Android) and Apple App Store (iOS).

## Prerequisites

1.  **Developer Accounts**:
    *   **Google Play Console**: One-time $25 fee.
    *   **Apple Developer Program**: Annual $99 fee.
2.  **Flutter SDK**: Ensure you are using a stable version of Flutter (`flutter channel stable`).
3.  **App Icons**: Generate launcher icons for all sizes.
    *   *Recommendation*: Use the [flutter_launcher_icons](https://pub.dev/packages/flutter_launcher_icons) package.
    *   Run: `dart run flutter_launcher_icons`

---

## Part 1: iOS Deployment (App Store)

*Requires a Mac with Xcode installed.*

### 1. Preparation
1.  **Update Version**: Open `pubspec.yaml` and update the version:
    ```yaml
    version: 1.0.0+1  # versionName + versionCode
    ```
2.  **Xcode Configuration**:
    *   Open `ios/Runner.xcworkspace` in Xcode.
    *   Select the **Runner** project in project navigator.
    *   **General Tab**:
        *   **Identity**: Check *Display Name* and *Bundle Identifier* (must match App Store Connect).
        *   **Version / Build**: Should match `pubspec.yaml` (automatically handled by Flutter usually, but verify).
    *   **Signing & Capabilities**:
        *   Ensure **Automatically manage signing** is checked.
        *   Select your **Team**.

### 2. Register App ID (One-time)
1.  Go to [Apple Developer Portal](https://developer.apple.com/).
2.  Certificates, Identifiers & Profiles -> Identifiers.
3.  Create an App ID matching your Bundle Identifier (e.g., `com.example.myapp`).

### 3. Create App Record (One-time)
1.  Go to [App Store Connect](https://appstoreconnect.apple.com/).
2.  My Apps -> "+" -> New App.
3.  Select the Bundle ID you created.

### 4. Build and Archive
1.  Run the build command:
    ```bash
    flutter build ipa
    ```
    *   *This creates an Xcode archive (.xcarchive).*
    *   *Output*: `build/ios/archive/Runner.xcarchive`
2.  **Validate & Upload**:
    *   **Option A (Command Line - Validation only)**: The command above just builds. To upload, you usually open Xcode.
    *   **Option B (Xcode)**:
        1.  Open `ios/Runner.xcworkspace`.
        2.  Menu: **Product > Archive**.
        3.  Once finished, the organizer window opens.
        4.  Click **Distribute App**.
        5.  Select **App Store Connect** -> **Upload** -> Next -> Next -> Upload.
    *   **Option C (Transporter App)**:
        1.  Export the `.ipa` from the Archive.
        2.  Open Transporter app (from Mac App Store).
        3.  Drag and drop the `.ipa` file and click Deliver.

### 5. Submit for Review
1.  Wait for processing (usually 10-30 mins). You'll get an email.
2.  Go to App Store Connect -> TestFlight (to test) or App Store (to submit).
3.  Select the build, fill in metadata (screenshots, description), and **Submit for Review**.

---

## Part 2: Android Deployment (Google Play Store)

### 1. Preparation
1.  **Update Version**: Open `pubspec.yaml` and update the version:
    ```yaml
    version: 1.0.0+1  # versionName + versionCode
    ```
2.  **App Manifest**: Check `android/app/src/main/AndroidManifest.xml` for permissions, label, and icon.

### 2. Signing the App
1.  **Create a Keystore** (if you haven't already):
    ```bash
    keytool -genkey -v -keystore ~/upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
    ```
    *   *Store this file safely!* If you lose it, you cannot update your app.
2.  **Configure Gradle**:
    *   Create a file `android/key.properties`:
        ```properties
        storePassword=<password>
        keyPassword=<password>
        keyAlias=upload
        storeFile=/Users/<username>/upload-keystore.jks
        ```
    *   Update `android/app/build.gradle`:
        ```gradle
        android {
            ...
            signingConfigs {
                release {
                    keyAlias 'upload'
                    keyPassword '...' // Best practice: read from key.properties
                    storeFile file('/path/to/keystore')
                    storePassword '...'
                }
            }
            buildTypes {
                release {
                    signingConfig signingConfigs.release
                    ...
                }
            }
        }
        ```

### 3. Build Release Bundle
Google Play requires an `.aab` (Android App Bundle) file.

```bash
flutter build appbundle
```

*   **Output**: `build/app/outputs/bundle/release/app-release.aab`

### 4. Upload to Play Console
1.  Go to [Google Play Console](https://play.google.com/console).
2.  Create App or select existing app.
3.  Go to **Testing > Internal testing** (for first test) or **Production**.
4.  Create new release -> Upload the `.aab` file.
5.  Fill in release notes and save.

---

## Troubleshooting

*   **CocoaPods errors**: Run `cd ios && pod install --repo-update`.
*   **Keystore errors**: Verify the path in `key.properties` is absolute or correctly relative.
*   **Version conflict**: Ensure `versionCode` (Android) and `Build` number (iOS) are incremented for every upload.
