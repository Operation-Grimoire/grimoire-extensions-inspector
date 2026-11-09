package io.grimoire.api.network

/** Compatibility for Android-specific source code. Inspector never supplies a browser Context. */
object NetworkContext {
    val context: android.content.Context? get() = null
}
