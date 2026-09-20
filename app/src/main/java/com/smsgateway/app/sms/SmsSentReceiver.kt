package com.smsgateway.app.sms

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.SmsManager
import android.util.Log
import com.smsgateway.app.SmsGatewayApplication
import com.smsgateway.app.network.RemoteSmsStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class SmsSentReceiver : BroadcastReceiver() {
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
                    application.smsJobStore.markSent(
                        jobId = jobId,
                        sentAt = System.currentTimeMillis()
                    )

                    reportRemoteStatusSafely(
                        application = application,
                        jobId = jobId,
                        status = RemoteSmsStatus.SENT
                    )
                } else {
                    val reason = errorMessage(result)

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

    private fun errorMessage(result: Int): String = when (result) {
        SmsManager.RESULT_ERROR_GENERIC_FAILURE ->
            "Fallo genérico de la red SMS"
        SmsManager.RESULT_ERROR_NO_SERVICE ->
            "Sin servicio celular"
        SmsManager.RESULT_ERROR_NULL_PDU ->
            "PDU nulo"
        SmsManager.RESULT_ERROR_RADIO_OFF ->
            "Radio celular apagada"
        else ->
            "Error de envío: código $result"
    }

    companion object {
        private const val TAG = "SmsSentReceiver"
    }
}
