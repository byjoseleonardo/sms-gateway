package com.smsgateway.app.gateway

import com.smsgateway.app.data.settings.GatewaySettings
import io.socket.client.IO
import io.socket.client.Socket
import java.net.URI
import org.json.JSONObject

class GatewaySocketClient(
    settings: GatewaySettings,
    private val onConnected: () -> Unit,
    private val onDisconnected: (String) -> Unit,
    private val onServerReady: (String) -> Unit,
    private val onError: (String) -> Unit
) {
    private val socket: Socket

    init {
        val token = requireNotNull(settings.authToken) {
            "El gateway no tiene token de autenticación"
        }

        val options = IO.Options.builder()
            .setReconnection(true)
            .setReconnectionAttempts(Int.MAX_VALUE)
            .setReconnectionDelay(1_000)
            .setReconnectionDelayMax(5_000)
            .setTimeout(10_000)
            .setAuth(
                mapOf(
                    "gatewayId" to settings.gatewayId,
                    "token" to token
                )
            )
            .build()

        socket = IO.socket(
            URI.create(settings.serverUrl),
            options
        )

        socket.on(Socket.EVENT_CONNECT) {
            onConnected()
        }

        socket.on(Socket.EVENT_DISCONNECT) { args ->
            onDisconnected(
                args.firstOrNull()?.toString()
                    ?: "disconnect"
            )
        }

        socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            onError(
                args.firstOrNull()?.toString()
                    ?: "Error de conexión Socket.IO"
            )
        }

        socket.on("gateway.serverReady") { args ->
            val payload = args.firstOrNull() as? JSONObject
            val version = payload?.optString("version")
                ?.takeIf(String::isNotBlank)
                ?: "desconocida"
            onServerReady(version)
        }
    }

    fun connect() {
        socket.connect()
    }

    fun heartbeat(appVersion: String) {
        if (!socket.connected()) return

        socket.emit(
            "gateway.heartbeat",
            JSONObject().apply {
                put("appVersion", appVersion)
            }
        )
    }

    fun disconnect() {
        socket.off()
        socket.disconnect()
        socket.close()
    }
}
