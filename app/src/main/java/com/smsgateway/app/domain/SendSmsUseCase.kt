package com.smsgateway.app.domain

class SendSmsUseCase(
    private val store: SmsJobStore,
    private val transport: SmsTransport,
    private val now: () -> Long = System::currentTimeMillis
) {
    suspend fun execute(request: SmsJobRequest): SmsDispatchResult {
        val job = SmsJob(
            id = request.id,
            destination = request.destination,
            message = request.message,
            status = SmsJobStatus.QUEUED,
            attempts = 0,
            createdAt = now(),
            sentAt = null,
            deliveredAt = null,
            error = null
        )

        if (!store.insertIfAbsent(job)) {
            return SmsDispatchResult.Duplicate(job.id)
        }

        return try {
            store.markSending(job.id)
            transport.send(
                job.copy(
                    status = SmsJobStatus.SENDING,
                    attempts = 1
                )
            )
            SmsDispatchResult.Accepted(job.id)
        } catch (exception: Exception) {
            val reason = exception.message ?: "No se pudo iniciar el envío"
            store.markFailed(job.id, reason)
            SmsDispatchResult.Failed(job.id, reason)
        }
    }
}
