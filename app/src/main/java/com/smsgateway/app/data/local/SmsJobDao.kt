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
          AND status = 'SENDING'
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
          AND status IN ('SENDING', 'SENT')
        """
    )
    suspend fun markDelivered(jobId: String, deliveredAt: Long): Int

    @Query(
        """
        UPDATE sms_jobs
        SET status = 'FAILED',
            error = :reason
        WHERE id = :jobId
          AND status IN ('QUEUED', 'SENDING', 'RETRY_PENDING')
        """
    )
    suspend fun markFailed(jobId: String, reason: String): Int
}
