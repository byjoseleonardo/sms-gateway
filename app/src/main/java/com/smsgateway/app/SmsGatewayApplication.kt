package com.smsgateway.app

import android.app.Application
import com.smsgateway.app.data.local.RoomSmsJobStore
import com.smsgateway.app.data.local.SmsGatewayDatabase
import com.smsgateway.app.data.settings.GatewaySettingsStore
import com.smsgateway.app.domain.SendSmsUseCase
import com.smsgateway.app.domain.SmsJobStore
import com.smsgateway.app.network.BackendHealthRepository
import com.smsgateway.app.sms.AndroidSmsTransport

class SmsGatewayApplication : Application() {
    lateinit var smsJobStore: SmsJobStore
        private set

    lateinit var sendSmsUseCase: SendSmsUseCase
        private set

    lateinit var gatewaySettingsStore: GatewaySettingsStore
        private set

    lateinit var backendHealthRepository: BackendHealthRepository
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
    }
}
