package io.grimoire.inspector.engine

import io.grimoire.api.network.NetworkContext

/**
 * Overrides the User-Agent the API's `UserAgentInterceptor` sends on every
 * request. Cloudflare binds `cf_clearance` to the User-Agent that solved the
 * challenge, so to reuse a cookie pasted from a real browser the harness must
 * send that browser's UA — otherwise CF rejects it.
 *
 * Headless, `NetworkContext` is never `init`'d, so `NetworkContext.userAgent`
 * resolves (and caches) its hardcoded Android fallback. There's no public
 * setter, so we poke the singleton's private `cachedUserAgent` field by
 * reflection: setting it makes the getter return our value; nulling it lets the
 * getter recompute the default. Kept here (not in the API repo) so the override
 * is purely a harness concern.
 */
object NetworkUa {

    private val field by lazy {
        NetworkContext::class.java.getDeclaredField("cachedUserAgent").apply { isAccessible = true }
    }

    @Volatile
    var isOverridden: Boolean = false
        private set

    /** Set the UA override; blank reverts to the default. */
    fun override(ua: String?) {
        val trimmed = ua?.trim().orEmpty()
        if (trimmed.isEmpty()) {
            clear()
            return
        }
        field.set(NetworkContext, trimmed)
        isOverridden = true
    }

    /** Drop the override; the next request recomputes the default UA. */
    fun clear() {
        field.set(NetworkContext, null)
        isOverridden = false
    }

    /** The UA that will actually be sent (resolves the default if not overridden). */
    fun effective(): String = NetworkContext.userAgent
}
