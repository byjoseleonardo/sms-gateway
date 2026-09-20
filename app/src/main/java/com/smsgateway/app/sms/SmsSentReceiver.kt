package com.smsgateway.app.sms

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.SmsManager
import com.smsgateway.app.SmsGatewayApplication
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class SmsSentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val jobId = intent?.getStringExtra(AndroidSmsTransport.EXTRA_JOB_ID) ?: return
        val result = resultCode
        val pendingResult = goAsync()
        val application = context.applicationContext as SmsGatewayApplication

        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                if (result == Activity.RESULT_OK) {
                    application.smsJobStore.markSent(
                        jobId = jobId,
                        sentAt = System.currentTimeMillis()
                    )
                } else {
                    application.smsJobStore.markFailed(
                        jobId = jobId,
                        reason = errorMessage(result)
                    )
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun errorMessage(result: Int): String = when (result) {
        SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "Fallo genérico de la red SMS"
        SmsManager.RESULT_ERROR_NO_SERVICE -> "Sin servicio celular"
        SmsManager.RESULT_ERROR_NULL_PDU -> "PDU nulo"
        SmsManager.RESULT_ERROR_RADIO_OFF -> "Radio celular apagada"
        else -> "Error de envío: código $result"
    }
}
