package com.smsgateway.app.validation

object SmsInputValidator {
    private val phoneRegex = Regex("^\\+?[1-9]\\d{7,14}$")

    fun validate(phone: String, message: String): String? {
        val normalizedPhone = normalizePhone(phone)

        if (!phoneRegex.matches(normalizedPhone)) {
            return "Ingresa un número válido, por ejemplo +51987654321"
        }

        if (message.isBlank()) {
            return "El mensaje no puede estar vacío"
        }

        if (message.length > 160) {
            return "Sprint 1 admite mensajes de hasta 160 caracteres"
        }

        return null
    }

    fun normalizePhone(phone: String): String =
        phone.filterNot { it.isWhitespace() || it == '-' || it == '(' || it == ')' }
}
