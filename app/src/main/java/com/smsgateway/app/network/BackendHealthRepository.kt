package com.smsgateway.app.network

import com.smsgateway.app.data.settings.GatewaySettings
import kotlin.system.measureTimeMillis

data class BackendHealthResult(
    val connected: Boolean,
    val message: String,
    val latencyMs: Long? = null
)

class BackendHealthRepository {
    suspend fun check(settings: GatewaySettings): BackendHealthResult {
        return try {
            lateinit var response: HealthResponse
            val elapsed = measureTimeMillis {
                response = GatewayApiFactory
                    .create(settings.serverUrl)
                    .health()
            }

            if (response.status.equals("ok", ignoreCase = true)) {
                BackendHealthResult(
                    connected = true,
                    message = "Conectado · backend ${response.version}",
                    latencyMs = elapsed
                )
            } else {
                BackendHealthResult(
                    connected = false,
                    message = "Backend respondió estado ${response.status}",
                    latencyMs = elapsed
                )
            }
        } catch (exception: Exception) {
            BackendHealthResult(
                connected = false,
                message = exception.message ?: "No se pudo conectar con el backend"
            )
        }
    }
}
