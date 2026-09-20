package com.smsgateway.app.gateway

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.smsgateway.app.BuildConfig
import com.smsgateway.app.MainActivity
import com.smsgateway.app.SmsGatewayApplication
import com.smsgateway.app.network.GatewayRegistrationRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class GatewayForegroundService : Service() {

    private val serviceScope =
        CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var connectionJob: Job? = null
    private var heartbeatJob: Job? = null
    private var socketClient: GatewaySocketClient? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int
    ): Int {
        if (intent?.action == ACTION_STOP) {
            stopGateway()
            return START_NOT_STICKY
        }

        startGateway()
        return START_STICKY
    }

    override fun onDestroy() {
        cleanupConnection()
        serviceScope.cancel()
        GatewayServiceState.setRunning(false)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startGateway() {
        showForegroundNotification()
        GatewayServiceState.setRunning(true)

        if (connectionJob?.isActive == true) {
            return
        }

        connectionJob = serviceScope.launch {
            try {
                val application =
                    application as SmsGatewayApplication

                GatewayServiceState.setConnection(
                    GatewayConnectionPhase.REGISTERING,
                    "Validando identidad del gateway…"
                )

                val settings =
                    application.gatewaySettingsStore.settings.first()

                val registrationRepository =
                    GatewayRegistrationRepository(
                        context = applicationContext,
                        settingsStore =
                            application.gatewaySettingsStore
                    )

                val registeredSettings =
                    registrationRepository.ensureRegistered(settings)

                GatewayServiceState.setConnection(
                    GatewayConnectionPhase.CONNECTING,
                    "Conectando con Socket.IO…"
                )

                val client = GatewaySocketClient(
                    settings = registeredSettings,
                    onConnected = {
                        GatewayServiceState.setConnection(
                            GatewayConnectionPhase.CONNECTING,
                            "Socket conectado · esperando backend"
                        )
                    },
                    onDisconnected = { reason ->
                        GatewayServiceState.setConnection(
                            GatewayConnectionPhase.RECONNECTING,
                            "Desconectado · reconectando ($reason)"
                        )
                    },
                    onServerReady = { version ->
                        GatewayServiceState.setConnection(
                            GatewayConnectionPhase.CONNECTED,
                            "Online · backend $version",
                            backendVersion = version
                        )
                    },
                    onError = { error ->
                        GatewayServiceState.setConnection(
                            GatewayConnectionPhase.ERROR,
                            "Error Socket.IO: $error"
                        )
                    }
                )

                socketClient = client
                client.connect()

                heartbeatJob?.cancel()
                heartbeatJob = launch {
                    while (isActive) {
                        delay(15_000)
                        client.heartbeat(BuildConfig.VERSION_NAME)
                        GatewayServiceState.markHeartbeat()
                    }
                }
            } catch (exception: Exception) {
                GatewayServiceState.setConnection(
                    GatewayConnectionPhase.ERROR,
                    exception.message
                        ?: "No se pudo iniciar el gateway"
                )
            }
        }
    }

    private fun stopGateway() {
        cleanupConnection()
        GatewayServiceState.setRunning(false)
        ServiceCompat.stopForeground(
            this,
            ServiceCompat.STOP_FOREGROUND_REMOVE
        )
        stopSelf()
    }

    private fun cleanupConnection() {
        heartbeatJob?.cancel()
        heartbeatJob = null

        connectionJob?.cancel()
        connectionJob = null

        socketClient?.disconnect()
        socketClient = null
    }

    private fun showForegroundNotification() {
        val openAppIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or
                PendingIntent.FLAG_IMMUTABLE
        )

        val notification =
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(
                    android.R.drawable.stat_notify_chat
                )
                .setContentTitle("SMS Gateway activo")
                .setContentText(
                    "Conectando con el backend"
                )
                .setContentIntent(openAppIntent)
                .setOngoing(true)
                .setSilent(true)
                .build()

        val foregroundType =
            if (
                Build.VERSION.SDK_INT >=
                Build.VERSION_CODES.UPSIDE_DOWN_CAKE
            ) {
                ServiceInfo
                    .FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
            } else {
                0
            }

        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            notification,
            foregroundType
        )
    }

    private fun createNotificationChannel() {
        if (
            Build.VERSION.SDK_INT <
            Build.VERSION_CODES.O
        ) {
            return
        }

        val channel = NotificationChannel(
            CHANNEL_ID,
            "SMS Gateway",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description =
                "Estado del servicio persistente del gateway SMS"
            setShowBadge(false)
        }

        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(channel)
    }

    companion object {
        private const val CHANNEL_ID =
            "sms_gateway_service"
        private const val NOTIFICATION_ID = 1001
        private const val ACTION_START =
            "com.smsgateway.app.gateway.START"
        private const val ACTION_STOP =
            "com.smsgateway.app.gateway.STOP"

        fun start(context: Context) {
            val intent = Intent(
                context,
                GatewayForegroundService::class.java
            ).setAction(ACTION_START)

            ContextCompat.startForegroundService(
                context,
                intent
            )
        }

        fun stop(context: Context) {
            val intent = Intent(
                context,
                GatewayForegroundService::class.java
            ).setAction(ACTION_STOP)

            context.startService(intent)
        }
    }
}
