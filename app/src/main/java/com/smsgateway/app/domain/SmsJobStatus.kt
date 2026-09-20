package com.smsgateway.app.domain

enum class SmsJobStatus {
    QUEUED,
    SENDING,
    SENT,
    DELIVERED,
    FAILED,
    RETRY_PENDING
}
