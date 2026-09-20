package com.smsgateway.app.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class GatewayTokenCipher {
    fun encrypt(plaintext: String): String {
        require(plaintext.isNotBlank()) {
            "El token no puede estar vacío"
        }

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.ENCRYPT_MODE,
            getOrCreateKey()
        )

        val ciphertext =
            cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))

        val iv =
            Base64.encodeToString(
                cipher.iv,
                Base64.NO_WRAP or Base64.NO_PADDING
            )
        val payload =
            Base64.encodeToString(
                ciphertext,
                Base64.NO_WRAP or Base64.NO_PADDING
            )

        return "$iv.$payload"
    }

    fun decrypt(encrypted: String): String {
        val parts = encrypted.split('.', limit = 2)
        require(parts.size == 2) {
            "Formato de credencial cifrada inválido"
        }

        val iv = Base64.decode(
            parts[0],
            Base64.NO_WRAP or Base64.NO_PADDING
        )
        val ciphertext = Base64.decode(
            parts[1],
            Base64.NO_WRAP or Base64.NO_PADDING
        )

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateKey(),
            GCMParameterSpec(TAG_LENGTH_BITS, iv)
        )

        return cipher
            .doFinal(ciphertext)
            .toString(Charsets.UTF_8)
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore
            .getInstance(ANDROID_KEYSTORE)
            .apply {
                load(null)
            }

        val existing =
            keyStore.getKey(KEY_ALIAS, null) as? SecretKey

        if (existing != null) {
            return existing
        }

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE
        )

        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or
                    KeyProperties.PURPOSE_DECRYPT
            )
                .setKeySize(256)
                .setBlockModes(
                    KeyProperties.BLOCK_MODE_GCM
                )
                .setEncryptionPaddings(
                    KeyProperties.ENCRYPTION_PADDING_NONE
                )
                .build()
        )

        return keyGenerator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS =
            "sms_gateway_device_token_v1"
        const val TRANSFORMATION =
            "AES/GCM/NoPadding"
        const val TAG_LENGTH_BITS = 128
    }
}
