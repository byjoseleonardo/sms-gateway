# Android release signing

La variante `release` de SMS Gateway se firma con una clave privada propia del proyecto.

## Identidad de firma

- Keystore local: `signing/sms-gateway-release.jks`
- Alias: `sms-gateway-release`
- Certificado SHA-256: `3732949f2e22cee39a87c8ce89201077f69f9fc803d6a0e42eb6b8326ab5e306`
- DN: `CN=SMS Gateway, OU=Mobile, O=SMS Gateway, L=Huanuco, ST=Huanuco, C=PE`
- Validez configurada: 10 000 días desde su creación

Las contraseñas se guardan únicamente en `keystore.properties`. Tanto el archivo de propiedades como el keystore están excluidos de Git.

> Conserva una copia de seguridad segura de `signing/sms-gateway-release.jks` y `keystore.properties`. Para distribuir actualizaciones directas del mismo paquete Android se necesita conservar la misma clave de firma.

## Generar una versión firmada

Desde la raíz del proyecto:

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat assembleRelease bundleRelease
```

Android Studio utiliza la misma configuración Gradle, por lo que la variante Release queda firmada también al compilarla desde el IDE.

## Salidas

Gradle genera:

- APK: `app/build/outputs/apk/release/app-release.apk`
- Android App Bundle: `app/build/outputs/bundle/release/app-release.aab`

También se copian manualmente las entregas preparadas a `release/`, una carpeta local excluida de Git.

## Versión validada

Release `0.18.0` / `versionCode 18`.

La APK fue verificada con `apksigner` y usa APK Signature Scheme v2. El AAB fue verificado con `jarsigner`.
