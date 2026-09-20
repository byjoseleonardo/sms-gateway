package com.smsgateway.app.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.smsgateway.app.BuildConfig
import com.smsgateway.app.data.settings.GatewaySettings
import com.smsgateway.app.data.settings.normalizeServerUrl
import com.smsgateway.app.domain.SmsDispatchResult
import com.smsgateway.app.domain.SmsJob
import com.smsgateway.app.domain.SmsJobRequest
import com.smsgateway.app.domain.SmsJobStatus
import com.smsgateway.app.gateway.GatewayConnectionSnapshot
import com.smsgateway.app.gateway.GatewayForegroundService
import com.smsgateway.app.gateway.GatewayServiceState
import com.smsgateway.app.network.BackendHealthResult
import com.smsgateway.app.validation.SmsInputValidator
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch

@Composable
fun SmsGatewayScreen(
    jobs: Flow<List<SmsJob>>,
    gatewaySettings: Flow<GatewaySettings>,
    sendSms: suspend (SmsJobRequest) -> SmsDispatchResult,
    saveGatewaySettings: suspend (String, String) -> Unit,
    saveEnrollmentKey: suspend (String) -> Unit,
    checkBackend: suspend (GatewaySettings) -> BackendHealthResult
) {
    val context = LocalContext.current
    val recentJobs by jobs.collectAsState(initial = emptyList())
    val storedSettings by gatewaySettings.collectAsState(initial = GatewaySettings())
    val gatewayRunning by GatewayServiceState.running.collectAsState()
    val gatewayConnection by GatewayServiceState.connection.collectAsState()
    val scope = rememberCoroutineScope()

    var serverUrl by remember { mutableStateOf(storedSettings.serverUrl) }
    var gatewayId by remember { mutableStateOf(storedSettings.gatewayId) }
    var enrollmentKey by remember { mutableStateOf("") }
    var backendMessage by remember { mutableStateOf("Sin probar") }
    var backendConnected by remember { mutableStateOf<Boolean?>(null) }
    var isCheckingBackend by remember { mutableStateOf(false) }

    var phone by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }
    var isSubmitting by remember { mutableStateOf(false) }
    var hasSmsPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.SEND_SMS
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    LaunchedEffect(storedSettings) {
        serverUrl = storedSettings.serverUrl
        gatewayId = storedSettings.gatewayId
    }

    val smsPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasSmsPermission = granted
        if (!granted) {
            validationError = "El permiso para enviar SMS es obligatorio"
        }
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            GatewayForegroundService.start(context)
        } else {
            validationError = "Concede notificaciones para mostrar el estado persistente del gateway"
        }
    }

    Scaffold { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Text(
                    text = "SMS Gateway",
                    style = MaterialTheme.typography.headlineMedium
                )
            }

            item {
                Text(
                    text = "v${BuildConfig.VERSION_NAME} · reconciliación segura",
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            item {
                BackendConnectionCard(
                    serverUrl = serverUrl,
                    gatewayId = gatewayId,
                    enrollmentKey = enrollmentKey,
                    statusMessage = backendMessage,
                    connected = backendConnected,
                    checking = isCheckingBackend,
                    onServerUrlChange = {
                        serverUrl = it
                        backendConnected = null
                        backendMessage = "Cambios sin probar"
                    },
                    onGatewayIdChange = {
                        gatewayId = it
                        backendConnected = null
                        backendMessage = "Cambios sin probar"
                    },
                    onEnrollmentKeyChange = {
                        enrollmentKey = it
                    },
                    onSaveAndCheck = {
                        if (!isCheckingBackend) {
                            scope.launch {
                                isCheckingBackend = true
                                backendConnected = null
                                backendMessage = "Probando conexión…"

                                try {
                                    val normalizedSettings = GatewaySettings(
                                        serverUrl = normalizeServerUrl(serverUrl),
                                        gatewayId = gatewayId.trim()
                                    )
                                    require(normalizedSettings.gatewayId.isNotBlank()) {
                                        "El identificador del gateway no puede estar vacío"
                                    }

                                    saveGatewaySettings(
                                        normalizedSettings.serverUrl,
                                        normalizedSettings.gatewayId
                                    )

                                    if (enrollmentKey.isNotBlank()) {
                                        saveEnrollmentKey(enrollmentKey)
                                        enrollmentKey = ""
                                    }

                                    serverUrl = normalizedSettings.serverUrl
                                    gatewayId = normalizedSettings.gatewayId

                                    val result = checkBackend(normalizedSettings)
                                    backendConnected = result.connected
                                    backendMessage = if (result.latencyMs != null) {
                                        "${result.message} · ${result.latencyMs} ms"
                                    } else {
                                        result.message
                                    }
                                } catch (exception: Exception) {
                                    backendConnected = false
                                    backendMessage = exception.message
                                        ?: "No se pudo guardar o probar la conexión"
                                } finally {
                                    isCheckingBackend = false
                                }
                            }
                        }
                    }
                )
            }

            item {
                GatewayServiceCard(
                    running = gatewayRunning,
                    connection = gatewayConnection,
                    onStart = {
                        validationError = null
                        val needsNotificationPermission =
                            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                                ContextCompat.checkSelfPermission(
                                    context,
                                    Manifest.permission.POST_NOTIFICATIONS
                                ) != PackageManager.PERMISSION_GRANTED

                        if (needsNotificationPermission) {
                            notificationPermissionLauncher.launch(
                                Manifest.permission.POST_NOTIFICATIONS
                            )
                        } else {
                            GatewayForegroundService.start(context)
                        }
                    },
                    onStop = {
                        GatewayForegroundService.stop(context)
                    }
                )
            }

            item {
                OutlinedTextField(
                    value = phone,
                    onValueChange = {
                        phone = it
                        validationError = null
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Número de destino") },
                    placeholder = { Text("+51987654321") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true
                )
            }

            item {
                OutlinedTextField(
                    value = message,
                    onValueChange = {
                        if (it.length <= 160) {
                            message = it
                        }
                        validationError = null
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Mensaje") },
                    supportingText = { Text("${message.length}/160") },
                    minLines = 4
                )
            }

            validationError?.let { error ->
                item {
                    Text(
                        text = error,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }

            item {
                if (!hasSmsPermission) {
                    Button(
                        onClick = {
                            smsPermissionLauncher.launch(Manifest.permission.SEND_SMS)
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Conceder permiso SMS")
                    }
                } else {
                    Button(
                        onClick = {
                            val error = SmsInputValidator.validate(phone, message)
                            validationError = error

                            if (error == null && !isSubmitting) {
                                isSubmitting = true
                                val request = SmsJobRequest(
                                    id = UUID.randomUUID().toString(),
                                    destination = SmsInputValidator.normalizePhone(phone),
                                    message = message
                                )

                                scope.launch {
                                    when (val result = sendSms(request)) {
                                        is SmsDispatchResult.Accepted -> Unit
                                        is SmsDispatchResult.Duplicate ->
                                            validationError =
                                                "El trabajo ${result.jobId.take(8)} ya fue procesado"
                                        is SmsDispatchResult.Failed ->
                                            validationError = result.reason
                                    }
                                    isSubmitting = false
                                }
                            }
                        },
                        enabled = !isSubmitting,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(if (isSubmitting) "Registrando…" else "Enviar SMS")
                    }
                }
            }

            item {
                CurrentStatusCard(job = recentJobs.firstOrNull())
            }

            if (recentJobs.isNotEmpty()) {
                item {
                    HorizontalDivider()
                    Text(
                        text = "Historial local",
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }

                items(
                    items = recentJobs,
                    key = SmsJob::id
                ) { job ->
                    SmsHistoryCard(job)
                }
            }
        }
    }
}

@Composable
private fun BackendConnectionCard(
    serverUrl: String,
    gatewayId: String,
    enrollmentKey: String,
    statusMessage: String,
    connected: Boolean?,
    checking: Boolean,
    onServerUrlChange: (String) -> Unit,
    onGatewayIdChange: (String) -> Unit,
    onEnrollmentKeyChange: (String) -> Unit,
    onSaveAndCheck: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = "Backend",
                style = MaterialTheme.typography.titleMedium
            )

            OutlinedTextField(
                value = serverUrl,
                onValueChange = onServerUrlChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("URL del servidor") },
                singleLine = true
            )

            OutlinedTextField(
                value = gatewayId,
                onValueChange = onGatewayIdChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Gateway ID") },
                singleLine = true
            )

            OutlinedTextField(
                value = enrollmentKey,
                onValueChange = onEnrollmentKeyChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Clave de enrolamiento (solo registro)") },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true
            )

            Text(
                text = statusMessage,
                color = when (connected) {
                    true -> MaterialTheme.colorScheme.primary
                    false -> MaterialTheme.colorScheme.error
                    null -> MaterialTheme.colorScheme.onSurfaceVariant
                },
                style = MaterialTheme.typography.bodySmall
            )

            Button(
                onClick = onSaveAndCheck,
                enabled = !checking,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (checking) "Probando…" else "Guardar y probar conexión")
            }
        }
    }
}

@Composable
private fun GatewayServiceCard(
    running: Boolean,
    connection: GatewayConnectionSnapshot,
    onStart: () -> Unit,
    onStop: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "Servicio Gateway",
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                text = if (running) {
                    connection.message
                } else {
                    "Detenido"
                },
                style = MaterialTheme.typography.bodyMedium
            )

            if (running && connection.backendVersion != null) {
                Text(
                    text = "Backend ${connection.backendVersion}",
                    style = MaterialTheme.typography.bodySmall
                )
            }
            Button(
                onClick = if (running) onStop else onStart,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (running) "Detener gateway" else "Iniciar gateway")
            }
        }
    }
}

@Composable
private fun CurrentStatusCard(job: SmsJob?) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = "Estado actual",
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                text = job?.status?.displayName() ?: "Esperando un envío",
                style = MaterialTheme.typography.bodyLarge
            )

            if (job != null) {
                Text(
                    text = "${job.destination} · intento ${job.attempts}",
                    style = MaterialTheme.typography.bodySmall
                )
                job.error?.let {
                    Text(
                        text = it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }
}

@Composable
private fun SmsHistoryCard(job: SmsJob) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = job.destination,
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                text = job.message,
                style = MaterialTheme.typography.bodyMedium
            )
            Text(
                text = "${job.status.displayName()} · ${formatTimestamp(job.createdAt)}",
                style = MaterialTheme.typography.bodySmall
            )
            Text(
                text = "Job ${job.id.take(8)} · intentos ${job.attempts}",
                style = MaterialTheme.typography.labelSmall
            )
            job.error?.let {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

private fun SmsJobStatus.displayName(): String = when (this) {
    SmsJobStatus.QUEUED -> "En cola"
    SmsJobStatus.SENDING -> "Enviando…"
    SmsJobStatus.SENT -> "Enviado a la red"
    SmsJobStatus.DELIVERED -> "Entregado"
    SmsJobStatus.FAILED -> "Fallido"
    SmsJobStatus.RETRY_PENDING -> "Reintento pendiente"
    SmsJobStatus.RECONCILIATION_REQUIRED -> "Requiere reconciliación"
}

private val timestampFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd/MM HH:mm:ss")

private fun formatTimestamp(timestamp: Long): String =
    Instant.ofEpochMilli(timestamp)
        .atZone(ZoneId.systemDefault())
        .format(timestampFormatter)
