# Android Release Keystore

## Generate a release keystore

Run this once and store the file securely (password manager, CI secrets, etc.):

```bash
keytool -genkeypair \
  -v \
  -storetype PKCS12 \
  -keystore boardsight-release.jks \
  -alias boardsight \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

## Configure signing

Create `android/gradle.properties` (not committed) or set CI environment variables:

```
BOARDSIGHT_KEYSTORE_PATH=../keystore/boardsight-release.jks
BOARDSIGHT_KEYSTORE_PASSWORD=your-password
BOARDSIGHT_KEY_ALIAS=boardsight
BOARDSIGHT_KEY_PASSWORD=your-key-password
```

Then update `android/app/build.gradle` release signingConfig:

```groovy
release {
    storeFile file(BOARDSIGHT_KEYSTORE_PATH)
    storePassword BOARDSIGHT_KEYSTORE_PASSWORD
    keyAlias BOARDSIGHT_KEY_ALIAS
    keyPassword BOARDSIGHT_KEY_PASSWORD
}
```

## Debug builds

Debug builds use the committed `android/app/debug.keystore` — no setup needed.
