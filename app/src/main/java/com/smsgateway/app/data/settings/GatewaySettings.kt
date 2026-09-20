package com.smsgateway.app.data.settings

data class GatewaySettings(
    val serverUrl: String = DEFAULT_SERVER_URL,
    val gatewayId: String = DEFAULT_GATEWAY_ID,
    val authToken: String? = null,
    val gatewayDesiredEnabled: Boolean = false
) {
    companion object {
        const val DEFAULT_SERVER_URL = "http://127.0.0.1:3000/"
        const val DEFAULT_GATEWAY_ID = "GW-A03-001"
    }
}

fun normalizeServerUrl(value: String): String {
    val trimmed = value.trim()
    require(trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        "La URL debe comenzar con http:// o https://"
    }
    return if (trimmed.endsWith("/")) trimmed else "$trimmed/"
}
