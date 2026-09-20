package com.smsgateway.app.network

import com.smsgateway.app.data.settings.GatewaySettingsStore
import kotlinx.coroutines.flow.first
import retrofit2.HttpException

data class RemoteSmsJob(
    val id: String,
    val destination: String,
    val message: String,
    val status: String,
    val attempts: Int
)

enum class RemoteSmsStatus {
    SENT,
    DELIVERED,
    FAILED,
    AMBIGUOUS
}

class RemoteSmsJobRepository(
    private val settingsStore: GatewaySettingsStore
) {
    suspend fun available(): List<AvailableRemoteSmsJob> {
        val settings = settingsStore.settings.first()
        val token = requireNotNull(settings.authToken) {
            "El gateway no tiene token de autenticación"
        }

        val response = GatewayApiFactory
            .create(settings.serverUrl)
            .availableJobs(
                gatewayId = settings.gatewayId,
                authorization = "Bearer $token"
            )

        if (!response.isSuccessful) {
            throw HttpException(response)
        }

        return response.body()?.jobs.orEmpty()
    }

    suspend fun getStatus(jobId: String): RemoteSmsStateResponse {
        val settings = settingsStore.settings.first()
        val token = requireNotNull(settings.authToken) {
            "El gateway no tiene token de autenticación"
        }

        val response = GatewayApiFactory
            .create(settings.serverUrl)
            .jobStatus(
                jobId = jobId,
                gatewayId = settings.gatewayId,
                authorization = "Bearer $token"
            )

        if (!response.isSuccessful) {
            throw HttpException(response)
        }

        return requireNotNull(response.body()) {
            "El backend devolvió un estado remoto vacío"
        }
    }

    suspend fun claim(jobId: String): RemoteSmsJob {
        val settings = settingsStore.settings.first()
        val token = requireNotNull(settings.authToken) {
            "El gateway no tiene token de autenticación"
        }

        val response = GatewayApiFactory
            .create(settings.serverUrl)
            .claimJob(
                jobId = jobId,
                gatewayId = settings.gatewayId,
                authorization = "Bearer $token"
            )

        if (!response.isSuccessful) {
            throw HttpException(response)
        }

        return requireNotNull(response.body()) {
            "El backend devolvió un claim vacío"
        }
    }

    suspend fun reportStatus(
        jobId: String,
        status: RemoteSmsStatus,
        error: String? = null
    ) {
        if (!jobId.startsWith(REMOTE_JOB_PREFIX)) return

        val settings = settingsStore.settings.first()
        val token = settings.authToken ?: return

        val response = GatewayApiFactory
            .create(settings.serverUrl)
            .updateJobStatus(
                jobId = jobId,
                gatewayId = settings.gatewayId,
                authorization = "Bearer $token",
                body = RemoteSmsStatusRequest(
                    status = status.name,
                    error = error
                )
            )

        if (!response.isSuccessful && response.code() != 404) {
            throw HttpException(response)
        }
    }

    companion object {
        const val REMOTE_JOB_PREFIX = "sms_"
    }
}
