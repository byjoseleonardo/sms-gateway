package com.smsgateway.app.domain

data class SmsJob(
    val id: String,
    val destination: String,
    val message: String,
    val status: SmsJobStatus,
    val attempts: Int,
    val createdAt: Long,
    val sentAt: Long?,
    val deliveredAt: Long?,
    val error: String?
)

data class SmsJobRequest(
    val id: String,
    val destination: String,
    val message: String
)
