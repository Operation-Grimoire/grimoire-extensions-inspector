package io.grimoire.extension.inspectorfixture

import io.grimoire.api.model.lang.Language
import io.grimoire.api.model.novel.Novel
import io.grimoire.api.source.SourceInfo
import io.grimoire.api.source.http.HttpSource

/** Controlled discovery input; never packaged in the Inspector application. */
@SourceInfo(name = "Inspector fixture", lang = Language.EN, baseUrl = "https://fixture.invalid", versionCode = 73)
class InspectorDiscoveryFixture : HttpSource() {
    override val name = "Inspector fixture"
    override val lang = Language.EN
    override val baseUrl = "https://fixture.invalid"
    override suspend fun getNovelDetails(novel: Novel): Novel = novel.copy(initialized = true)
}
