package com.smsgateway.app.sms

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.telephony.SmsManager
import com.smsgateway.app.domain.SmsJob
import com.smsgateway.app.domain.SmsTransport

class AndroidSmsTransport(
    private val context: Context
) : SmsTransport {

    override fun send(job: SmsJob) {
        val smsManager = requireNotNull(context.getSystemService(SmsManager::class.java)) {
            "SmsManager no está disponible en este dispositivo"
        }

        val requestCode = job.id.hashCode()

        val sentIntent = Intent(context, SmsSentReceiver::class.java)
            .putExtra(EXTRA_JOB_ID, job.id)

        val deliveredIntent = Intent(context, SmsDeliveredReceiver::class.java)
            .putExtra(EXTRA_JOB_ID, job.id)

        val sentPendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            sentIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val deliveredPendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode xor Int.MIN_VALUE,
            deliveredIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        smsManager.sendTextMessage(
            job.destination,
            null,
            job.message,
            sentPendingIntent,
            deliveredPendingIntent
        )
    }

    companion object {
        const val EXTRA_JOB_ID = "job_id"
    }
}
