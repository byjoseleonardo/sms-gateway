package com.smsgateway.app.network

import com.smsgateway.app.data.settings.normalizeServerUrl
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET

data class HealthResponse(
    val status: String,
    val service: String,
    val version: String,
    val timestamp: String
)

interface GatewayApi {
    @GET("health")
    suspend fun health(): HealthResponse
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
