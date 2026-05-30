package android.content

/** Minimal stub. The harness never constructs or calls into a Context (it never
 *  invokes NetworkContext.init), so this only needs to exist as a type. */
open class Context {
    val applicationContext: Context get() = this
}
