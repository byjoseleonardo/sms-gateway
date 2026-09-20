package com.smsgateway.app.domain

interface SmsTransport {
    fun send(job: SmsJob)
}
