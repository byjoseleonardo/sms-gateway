package com.smsgateway.app.domain

import kotlinx.coroutines.flow.Flow

interface SmsJobStore {
    fun observeRecent(limit: Int = 20): Flow<List<SmsJob>>

    suspend fun get(jobId: String): SmsJob?

    suspend fun getReconciliationCandidates(): List<SmsJob>

    suspend fun insertIfAbsent(job: SmsJob): Boolean

    suspend fun markSending(jobId: String): Boolean

    suspend fun markSent(jobId: String, sentAt: Long)

    suspend fun markDelivered(jobId: String, deliveredAt: Long)

    suspend fun markFailed(jobId: String, reason: String)

    suspend fun markReconciliationRequired(
        jobId: String,
        reason: String
    ): Boolean
}
