package com.smsgateway.app.data.settings

import android.content.Context
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
                    ?: GatewaySettings.DEFAULT_GATEWAY_ID
            )
        }

    suspend fun save(serverUrl: String, gatewayId: String) {
        val normalizedUrl = normalizeServerUrl(serverUrl)
        val normalizedGatewayId = gatewayId.trim()
        require(normalizedGatewayId.isNotBlank()) {
            "El identificador del gateway no puede estar vacío"
        }

        context.gatewaySettingsDataStore.edit { preferences ->
            preferences[SERVER_URL] = normalizedUrl
            preferences[GATEWAY_ID] = normalizedGatewayId
        }
    }

    private companion object {
        val SERVER_URL = stringPreferencesKey("server_url")
        val GATEWAY_ID = stringPreferencesKey("gateway_id")
    }
}
