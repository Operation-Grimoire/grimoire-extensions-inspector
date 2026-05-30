package io.grimoire.inspector

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.ProgramResult
import com.github.ajalt.clikt.core.subcommands
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.types.choice
import com.github.ajalt.clikt.parameters.types.int
import io.grimoire.inspector.engine.Inspector
import io.grimoire.inspector.engine.RunReport
import io.grimoire.inspector.engine.Severity
import io.grimoire.inspector.engine.SourceOps
import io.grimoire.inspector.web.startServer
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val json = Json { prettyPrint = true; encodeDefaults = true }

private class Root : CliktCommand(name = "inspector") {
    override fun run() = Unit
}

private class ListCmd : CliktCommand(name = "list") {
    private val asJson by option("--json").flag()
    override fun run() {
        val sources = SourceDiscovery.discover()
        if (asJson) {
            echo(json.encodeToString(sources.map { SourceOps(it).meta() }))
        } else {
            echo("Discovered ${sources.size} source(s):")
            sources.forEach {
                val caps = SourceOps(it).capabilities().joinToString(",")
                echo("  [${it.id}] ${it.name} (${it.lang})  ${it.baseUrl}  {$caps}")
            }
        }
    }
}

private class RunCmd : CliktCommand(name = "run") {
    private val source by option("--source", help = "id, exact name, or name substring")
    @Suppress("unused")
    private val all by option("--all", help = "inspect every source (the default)").flag()
    private val lang by option("--lang")
    private val query by option("--query").default("the")
    private val timeout by option("--timeout", help = "per-call timeout, seconds").int().default(30)
    private val concurrency by option("--concurrency", help = "parallel chapter-page fetches (1 = sequential)").int().default(1)
    private val offline by option("--offline").flag()
    private val asJson by option("--json").flag()
    private val failOn by option("--fail-on").choice("warn", "error", "never").default("error")

    override fun run() {
        var sources = SourceDiscovery.discover()
        source?.let { sel ->
            sources = sources.filter {
                it.id.toString() == sel || it.name.equals(sel, true) || it.name.contains(sel, true)
            }
        }
        lang?.let { l -> sources = sources.filter { it.lang.equals(l, true) } }

        if (sources.isEmpty()) {
            echo("No sources matched.", err = true)
            throw ProgramResult(2)
        }

        val report = runBlocking { Inspector(query, timeout * 1000L, offline, concurrency).run(sources) }
        if (asJson) echo(json.encodeToString(report)) else printHuman(report)

        val fail = when (failOn) {
            "never" -> false
            "warn" -> report.totals.warnings > 0 || report.totals.errors > 0
            else -> report.totals.errors > 0
        }
        if (fail) throw ProgramResult(1)
    }

    private fun printHuman(report: RunReport) {
        echo("Inspected ${report.totals.sources} source(s) in ${report.durationMs}ms - " +
            "${report.totals.errors} error(s), ${report.totals.warnings} warning(s)\n")
        report.sources.forEach { sr ->
            val mark = if (sr.ok) "OK " else "ERR"
            echo("[$mark] ${sr.source.name} (${sr.source.lang})  errors=${sr.errors} warnings=${sr.warnings}")
            sr.stages.forEach { st ->
                val glyph = when (st.status) {
                    "ok", "info" -> "  ."
                    "warn" -> "  ~"
                    "error" -> "  X"
                    "skipped" -> "  -"
                    else -> "  ?"
                }
                val counts = if (st.counts.isNotEmpty()) " " + st.counts.entries.joinToString { "${it.key}=${it.value}" } else ""
                echo("$glyph ${st.stage.padEnd(14)} ${st.status}${counts}")
                st.diagnostics
                    .filter { it.severity != Severity.INFO }
                    .forEach { echo("        ${it.severity} ${it.code}: ${it.message}") }
            }
            echo("")
        }
    }
}

private class ServeCmd : CliktCommand(name = "serve") {
    private val port by option("--port").int().default(8080)
    override fun run() {
        echo("Discovering sources…")
        val sources = SourceDiscovery.discover()
        echo("Serving ${sources.size} source(s) at http://localhost:$port")
        startServer(port, sources)
    }
}

fun main(args: Array<String>) =
    Root().subcommands(ListCmd(), RunCmd(), ServeCmd()).main(args)
