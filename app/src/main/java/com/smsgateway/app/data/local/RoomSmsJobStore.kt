package com.smsgateway.app.data.local

import com.smsgateway.app.domain.SmsJob
import com.smsgateway.app.domain.SmsJobStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class RoomSmsJobStore(
    private val dao: SmsJobDao
) : SmsJobStore {
    override fun observeRecent(limit: Int): Flow<List<SmsJob>> =
        dao.observeRecent(limit).map { entities ->
            entities.map(SmsJobEntity::toDomain)
        }

    override suspend fun insertIfAbsent(job: SmsJob): Boolean =
        dao.insert(job.toEntity()) != -1L

    override suspend fun markSending(jobId: String) {
        dao.markSending(jobId)
    }

    override suspend fun markSent(jobId: String, sentAt: Long) {
        dao.markSent(jobId, sentAt)
    }

    override suspend fun markDelivered(jobId: String, deliveredAt: Long) {
        dao.markDelivered(jobId, deliveredAt)
    }

    override suspend fun markFailed(jobId: String, reason: String) {
        dao.markFailed(jobId, reason)
    }
}
