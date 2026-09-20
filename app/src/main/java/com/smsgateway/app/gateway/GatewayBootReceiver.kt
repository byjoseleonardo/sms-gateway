package com.smsgateway.app.gateway

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.smsgateway.app.SmsGatewayApplication
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class GatewayBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return

        if (
            action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }

        val pendingResult = goAsync()
        val application =
            context.applicationContext as SmsGatewayApplication

        CoroutineScope(
            SupervisorJob() + Dispatchers.IO
        ).launch {
            try {
                val settings =
                    application.gatewaySettingsStore.settings.first()

                if (settings.gatewayDesiredEnabled) {
                    Log.i(
                        TAG,
                        "Restoring gateway service after $action"
                    )
                    GatewayForegroundService.start(context)
                } else {
                    Log.i(
                        TAG,
                        "Gateway auto-start skipped after $action"
                    )
                }
            } catch (exception: Exception) {
                Log.e(
                    TAG,
                    "Gateway auto-start failed after $action",
                    exception
                )
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        private const val TAG = "GatewayBootReceiver"
    }
}
