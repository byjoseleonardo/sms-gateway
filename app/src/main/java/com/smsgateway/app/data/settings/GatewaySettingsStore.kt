package com.smsgateway.app.data.settings

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.gatewaySettingsDataStore by preferencesDataStore(
    name = "gateway_settings"
)

class GatewaySettingsStore(
    private val context: Context
) {
    val settings: Flow<GatewaySettings> =
        context.gatewaySettingsDataStore.data.map { preferences ->
            GatewaySettings(
                serverUrl = preferences[SERVER_URL]
                    ?: GatewaySettings.DEFAULT_SERVER_URL,
                gatewayId = preferences[GATEWAY_ID]
                    ?: GatewaySettings.DEFAULT_GATEWAY_ID,
                authToken = preferences[AUTH_TOKEN],
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
                preferences.remove(AUTH_TOKEN)
            }
        }
    }

    suspend fun saveToken(token: String) {
        require(token.isNotBlank()) {
            "El token del gateway no puede estar vacío"
        }

        context.gatewaySettingsDataStore.edit { preferences ->
            preferences[AUTH_TOKEN] = token
        }
    }

    suspend fun clearToken() {
        context.gatewaySettingsDataStore.edit { preferences ->
            preferences.remove(AUTH_TOKEN)
        }
    }

    suspend fun setGatewayDesiredEnabled(enabled: Boolean) {
        context.gatewaySettingsDataStore.edit { preferences ->
            preferences[GATEWAY_DESIRED_ENABLED] = enabled
        }
    }

    private companion object {
        val SERVER_URL = stringPreferencesKey("server_url")
        val GATEWAY_ID = stringPreferencesKey("gateway_id")
        val AUTH_TOKEN = stringPreferencesKey("auth_token")
        val GATEWAY_DESIRED_ENABLED =
            booleanPreferencesKey("gateway_desired_enabled")
    }
}
