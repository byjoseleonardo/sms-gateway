package com.smsgateway.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.smsgateway.app.ui.SmsGatewayScreen
import com.smsgateway.app.ui.theme.SmsGatewayTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val application = application as SmsGatewayApplication

        setContent {
            SmsGatewayTheme {
                SmsGatewayScreen(
                    jobs = application.smsJobStore.observeRecent(),
                    gatewaySettings = application.gatewaySettingsStore.settings,
                    sendSms = application.sendSmsUseCase::execute,
                    saveGatewaySettings = application.gatewaySettingsStore::saveServerUrl,
                    saveEnrollmentKey = application.gatewaySettingsStore::saveEnrollmentKey,
                    checkBackend = application.backendHealthRepository::check
                )
            }
        }
    }
}
