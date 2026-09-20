package com.smsgateway.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import com.smsgateway.app.ui.SmsGatewayScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val application = application as SmsGatewayApplication

        setContent {
            MaterialTheme {
                SmsGatewayScreen(
                    jobs = application.smsJobStore.observeRecent(),
                    gatewaySettings = application.gatewaySettingsStore.settings,
                    sendSms = application.sendSmsUseCase::execute,
                    saveGatewaySettings = application.gatewaySettingsStore::save,
                    saveEnrollmentKey = application.gatewaySettingsStore::saveEnrollmentKey,
                    checkBackend = application.backendHealthRepository::check
                )
            }
        }
    }
}
