package android.os

/** Compile-only stubs — only referenced inside the Cloudflare WebView path,
 *  which is never reached headlessly. */
class Looper private constructor() {
    companion object {
        @JvmStatic
        fun getMainLooper(): Looper = Looper()
    }
}

class Handler(looper: Looper) {
    fun post(r: Runnable): Boolean = true
    fun postDelayed(r: Runnable, delayMillis: Long): Boolean = true
}
