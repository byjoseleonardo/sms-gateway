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
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.smsgateway.app.BuildConfig
import com.smsgateway.app.MainActivity
import com.smsgateway.app.SmsGatewayApplication
import com.smsgateway.app.domain.SmsDispatchResult
import com.smsgateway.app.domain.SmsJobRequest
import com.smsgateway.app.domain.SmsJobStatus
import com.smsgateway.app.network.GatewayRegistrationRepository
import com.smsgateway.app.network.RemoteSmsJobRepository
import com.smsgateway.app.network.RemoteSmsStatus
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.time.Instant

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
            val application =
                application as SmsGatewayApplication

            application.gatewaySettingsStore
                .setGatewayDesiredEnabled(true)

            var retryDelayMs = INITIAL_RETRY_DELAY_MS

            while (isActive) {
                try {
                    bootstrapConnection(application)
                    cleanupSocketConnection()
                    retryDelayMs = INITIAL_RETRY_DELAY_MS

                    GatewayServiceState.setConnection(
                        GatewayConnectionPhase.RECONNECTING,
                        "Credencial actualizada · reconectando"
                    )
                } catch (exception: CancellationException) {
                    throw exception
                } catch (exception: Exception) {
                    cleanupSocketConnection()

                    val detail =
                        exception.message
                            ?.takeIf(String::isNotBlank)
                            ?: exception.javaClass.simpleName

                    GatewayServiceState.setConnection(
                        GatewayConnectionPhase.RECONNECTING,
                        "Sin conexión · reintento en " +
                            "${retryDelayMs / 1_000}s · ${detail}"
                    )

                    Log.w(
                        TAG,
                        "Gateway bootstrap failed; retrying in " +
                            "${retryDelayMs}ms",
                        exception
                    )

                    delay(retryDelayMs)
                    retryDelayMs =
                        (retryDelayMs * 2)
                            .coerceAtMost(MAX_RETRY_DELAY_MS)
                }
            }
        }
    }

    private suspend fun bootstrapConnection(
        application: SmsGatewayApplication
    ) {
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

        reconcilePendingJobs(application)

        GatewayServiceState.setConnection(
            GatewayConnectionPhase.CONNECTING,
            "Conectando con Socket.IO…"
        )

        val tokenRotationCompleted =
            CompletableDeferred<Unit>()

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
                    "Desconectado · reconectando (${reason})"
                )
            },
            onServerReady = { version ->
                GatewayServiceState.setConnection(
                    GatewayConnectionPhase.CONNECTED,
                    "Online · backend ${version}",
                    backendVersion = version
                )
            },
            onSmsAvailable = { jobId ->
                serviceScope.launch {
                    processRemoteJob(jobId)
                }
            },
            onTokenRotationRequested = { token, expiresAt ->
                serviceScope.launch {
                    try {
                        val expired =
                            expiresAt
                                ?.let(::parseRemoteTimestamp)
                                ?.let { it <= System.currentTimeMillis() }
                                ?: false

                        if (expired) {
                            Log.w(
                                TAG,
                                "Ignoring expired gateway token rotation"
                            )
                            return@launch
                        }

                        application.gatewaySettingsStore
                            .saveToken(token)

                        Log.i(
                            TAG,
                            "Gateway credential rotation stored securely"
                        )

                        tokenRotationCompleted.complete(Unit)
                    } catch (exception: Exception) {
                        Log.e(
                            TAG,
                            "Gateway credential rotation could not be stored",
                            exception
                        )
                    }
                }
            },
            onError = { error ->
                GatewayServiceState.setConnection(
                    GatewayConnectionPhase.RECONNECTING,
                    "Socket.IO · reconectando: ${error}"
                )
            }
        )

        socketClient = client
        client.connect()

        heartbeatJob?.cancel()
        heartbeatJob = serviceScope.launch {
            while (isActive) {
                delay(15_000)
                client.heartbeat(
                    BuildConfig.VERSION_NAME
                ) {
                    GatewayServiceState.markHeartbeat()
                }
            }
        }

        tokenRotationCompleted.await()
    }

    private suspend fun processRemoteJob(jobId: String) {
        val application =
            application as SmsGatewayApplication

        try {
            val remoteJob =
                application.remoteSmsJobRepository.claim(jobId)

            when (
                val dispatch =
                    application.sendSmsUseCase.execute(
                        SmsJobRequest(
                            id = remoteJob.id,
                            destination = remoteJob.destination,
                            message = remoteJob.message
                        )
                    )
            ) {
                is SmsDispatchResult.Accepted -> {
                    Log.i(
                        TAG,
                        "Remote SMS accepted: ${dispatch.jobId}"
                    )
                }

                is SmsDispatchResult.Duplicate -> {
                    Log.i(
                        TAG,
                        "Remote SMS already exists locally: ${dispatch.jobId}"
                    )

                    val localJob =
                        application.smsJobStore.get(dispatch.jobId)

                    if (
                        localJob?.status == SmsJobStatus.SENDING ||
                        localJob?.status ==
                            SmsJobStatus.RECONCILIATION_REQUIRED
                    ) {
                        val reason =
                            "Job remoto reclamado pero el resultado local es incierto"

                        application.smsJobStore
                            .markReconciliationRequired(
                                dispatch.jobId,
                                reason
                            )

                        application.remoteSmsJobRepository
                            .reportStatus(
                                jobId = dispatch.jobId,
                                status = RemoteSmsStatus.AMBIGUOUS,
                                error = reason
                            )
                    }
                }

                is SmsDispatchResult.Failed -> {
                    application.remoteSmsJobRepository.reportStatus(
                        jobId = dispatch.jobId,
                        status = RemoteSmsStatus.FAILED,
                        error = dispatch.reason
                    )
                }
            }
        } catch (exception: HttpException) {
            if (
                exception.code() != 404 &&
                exception.code() != 409
            ) {
                Log.e(
                    TAG,
                    "Remote SMS claim failed with HTTP ${exception.code()}",
                    exception
                )
            }
        } catch (exception: Exception) {
            Log.e(
                TAG,
                "Remote SMS processing failed for ${jobId}",
                exception
            )
        }
    }

    private suspend fun reconcilePendingJobs(
        application: SmsGatewayApplication
    ) {
        val candidates =
            application.smsJobStore.getReconciliationCandidates()

        for (job in candidates) {
            if (
                !job.id.startsWith(
                    RemoteSmsJobRepository.REMOTE_JOB_PREFIX
                )
            ) {
                continue
            }

            try {
                val remote =
                    application.remoteSmsJobRepository.getStatus(job.id)

                when (remote.status) {
                    "SENT" -> {
                        val sentAt =
                            parseRemoteTimestamp(remote.sentAt)
                                ?: System.currentTimeMillis()

                        application.smsJobStore.markSent(
                            job.id,
                            sentAt
                        )
                    }

                    "DELIVERED" -> {
                        parseRemoteTimestamp(remote.sentAt)?.let {
                            application.smsJobStore.markSent(
                                job.id,
                                it
                            )
                        }

                        val deliveredAt =
                            parseRemoteTimestamp(remote.deliveredAt)
                                ?: System.currentTimeMillis()

                        application.smsJobStore.markDelivered(
                            job.id,
                            deliveredAt
                        )
                    }

                    "FAILED" -> {
                        application.smsJobStore.markFailed(
                            job.id,
                            remote.lastError
                                ?: "El backend reportó FAILED"
                        )
                    }

                    "CLAIMED" -> {
                        val reason =
                            "Proceso reiniciado después de reclamar el job; resultado del envío desconocido"

                        application.smsJobStore
                            .markReconciliationRequired(
                                job.id,
                                reason
                            )

                        application.remoteSmsJobRepository
                            .reportStatus(
                                jobId = job.id,
                                status = RemoteSmsStatus.AMBIGUOUS,
                                error = reason
                            )
                    }

                    "AMBIGUOUS" -> {
                        application.smsJobStore
                            .markReconciliationRequired(
                                job.id,
                                remote.lastError
                                    ?: "Backend mantiene el job como ambiguo"
                            )
                    }

                    "QUEUED" -> {
                        application.smsJobStore
                            .markReconciliationRequired(
                                job.id,
                                "El job local estaba enviándose pero el backend sigue en QUEUED"
                            )
                    }
                }
            } catch (exception: HttpException) {
                Log.w(
                    TAG,
                    "No se pudo reconciliar ${job.id}: HTTP ${exception.code()}",
                    exception
                )
            } catch (exception: Exception) {
                Log.w(
                    TAG,
                    "No se pudo reconciliar ${job.id}",
                    exception
                )
            }
        }
    }

    private fun parseRemoteTimestamp(value: String?): Long? =
        value?.let {
            runCatching {
                Instant.parse(it).toEpochMilli()
            }.getOrNull()
        }

    private fun stopGateway() {
        serviceScope.launch {
            try {
                val application =
                    application as SmsGatewayApplication

                application.gatewaySettingsStore
                    .setGatewayDesiredEnabled(false)
            } finally {
                cleanupConnection()
                GatewayServiceState.setRunning(false)
                ServiceCompat.stopForeground(
                    this@GatewayForegroundService,
                    ServiceCompat.STOP_FOREGROUND_REMOVE
                )
                stopSelf()
            }
        }
    }

    private fun cleanupConnection() {
        connectionJob?.cancel()
        connectionJob = null
        cleanupSocketConnection()
    }

    private fun cleanupSocketConnection() {
        heartbeatJob?.cancel()
        heartbeatJob = null

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
        private const val TAG = "GatewayService"
        private const val CHANNEL_ID =
            "sms_gateway_service"
        private const val NOTIFICATION_ID = 1001
        private const val INITIAL_RETRY_DELAY_MS = 1_000L
        private const val MAX_RETRY_DELAY_MS = 30_000L
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
