package com.onyxnotes.dev

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Secure storage using Android's EncryptedSharedPreferences.
 * 
 * Uses Android Keystore to encrypt all data at rest.
 * Keys are hardware-backed on supported devices.
 */
object SecureStorage {
    private const val PREFS_FILE_NAME = "onyx_secure_prefs"
    
    @Volatile
    private var encryptedPrefs: SharedPreferences? = null
    
    /**
     * Get or create the encrypted SharedPreferences instance.
     */
    private fun getEncryptedPrefs(context: Context): SharedPreferences {
        return encryptedPrefs ?: synchronized(this) {
            encryptedPrefs ?: createEncryptedPrefs(context).also { encryptedPrefs = it }
        }
    }
    
    private fun createEncryptedPrefs(context: Context): SharedPreferences {
        // Create a master key using AES256-GCM
        // This key is stored in Android Keystore (hardware-backed on supported devices)
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        
        return EncryptedSharedPreferences.create(
            context,
            PREFS_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }
    
    /**
     * Store a value securely.
     */
    fun set(context: Context, key: String, value: String) {
        getEncryptedPrefs(context).edit().putString(key, value).apply()
    }
    
    /**
     * Retrieve a value securely.
     */
    fun get(context: Context, key: String): String? {
        return getEncryptedPrefs(context).getString(key, null)
    }
    
    /**
     * Delete a value.
     */
    fun delete(context: Context, key: String) {
        getEncryptedPrefs(context).edit().remove(key).apply()
    }
    
    /**
     * Clear all secure storage.
     */
    fun clear(context: Context) {
        getEncryptedPrefs(context).edit().clear().apply()
    }
}
