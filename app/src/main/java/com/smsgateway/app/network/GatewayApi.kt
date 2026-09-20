package com.smsgateway.app.network

import com.smsgateway.app.data.settings.normalizeServerUrl
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

data class HealthResponse(
    val status: String,
    val service: String,
    val version: String,
    val timestamp: String
)

data class GatewayStatusResponse(
    val gatewayId: String,
    val enabled: Boolean,
    val online: Boolean,
    val lastSeenAt: String?,
    val deviceModel: String,
    val androidVersion: String,
    val appVersion: String
)

data class RemoteSmsStatusRequest(
    val status: String,
    val error: String? = null
)

data class RemoteSmsStatusResponse(
    val status: String
)

data class AvailableRemoteSmsJob(
    val id: String,
    val status: String
)

data class AvailableRemoteSmsJobsResponse(
    val jobs: List<AvailableRemoteSmsJob>
)

interface GatewayApi {
    @GET("health")
    suspend fun health(): HealthResponse

    @POST("api/v1/gateways/register")
    suspend fun register(
        @Body body: GatewayRegistrationRequest
    ): GatewayRegistrationResponse

    @POST("api/v1/gateways/heartbeat")
    suspend fun heartbeat(
        @Header("x-gateway-id") gatewayId: String,
        @Header("Authorization") authorization: String,
        @Body body: GatewayHeartbeatRequest
    ): Response<GatewayHeartbeatResponse>

    @GET("api/v1/gateways/{gatewayId}/status")
    suspend fun status(
        @Path("gatewayId") gatewayId: String,
        @Header("x-gateway-id") authenticatedGatewayId: String,
        @Header("Authorization") authorization: String
    ): Response<GatewayStatusResponse>

    @GET("api/v1/gateway/jobs/available")
    suspend fun availableJobs(
        @Header("x-gateway-id") gatewayId: String,
        @Header("Authorization") authorization: String
    ): Response<AvailableRemoteSmsJobsResponse>

    @POST("api/v1/gateway/jobs/{jobId}/claim")
    suspend fun claimJob(
        @Path("jobId") jobId: String,
        @Header("x-gateway-id") gatewayId: String,
        @Header("Authorization") authorization: String
    ): Response<RemoteSmsJob>

    @POST("api/v1/gateway/jobs/{jobId}/status")
    suspend fun updateJobStatus(
        @Path("jobId") jobId: String,
        @Header("x-gateway-id") gatewayId: String,
        @Header("Authorization") authorization: String,
        @Body body: RemoteSmsStatusRequest
    ): Response<RemoteSmsStatusResponse>
}

object GatewayApiFactory {
    fun create(serverUrl: String): GatewayApi {
        val client = OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(5, TimeUnit.SECONDS)
            .writeTimeout(5, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(normalizeServerUrl(serverUrl))
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(GatewayApi::class.java)
    }
}
