package com.smsgateway.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.smsgateway.app.domain.SmsJob
import com.smsgateway.app.domain.SmsJobStatus

@Entity(tableName = "sms_jobs")
data class SmsJobEntity(
    @PrimaryKey val id: String,
    val destination: String,
    val message: String,
    val status: String,
    val attempts: Int,
    val createdAt: Long,
    val sentAt: Long?,
    val deliveredAt: Long?,
    val error: String?
)

fun SmsJobEntity.toDomain(): SmsJob = SmsJob(
    id = id,
    destination = destination,
    message = message,
    status = SmsJobStatus.valueOf(status),
    attempts = attempts,
    createdAt = createdAt,
    sentAt = sentAt,
    deliveredAt = deliveredAt,
    error = error
)

fun SmsJob.toEntity(): SmsJobEntity = SmsJobEntity(
    id = id,
    destination = destination,
    message = message,
    status = status.name,
    attempts = attempts,
    createdAt = createdAt,
    sentAt = sentAt,
    deliveredAt = deliveredAt,
    error = error
)
