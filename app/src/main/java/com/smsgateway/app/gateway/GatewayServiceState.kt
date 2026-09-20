package com.smsgateway.app.gateway

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class GatewayConnectionPhase {
    STOPPED,
    REGISTERING,
    CONNECTING,
    CONNECTED,
    RECONNECTING,
    ERROR
}

data class GatewayConnectionSnapshot(
    val phase: GatewayConnectionPhase = GatewayConnectionPhase.STOPPED,
    val message: String = "Detenido",
    val backendVersion: String? = null,
    val lastHeartbeatAt: Long? = null
)

object GatewayServiceState {
    private val _running = MutableStateFlow(false)
    val running: StateFlow<Boolean> = _running.asStateFlow()

    private val _connection = MutableStateFlow(
        GatewayConnectionSnapshot()
    )
    val connection: StateFlow<GatewayConnectionSnapshot> =
        _connection.asStateFlow()

    internal fun setRunning(value: Boolean) {
        _running.value = value
        if (!value) {
            _connection.value = GatewayConnectionSnapshot()
        }
    }

    internal fun setConnection(
        phase: GatewayConnectionPhase,
        message: String,
        backendVersion: String? = _connection.value.backendVersion
    ) {
        _connection.value = _connection.value.copy(
            phase = phase,
            message = message,
            backendVersion = backendVersion
        )
    }

    internal fun markHeartbeat() {
        _connection.value = _connection.value.copy(
            lastHeartbeatAt = System.currentTimeMillis()
        )
    }
}
