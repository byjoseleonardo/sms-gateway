package com.smsgateway.app.data.settings

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.smsgateway.app.security.GatewayTokenCipher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.gatewaySettingsDataStore by preferencesDataStore(
    name = "gateway_settings"
)

class GatewaySettingsStore(
    private val context: Context,
    private val tokenCipher: GatewayTokenCipher =
        GatewayTokenCipher()
) {
    val settings: Flow<GatewaySettings> =
        context.gatewaySettingsDataStore.data.map { preferences ->
            val encryptedToken =
                preferences[AUTH_TOKEN_ENCRYPTED]

            val token = when {
                !encryptedToken.isNullOrBlank() ->
                    runCatching {
                        tokenCipher.decrypt(encryptedToken)
                    }.getOrNull()

                else ->
                    preferences[AUTH_TOKEN_LEGACY]
            }

            GatewaySettings(
                serverUrl = preferences[SERVER_URL]
                    ?: GatewaySettings.DEFAULT_SERVER_URL,
                gatewayId = preferences[GATEWAY_ID]
                    ?: GatewaySettings.DEFAULT_GATEWAY_ID,
                authToken = token,
                gatewayDesiredEnabled =
                    preferences[GATEWAY_DESIRED_ENABLED] ?: false
            )
        }

    suspend fun save(serverUrl: String, gatewayId: String) {
        val normalizedUrl = normalizeServerUrl(serverUrl)
        val normalizedGatewayId = gatewayId.trim()
        require(normalizedGatewayId.isNotBlank()) {
            "El identificador del gateway no puede estar vacío"
        }

        context.gatewaySettingsDataStore.edit { preferences ->
            val serverChanged =
                preferences[SERVER_URL] != null &&
                preferences[SERVER_URL] != normalizedUrl
            val gatewayChanged =
                preferences[GATEWAY_ID] != null &&
                preferences[GATEWAY_ID] != normalizedGatewayId

            preferences[SERVER_URL] = normalizedUrl
            preferences[GATEWAY_ID] = normalizedGatewayId

            if (serverChanged || gatewayChanged) {
                preferences.remove(AUTH_TOKEN_ENCRYPTED)
                preferences.remove(AUTH_TOKEN_LEGACY)
            }
        }
    }

    suspend fun saveToken(token: String) {
        require(token.isNotBlank()) {
            "El token del gateway no puede estar vacío"
        }

        val encrypted = tokenCipher.encrypt(token)

        context.gatewaySettingsDataStore.edit { preferences ->
            preferences[AUTH_TOKEN_ENCRYPTED] = encrypted
            preferences.remove(AUTH_TOKEN_LEGACY)
        }
    }

    suspend fun clearToken() {
        context.gatewaySettingsDataStore.edit { preferences ->
            preferences.remove(AUTH_TOKEN_ENCRYPTED)
            preferences.remove(AUTH_TOKEN_LEGACY)
        }
    }

    suspend fun migrateLegacyTokenIfNeeded(): Boolean {
        val snapshot =
            context.gatewaySettingsDataStore.data.first()

        val legacyToken =
            snapshot[AUTH_TOKEN_LEGACY]
                ?.takeIf(String::isNotBlank)
                ?: return false

        if (
            !snapshot[AUTH_TOKEN_ENCRYPTED]
                .isNullOrBlank()
        ) {
            return false
        }

        val encrypted =
            tokenCipher.encrypt(legacyToken)

        var migrated = false

        context.gatewaySettingsDataStore.edit { preferences ->
            if (
                preferences[AUTH_TOKEN_LEGACY] == legacyToken &&
                preferences[AUTH_TOKEN_ENCRYPTED].isNullOrBlank()
            ) {
                preferences[AUTH_TOKEN_ENCRYPTED] = encrypted
                preferences.remove(AUTH_TOKEN_LEGACY)
                migrated = true
            }
        }

        return migrated
    }

    suspend fun setGatewayDesiredEnabled(enabled: Boolean) {
        context.gatewaySettingsDataStore.edit { preferences ->
            preferences[GATEWAY_DESIRED_ENABLED] = enabled
        }
    }

    private companion object {
        val SERVER_URL = stringPreferencesKey("server_url")
        val GATEWAY_ID = stringPreferencesKey("gateway_id")
        val AUTH_TOKEN_LEGACY = stringPreferencesKey("auth_token")
        val AUTH_TOKEN_ENCRYPTED =
            stringPreferencesKey("auth_token_encrypted")
        val GATEWAY_DESIRED_ENABLED =
            booleanPreferencesKey("gateway_desired_enabled")
    }
}
