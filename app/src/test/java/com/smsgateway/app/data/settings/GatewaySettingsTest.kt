package com.smsgateway.app.data.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class GatewaySettingsTest {
    @Test
    fun `adds trailing slash to valid backend url`() {
        assertEquals(
            "http://127.0.0.1:3000/",
            normalizeServerUrl("http://127.0.0.1:3000")
        )
    }

    @Test
    fun `rejects url without http scheme`() {
        assertThrows(IllegalArgumentException::class.java) {
            normalizeServerUrl("127.0.0.1:3000")
        }
    }
}
