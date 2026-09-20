package com.smsgateway.app.sms

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.smsgateway.app.SmsGatewayApplication
import com.smsgateway.app.network.RemoteSmsStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class SmsDeliveredReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val jobId =
            intent?.getStringExtra(AndroidSmsTransport.EXTRA_JOB_ID)
                ?: return

        val result = resultCode
        val pendingResult = goAsync()
        val application =
            context.applicationContext as SmsGatewayApplication

        CoroutineScope(
            SupervisorJob() + Dispatchers.IO
        ).launch {
            try {
                if (result == Activity.RESULT_OK) {
                    application.smsJobStore.markDelivered(
                        jobId = jobId,
                        deliveredAt = System.currentTimeMillis()
                    )

                    reportRemoteStatusSafely(
                        application = application,
                        jobId = jobId,
                        status = RemoteSmsStatus.DELIVERED
                    )
                } else {
                    val reason =
                        "El operador no confirmó la entrega"

                    application.smsJobStore.markFailed(
                        jobId = jobId,
                        reason = reason
                    )

                    reportRemoteStatusSafely(
                        application = application,
                        jobId = jobId,
                        status = RemoteSmsStatus.FAILED,
                        error = reason
                    )
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    private suspend fun reportRemoteStatusSafely(
        application: SmsGatewayApplication,
        jobId: String,
        status: RemoteSmsStatus,
        error: String? = null
    ) {
        try {
            application.remoteSmsJobRepository.reportStatus(
                jobId = jobId,
                status = status,
                error = error
            )
        } catch (exception: Exception) {
            Log.w(
                TAG,
                "No se pudo sincronizar estado remoto $status para $jobId",
                exception
            )
        }
    }

    companion object {
        private const val TAG = "SmsDeliveredReceiver"
    }
}
