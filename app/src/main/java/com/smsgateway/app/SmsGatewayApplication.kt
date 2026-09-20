package com.smsgateway.app

import android.app.Application
import android.util.Log
import com.smsgateway.app.data.local.RoomSmsJobStore
import com.smsgateway.app.data.local.SmsGatewayDatabase
import com.smsgateway.app.data.settings.GatewaySettingsStore
import com.smsgateway.app.domain.SendSmsUseCase
import com.smsgateway.app.domain.SmsJobStore
import com.smsgateway.app.network.BackendHealthRepository
import com.smsgateway.app.network.RemoteSmsJobRepository
import com.smsgateway.app.sms.AndroidSmsTransport
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class SmsGatewayApplication : Application() {
    private val applicationScope =
        CoroutineScope(SupervisorJob() + Dispatchers.IO)

    lateinit var smsJobStore: SmsJobStore
        private set

    lateinit var sendSmsUseCase: SendSmsUseCase
        private set

    lateinit var gatewaySettingsStore: GatewaySettingsStore
        private set

    lateinit var backendHealthRepository: BackendHealthRepository
        private set

    lateinit var remoteSmsJobRepository: RemoteSmsJobRepository
        private set

    override fun onCreate() {
        super.onCreate()

        val database = SmsGatewayDatabase.getInstance(this)
        smsJobStore = RoomSmsJobStore(database.smsJobDao())

        val transport = AndroidSmsTransport(this)
        sendSmsUseCase = SendSmsUseCase(
            store = smsJobStore,
            transport = transport
        )

        gatewaySettingsStore = GatewaySettingsStore(this)
        backendHealthRepository = BackendHealthRepository()
        remoteSmsJobRepository =
            RemoteSmsJobRepository(gatewaySettingsStore)

        applicationScope.launch {
            runCatching {
                gatewaySettingsStore
                    .migrateLegacyTokenIfNeeded()
            }.onSuccess { migrated ->
                if (migrated) {
                    Log.i(
                        TAG,
                        "Gateway credential migrated to Android Keystore"
                    )
                }
            }.onFailure { exception ->
                Log.e(
                    TAG,
                    "Gateway credential migration failed",
                    exception
                )
            }
        }
    }

    companion object {
        private const val TAG = "SmsGatewayApplication"
    }
}
