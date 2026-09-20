package com.smsgateway.app.validation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SmsInputValidatorTest {

    @Test
    fun `accepts a valid Peruvian mobile number`() {
        val result = SmsInputValidator.validate(
            phone = "+51987654321",
            message = "Prueba SMS"
        )

        assertNull(result)
    }

    @Test
    fun `normalizes spaces and separators in phone number`() {
        assertEquals(
            "+51987654321",
            SmsInputValidator.normalizePhone("+51 987-654-321")
        )
    }

    @Test
    fun `rejects an empty message`() {
        val result = SmsInputValidator.validate(
            phone = "+51987654321",
            message = "   "
        )

        assertEquals("El mensaje no puede estar vacío", result)
    }

    @Test
    fun `rejects messages longer than sprint one limit`() {
        val result = SmsInputValidator.validate(
            phone = "+51987654321",
            message = "a".repeat(161)
        )

        assertEquals("Sprint 1 admite mensajes de hasta 160 caracteres", result)
    }
}
