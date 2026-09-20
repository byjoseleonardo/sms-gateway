package com.smsgateway.app.network

import android.content.Context
import android.os.Build
import android.provider.Settings
import com.smsgateway.app.BuildConfig
import com.smsgateway.app.data.settings.GatewaySettings
import com.smsgateway.app.data.settings.GatewaySettingsStore
import retrofit2.HttpException

data class GatewayRegistrationRequest(
    val gatewayId: String,
    val deviceId: String,
    val deviceModel: String,
    val androidVersion: String,
    val appVersion: String
)

data class GatewayRegistrationResponse(
    val gatewayId: String,
    val token: String,
    val registeredAt: String
)

data class GatewayHeartbeatRequest(
    val appVersion: String
)

data class GatewayHeartbeatResponse(
    val status: String,
    val gatewayId: String,
    val lastSeenAt: String?
)

class GatewayRegistrationRepository(
    private val context: Context,
    private val settingsStore: GatewaySettingsStore
) {
    suspend fun ensureRegistered(
        settings: GatewaySettings
    ): GatewaySettings {
        val currentToken = settings.authToken

        if (!currentToken.isNullOrBlank()) {
            val valid = validateExistingToken(
                settings = settings,
                token = currentToken
            )

            if (valid) {
                return settings
            }

            settingsStore.clearToken()
        }

        return register(settings)
    }

    private suspend fun validateExistingToken(
        settings: GatewaySettings,
        token: String
    ): Boolean {
        return try {
            val response = GatewayApiFactory
                .create(settings.serverUrl)
                .heartbeat(
                    gatewayId = settings.gatewayId,
                    authorization = "Bearer $token",
                    body = GatewayHeartbeatRequest(
                        appVersion = BuildConfig.VERSION_NAME
                    )
                )

            when {
                response.isSuccessful -> true
                response.code() == 401 -> false
                else -> throw HttpException(response)
            }
        } catch (exception: HttpException) {
            if (exception.code() == 401) {
                false
            } else {
                throw exception
            }
        }
    }

    private suspend fun register(
        settings: GatewaySettings
    ): GatewaySettings {
        val deviceId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID
        ) ?: "unknown-device"

        val enrollmentKey = settings.enrollmentKey
            ?.takeIf(String::isNotBlank)
            ?: error("Configura la clave de enrolamiento antes de registrar el gateway")

        val response = GatewayApiFactory
            .create(settings.serverUrl)
            .register(
                enrollmentKey = enrollmentKey,
                body = GatewayRegistrationRequest(
                    gatewayId = settings.gatewayId,
                    deviceId = deviceId,
                    deviceModel = Build.MODEL,
                    androidVersion = Build.VERSION.RELEASE,
                    appVersion = BuildConfig.VERSION_NAME
                )
            )

        settingsStore.saveToken(response.token)
        settingsStore.clearEnrollmentKey()

        return settings.copy(
            authToken = response.token,
            enrollmentKey = null
        )
    }
}
