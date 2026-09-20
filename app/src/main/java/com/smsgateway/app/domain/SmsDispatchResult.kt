package com.smsgateway.app.domain

sealed interface SmsDispatchResult {
    data class Accepted(val jobId: String) : SmsDispatchResult
    data class Duplicate(val jobId: String) : SmsDispatchResult
    data class Failed(val jobId: String, val reason: String) : SmsDispatchResult
}
