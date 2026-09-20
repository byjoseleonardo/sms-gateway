package com.smsgateway.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface SmsJobDao {
    @Query("SELECT * FROM sms_jobs ORDER BY createdAt DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<SmsJobEntity>>

    @Query("SELECT * FROM sms_jobs WHERE id = :jobId LIMIT 1")
    suspend fun get(jobId: String): SmsJobEntity?

    @Query(
        """
        SELECT * FROM sms_jobs
        WHERE id LIKE 'sms_%'
          AND status IN ('SENDING', 'RECONCILIATION_REQUIRED')
        ORDER BY createdAt ASC
        """
    )
    suspend fun getReconciliationCandidates(): List<SmsJobEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(entity: SmsJobEntity): Long

    @Query(
        """
        UPDATE sms_jobs
        SET status = 'SENDING',
            attempts = attempts + 1,
            error = NULL
        WHERE id = :jobId
          AND status IN ('QUEUED', 'RETRY_PENDING')
        """
    )
    suspend fun markSending(jobId: String): Int

    @Query(
        """
        UPDATE sms_jobs
        SET status = 'SENT',
            sentAt = :sentAt,
            error = NULL
        WHERE id = :jobId
          AND status IN ('SENDING', 'RECONCILIATION_REQUIRED')
        """
    )
    suspend fun markSent(jobId: String, sentAt: Long): Int

    @Query(
        """
        UPDATE sms_jobs
        SET status = 'DELIVERED',
            deliveredAt = :deliveredAt,
            error = NULL
        WHERE id = :jobId
          AND status IN ('SENDING', 'SENT', 'RECONCILIATION_REQUIRED')
        """
    )
    suspend fun markDelivered(jobId: String, deliveredAt: Long): Int

    @Query(
        """
        UPDATE sms_jobs
        SET status = 'FAILED',
            error = :reason
        WHERE id = :jobId
          AND status IN (
            'QUEUED',
            'SENDING',
            'RETRY_PENDING',
            'RECONCILIATION_REQUIRED'
          )
        """
    )
    suspend fun markFailed(jobId: String, reason: String): Int

    @Query(
        """
        UPDATE sms_jobs
        SET status = 'RECONCILIATION_REQUIRED',
            error = :reason
        WHERE id = :jobId
          AND status = 'SENDING'
        """
    )
    suspend fun markReconciliationRequired(
        jobId: String,
        reason: String
    ): Int
}
