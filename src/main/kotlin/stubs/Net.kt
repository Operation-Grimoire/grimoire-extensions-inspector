package android.net

/** Compile-only type for WebResourceRequest.url; never read headlessly. */
class Uri(private val value: String) {
    override fun toString(): String = value
}
