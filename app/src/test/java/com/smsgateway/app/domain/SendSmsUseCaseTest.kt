package com.smsgateway.app.domain

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SendSmsUseCaseTest {

    @Test
    fun `duplicate job id is not sent twice`() = runBlocking {
        val store = FakeSmsJobStore()
        val transport = FakeSmsTransport()
        val useCase = SendSmsUseCase(store, transport) { 1_000L }
        val request = SmsJobRequest(
            id = "job-001",
            destination = "+51987654321",
            message = "Prueba"
        )

        val first = useCase.execute(request)
        val second = useCase.execute(request)

        assertTrue(first is SmsDispatchResult.Accepted)
        assertTrue(second is SmsDispatchResult.Duplicate)
        assertEquals(1, transport.sentJobs.size)
        assertEquals(SmsJobStatus.SENDING, store.jobs.value.single().status)
        assertEquals(1, store.jobs.value.single().attempts)
    }

    @Test
    fun `transport failure is persisted as failed`() = runBlocking {
        val store = FakeSmsJobStore()
        val transport = FakeSmsTransport(
            failure = IllegalStateException("SIM no disponible")
        )
        val useCase = SendSmsUseCase(store, transport) { 2_000L }

        val result = useCase.execute(
            SmsJobRequest(
                id = "job-002",
                destination = "+51911111111",
                message = "Prueba"
            )
        )

        assertTrue(result is SmsDispatchResult.Failed)
        val job = store.jobs.value.single()
        assertEquals(SmsJobStatus.FAILED, job.status)
        assertEquals("SIM no disponible", job.error)
    }

    @Test
    fun `sending job can be marked for reconciliation`() = runBlocking {
        val store = FakeSmsJobStore()
        val transport = FakeSmsTransport()
        val useCase = SendSmsUseCase(store, transport) { 3_000L }

        useCase.execute(
            SmsJobRequest(
                id = "job-003",
                destination = "+51922222222",
                message = "Prueba"
            )
        )

        val changed = store.markReconciliationRequired(
            jobId = "job-003",
            reason = "proceso reiniciado antes del callback"
        )

        assertTrue(changed)
        val job = store.get("job-003")
        assertEquals(SmsJobStatus.RECONCILIATION_REQUIRED, job?.status)
        assertEquals(
            "proceso reiniciado antes del callback",
            job?.error
        )
    }

    private class FakeSmsTransport(
        private val failure: Exception? = null
    ) : SmsTransport {
        val sentJobs = mutableListOf<SmsJob>()

        override fun send(job: SmsJob) {
            failure?.let { throw it }
            sentJobs += job
        }
    }

    private class FakeSmsJobStore : SmsJobStore {
        val jobs = MutableStateFlow<List<SmsJob>>(emptyList())

        override fun observeRecent(limit: Int): Flow<List<SmsJob>> = jobs

        override suspend fun get(jobId: String): SmsJob? =
            jobs.value.firstOrNull { it.id == jobId }

        override suspend fun insertIfAbsent(job: SmsJob): Boolean {
            if (jobs.value.any { it.id == job.id }) return false
            jobs.value = listOf(job) + jobs.value
            return true
        }

        override suspend fun markSending(jobId: String): Boolean {
            val current = get(jobId) ?: return false
            if (
                current.status != SmsJobStatus.QUEUED &&
                current.status != SmsJobStatus.RETRY_PENDING
            ) {
                return false
            }

            update(jobId) {
                it.copy(
                    status = SmsJobStatus.SENDING,
                    attempts = it.attempts + 1,
                    error = null
                )
            }
            return true
        }

        override suspend fun markSent(jobId: String, sentAt: Long) {
            update(jobId) {
                it.copy(
                    status = SmsJobStatus.SENT,
                    sentAt = sentAt,
                    error = null
                )
            }
        }

        override suspend fun markDelivered(jobId: String, deliveredAt: Long) {
            update(jobId) {
                it.copy(
                    status = SmsJobStatus.DELIVERED,
                    deliveredAt = deliveredAt,
                    error = null
                )
            }
        }

        override suspend fun markFailed(jobId: String, reason: String) {
            update(jobId) {
                it.copy(
                    status = SmsJobStatus.FAILED,
                    error = reason
                )
            }
        }

        override suspend fun markReconciliationRequired(
            jobId: String,
            reason: String
        ): Boolean {
            val current = get(jobId) ?: return false
            if (current.status != SmsJobStatus.SENDING) return false

            update(jobId) {
                it.copy(
                    status = SmsJobStatus.RECONCILIATION_REQUIRED,
                    error = reason
                )
            }
            return true
        }

        private fun update(jobId: String, transform: (SmsJob) -> SmsJob) {
            jobs.value = jobs.value.map {
                if (it.id == jobId) transform(it) else it
            }
        }
    }
}
