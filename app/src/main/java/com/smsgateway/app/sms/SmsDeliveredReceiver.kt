package com.smsgateway.app.sms

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.smsgateway.app.SmsGatewayApplication
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class SmsDeliveredReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val jobId = intent?.getStringExtra(AndroidSmsTransport.EXTRA_JOB_ID) ?: return
        val result = resultCode
        val pendingResult = goAsync()
        val application = context.applicationContext as SmsGatewayApplication

        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                if (result == Activity.RESULT_OK) {
                    application.smsJobStore.markDelivered(
                        jobId = jobId,
                        deliveredAt = System.currentTimeMillis()
                    )
                } else {
                    application.smsJobStore.markFailed(
                        jobId = jobId,
                        reason = "El operador no confirmó la entrega"
                    )
                }
            } finally {
                pendingResult.finish()
            }
        }
    }
}
