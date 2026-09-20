package com.smsgateway.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [SmsJobEntity::class],
    version = 1,
    exportSchema = true
)
abstract class SmsGatewayDatabase : RoomDatabase() {
    abstract fun smsJobDao(): SmsJobDao

    companion object {
        @Volatile
        private var instance: SmsGatewayDatabase? = null

        fun getInstance(context: Context): SmsGatewayDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    SmsGatewayDatabase::class.java,
                    "sms-gateway.db"
                ).build().also { instance = it }
            }
    }
}
