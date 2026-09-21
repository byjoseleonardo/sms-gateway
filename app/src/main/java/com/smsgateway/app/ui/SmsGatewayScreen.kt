package com.smsgateway.app.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
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
import com.smsgateway.app.gateway.GatewayConnectionPhase
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
    var manualSendExpanded by rememberSaveable { mutableStateOf(false) }
    var settingsExpanded by rememberSaveable { mutableStateOf(false) }

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
            validationError =
                "Concede notificaciones para mantener visible el estado del gateway"
        }
    }

    val deliveredCount = recentJobs.count {
        it.status == SmsJobStatus.DELIVERED
    }
    val pendingCount = recentJobs.count {
        it.status in setOf(
            SmsJobStatus.QUEUED,
            SmsJobStatus.SENDING,
            SmsJobStatus.SENT,
            SmsJobStatus.RETRY_PENDING
        )
    }
    val problemCount = recentJobs.count {
        it.status in setOf(
            SmsJobStatus.FAILED,
            SmsJobStatus.RECONCILIATION_REQUIRED
        )
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(
                horizontal = 18.dp,
                vertical = 20.dp
            ),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item {
                HeaderSection(
                    gatewayId = storedSettings.gatewayId
                )
            }

            item {
                GatewayOverviewCard(
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

            if (!hasSmsPermission) {
                item {
                    PermissionCard(
                        onGrant = {
                            smsPermissionLauncher.launch(
                                Manifest.permission.SEND_SMS
                            )
                        }
                    )
                }
            }

            item {
                MetricsRow(
                    delivered = deliveredCount,
                    pending = pendingCount,
                    problems = problemCount
                )
            }

            item {
                SectionHeader(
                    title = "Actividad reciente",
                    subtitle = if (recentJobs.isEmpty()) {
                        "Todavía no hay envíos registrados en este dispositivo"
                    } else {
                        "Últimos movimientos guardados localmente"
                    }
                )
            }

            if (recentJobs.isEmpty()) {
                item {
                    EmptyActivityCard()
                }
            } else {
                items(
                    items = recentJobs.take(5),
                    key = SmsJob::id
                ) { job ->
                    SmsHistoryCard(job)
                }
            }

            item {
                ExpandableSectionHeader(
                    title = "Enviar SMS manual",
                    subtitle = "Herramienta de prueba local",
                    expanded = manualSendExpanded,
                    onToggle = {
                        manualSendExpanded = !manualSendExpanded
                    }
                )
            }

            if (manualSendExpanded) {
                item {
                    ManualSendCard(
                        phone = phone,
                        message = message,
                        error = validationError,
                        hasSmsPermission = hasSmsPermission,
                        isSubmitting = isSubmitting,
                        onPhoneChange = {
                            phone = it
                            validationError = null
                        },
                        onMessageChange = {
                            if (it.length <= 160) {
                                message = it
                            }
                            validationError = null
                        },
                        onRequestSmsPermission = {
                            smsPermissionLauncher.launch(
                                Manifest.permission.SEND_SMS
                            )
                        },
                        onSend = {
                            val error = SmsInputValidator.validate(
                                phone,
                                message
                            )
                            validationError = error

                            if (
                                error == null &&
                                !isSubmitting
                            ) {
                                isSubmitting = true

                                val request = SmsJobRequest(
                                    id = UUID.randomUUID().toString(),
                                    destination =
                                        SmsInputValidator.normalizePhone(phone),
                                    message = message
                                )

                                scope.launch {
                                    when (
                                        val result = sendSms(request)
                                    ) {
                                        is SmsDispatchResult.Accepted -> {
                                            phone = ""
                                            message = ""
                                        }

                                        is SmsDispatchResult.Duplicate ->
                                            validationError =
                                                "El trabajo " +
                                                    result.jobId.take(8) +
                                                    " ya fue procesado"

                                        is SmsDispatchResult.Failed ->
                                            validationError = result.reason
                                    }

                                    isSubmitting = false
                                }
                            }
                        }
                    )
                }
            }

            item {
                ExpandableSectionHeader(
                    title = "Configuración",
                    subtitle = "Servidor, identidad y enrolamiento",
                    expanded = settingsExpanded,
                    onToggle = {
                        settingsExpanded = !settingsExpanded
                    }
                )
            }

            if (settingsExpanded) {
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
                                        val normalizedSettings =
                                            GatewaySettings(
                                                serverUrl =
                                                    normalizeServerUrl(serverUrl),
                                                gatewayId =
                                                    gatewayId.trim()
                                            )

                                        require(
                                            normalizedSettings.gatewayId
                                                .isNotBlank()
                                        ) {
                                            "El identificador del gateway no puede estar vacío"
                                        }

                                        saveGatewaySettings(
                                            normalizedSettings.serverUrl,
                                            normalizedSettings.gatewayId
                                        )

                                        if (enrollmentKey.isNotBlank()) {
                                            saveEnrollmentKey(
                                                enrollmentKey
                                            )
                                            enrollmentKey = ""
                                        }

                                        serverUrl =
                                            normalizedSettings.serverUrl
                                        gatewayId =
                                            normalizedSettings.gatewayId

                                        val result =
                                            checkBackend(
                                                normalizedSettings
                                            )

                                        backendConnected =
                                            result.connected

                                        backendMessage =
                                            if (
                                                result.latencyMs != null
                                            ) {
                                                result.message +
                                                    " · " +
                                                    result.latencyMs +
                                                    " ms"
                                            } else {
                                                result.message
                                            }
                                    } catch (
                                        exception: Exception
                                    ) {
                                        backendConnected = false
                                        backendMessage =
                                            exception.message
                                                ?: "No se pudo guardar o probar la conexión"
                                    } finally {
                                        isCheckingBackend = false
                                    }
                                }
                            }
                        }
                    )
                }
            }

            item {
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text =
                        "SMS Gateway " +
                            BuildConfig.VERSION_NAME,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun HeaderSection(
    gatewayId: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = "SMS Gateway",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Gateway privado de mensajería",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        AssistChip(
            onClick = {},
            label = {
                Text(
                    text = gatewayId.take(14),
                    maxLines = 1
                )
            }
        )
    }
}

@Composable
private fun GatewayOverviewCard(
    running: Boolean,
    connection: GatewayConnectionSnapshot,
    onStart: () -> Unit,
    onStop: () -> Unit
) {
    val connected =
        running &&
            connection.phase ==
                GatewayConnectionPhase.CONNECTED

    val containerColor = when {
        connected ->
            MaterialTheme.colorScheme.primaryContainer

        connection.phase ==
            GatewayConnectionPhase.ERROR ->
            MaterialTheme.colorScheme.errorContainer

        else ->
            MaterialTheme.colorScheme.surfaceVariant
    }

    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.elevatedCardColors(
            containerColor = containerColor
        ),
        shape = RoundedCornerShape(24.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement =
                        Arrangement.spacedBy(12.dp),
                    verticalAlignment =
                        Alignment.CenterVertically
                ) {
                    StatusDot(
                        active = connected,
                        error =
                            connection.phase ==
                                GatewayConnectionPhase.ERROR
                    )

                    Column(
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(
                            text = when {
                                connected -> "Gateway activo"
                                running -> "Gateway conectando"
                                else -> "Gateway detenido"
                            },
                            style =
                                MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold
                        )

                        Text(
                            text = if (running) {
                                connection.message
                            } else {
                                "El dispositivo no está procesando trabajos"
                            },
                            style =
                                MaterialTheme.typography.bodyMedium,
                            color =
                                MaterialTheme.colorScheme
                                    .onSurfaceVariant
                        )
                    }
                }

                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color =
                        MaterialTheme.colorScheme.surface.copy(
                            alpha = 0.78f
                        )
                ) {
                    Text(
                        text = when {
                            connected -> "ONLINE"
                            running -> "CONECTANDO"
                            else -> "OFFLINE"
                        },
                        modifier = Modifier.padding(
                            horizontal = 10.dp,
                            vertical = 6.dp
                        ),
                        style =
                            MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            HorizontalDivider(
                color =
                    MaterialTheme.colorScheme.outline.copy(
                        alpha = 0.25f
                    )
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement =
                    Arrangement.spacedBy(12.dp)
            ) {
                InfoValue(
                    modifier = Modifier.weight(1f),
                    label = "Backend",
                    value =
                        connection.backendVersion
                            ?.let { "v" + it }
                            ?: "—"
                )

                InfoValue(
                    modifier = Modifier.weight(1f),
                    label = "Heartbeat",
                    value =
                        connection.lastHeartbeatAt
                            ?.let(::formatRelativeTime)
                            ?: "—"
                )
            }

            if (running) {
                FilledTonalButton(
                    onClick = onStop,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Detener gateway")
                }
            } else {
                Button(
                    onClick = onStart,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Iniciar gateway")
                }
            }
        }
    }
}

@Composable
private fun StatusDot(
    active: Boolean,
    error: Boolean = false
) {
    val color = when {
        error -> MaterialTheme.colorScheme.error
        active -> Color(0xFF16865C)
        else -> MaterialTheme.colorScheme.outline
    }

    Box(
        modifier = Modifier
            .size(12.dp)
            .background(
                color = color,
                shape = CircleShape
            )
    )
}

@Composable
private fun InfoValue(
    modifier: Modifier = Modifier,
    label: String,
    value: String
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun PermissionCard(
    onGrant: () -> Unit
) {
    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.outlinedCardColors(
            containerColor =
                MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = "Permiso SMS pendiente",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = "El gateway necesita este permiso para despachar mensajes por la SIM.",
                style = MaterialTheme.typography.bodyMedium
            )
            Button(
                onClick = onGrant,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Conceder permiso")
            }
        }
    }
}

@Composable
private fun MetricsRow(
    delivered: Int,
    pending: Int,
    problems: Int
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        MetricCard(
            modifier = Modifier.weight(1f),
            label = "Entregados",
            value = delivered.toString()
        )
        MetricCard(
            modifier = Modifier.weight(1f),
            label = "Pendientes",
            value = pending.toString()
        )
        MetricCard(
            modifier = Modifier.weight(1f),
            label = "Alertas",
            value = problems.toString()
        )
    }
}

@Composable
private fun MetricCard(
    modifier: Modifier,
    label: String,
    value: String
) {
    OutlinedCard(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp)
    ) {
        Column(
            modifier = Modifier.padding(
                horizontal = 12.dp,
                vertical = 14.dp
            ),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun SectionHeader(
    title: String,
    subtitle: String
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun ExpandableSectionHeader(
    title: String,
    subtitle: String,
    expanded: Boolean,
    onToggle: () -> Unit
) {
    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    start = 16.dp,
                    top = 8.dp,
                    end = 8.dp,
                    bottom = 8.dp
                ),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color =
                        MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            TextButton(
                onClick = onToggle
            ) {
                Text(
                    if (expanded) "Ocultar" else "Abrir"
                )
            }
        }
    }
}

@Composable
private fun EmptyActivityCard() {
    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp)
    ) {
        Column(
            modifier = Modifier.padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = "Sin actividad todavía",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = "Los envíos procesados por este teléfono aparecerán aquí.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun ManualSendCard(
    phone: String,
    message: String,
    error: String?,
    hasSmsPermission: Boolean,
    isSubmitting: Boolean,
    onPhoneChange: (String) -> Unit,
    onMessageChange: (String) -> Unit,
    onRequestSmsPermission: () -> Unit,
    onSend: () -> Unit
) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp)
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedTextField(
                value = phone,
                onValueChange = onPhoneChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Número de destino") },
                placeholder = { Text("+51987654321") },
                keyboardOptions =
                    KeyboardOptions(
                        keyboardType = KeyboardType.Phone
                    ),
                singleLine = true
            )

            OutlinedTextField(
                value = message,
                onValueChange = onMessageChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Mensaje") },
                supportingText = {
                    Text(message.length.toString() + "/160")
                },
                minLines = 3
            )

            error?.let {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }

            if (hasSmsPermission) {
                Button(
                    onClick = onSend,
                    enabled = !isSubmitting,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        if (isSubmitting) {
                            "Procesando…"
                        } else {
                            "Enviar SMS de prueba"
                        }
                    )
                }
            } else {
                Button(
                    onClick = onRequestSmsPermission,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Conceder permiso SMS")
                }
            }

            Text(
                text = "Este formulario envía directamente desde la SIM del dispositivo. Úsalo solo para pruebas.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
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
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp)
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "Configuración avanzada",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
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
                label = {
                    Text("Clave de enrolamiento")
                },
                supportingText = {
                    Text(
                        "Solo es necesaria para registrar o recuperar el dispositivo"
                    )
                },
                visualTransformation =
                    PasswordVisualTransformation(),
                singleLine = true
            )

            Surface(
                shape = RoundedCornerShape(12.dp),
                color = when (connected) {
                    true ->
                        MaterialTheme.colorScheme.primaryContainer

                    false ->
                        MaterialTheme.colorScheme.errorContainer

                    null ->
                        MaterialTheme.colorScheme.surfaceVariant
                }
            ) {
                Text(
                    text = statusMessage,
                    modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodySmall
                )
            }

            Button(
                onClick = onSaveAndCheck,
                enabled = !checking,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    if (checking) {
                        "Comprobando…"
                    } else {
                        "Guardar y comprobar"
                    }
                )
            }
        }
    }
}

@Composable
private fun SmsHistoryCard(
    job: SmsJob
) {
    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(15.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            StatusDot(
                active =
                    job.status ==
                        SmsJobStatus.DELIVERED,
                error =
                    job.status in setOf(
                        SmsJobStatus.FAILED,
                        SmsJobStatus.RECONCILIATION_REQUIRED
                    )
            )

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement =
                        Arrangement.SpaceBetween
                ) {
                    Text(
                        text =
                            maskPhone(job.destination),
                        style =
                            MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold
                    )

                    Text(
                        text =
                            job.status.displayName(),
                        style =
                            MaterialTheme.typography.labelMedium,
                        color =
                            statusColor(job.status)
                    )
                }

                Text(
                    text = job.message,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 2
                )

                Text(
                    text =
                        formatTimestamp(job.createdAt) +
                            " · intento " +
                            job.attempts,
                    style = MaterialTheme.typography.bodySmall,
                    color =
                        MaterialTheme.colorScheme.onSurfaceVariant
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
private fun statusColor(
    status: SmsJobStatus
): Color = when (status) {
    SmsJobStatus.DELIVERED ->
        Color(0xFF16865C)

    SmsJobStatus.FAILED,
    SmsJobStatus.RECONCILIATION_REQUIRED ->
        MaterialTheme.colorScheme.error

    else ->
        MaterialTheme.colorScheme.primary
}

private fun SmsJobStatus.displayName(): String =
    when (this) {
        SmsJobStatus.QUEUED -> "En cola"
        SmsJobStatus.SENDING -> "Enviando"
        SmsJobStatus.SENT -> "Enviado"
        SmsJobStatus.DELIVERED -> "Entregado"
        SmsJobStatus.FAILED -> "Fallido"
        SmsJobStatus.RETRY_PENDING ->
            "Reintento pendiente"

        SmsJobStatus.RECONCILIATION_REQUIRED ->
            "Revisión necesaria"
    }

private fun maskPhone(
    value: String
): String {
    if (value.length <= 7) return value

    val prefix = value.take(4)
    val suffix = value.takeLast(3)

    return prefix + " *** " + suffix
}

private fun formatRelativeTime(
    timestamp: Long
): String {
    val seconds =
        ((System.currentTimeMillis() - timestamp) / 1_000)
            .coerceAtLeast(0)

    return when {
        seconds < 10 -> "Ahora"
        seconds < 60 -> "Hace " + seconds + "s"
        seconds < 3_600 ->
            "Hace " + (seconds / 60) + " min"

        else -> formatTimestamp(timestamp)
    }
}

private val timestampFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd/MM HH:mm")

private fun formatTimestamp(
    timestamp: Long
): String =
    Instant.ofEpochMilli(timestamp)
        .atZone(ZoneId.systemDefault())
        .format(timestampFormatter)
