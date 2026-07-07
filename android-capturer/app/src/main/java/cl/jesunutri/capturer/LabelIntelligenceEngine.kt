package cl.jesunutri.capturer

import java.text.Normalizer
import java.time.LocalDate
import java.time.YearMonth
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

class LabelIntelligenceEngine {
    private val observations = ArrayDeque<FrameObservation>()
    private val maxFrames = 14

    fun reset() {
        observations.clear()
    }

    fun observe(barcodes: List<BarcodeHit>, ocrText: String): LabelScanResult {
        observations.addLast(FrameObservation(barcodes, ocrText, System.currentTimeMillis()))
        while (observations.size > maxFrames) observations.removeFirst()
        return buildResult()
    }

    private fun buildResult(): LabelScanResult {
        val allText = observations.joinToString("\n") { it.ocrText }
        val cleanedText = normalizeOcrText(allText)
        val barcodeCandidates = observations.flatMap { it.barcodes }
            .filter { it.rawValue.isNotBlank() }
        val bestBarcode = barcodeCandidates
            .groupingBy { normalizeCode(it.rawValue) }
            .eachCount()
            .maxByOrNull { it.value }
            ?.let { entry -> barcodeCandidates.lastOrNull { normalizeCode(it.rawValue) == entry.key } }

        val rawCode = bestBarcode?.rawValue.orEmpty()
        val normalizedCode = normalizeCode(rawCode)
        val barcodeFormat = bestBarcode?.format.orEmpty()
        val gs1 = parseGs1(rawCode)
        val codeType = when {
            gs1.isNotEmpty() -> "GS1"
            normalizedCode.length == 14 -> "DUN-14"
            normalizedCode.length == 13 -> "EAN-13"
            normalizedCode.length == 12 -> "UPC-A"
            normalizedCode.isNotBlank() -> "codigo"
            else -> ""
        }
        val gtin = gs1["01"] ?: normalizedCode.takeIf { it.length in 8..14 }.orEmpty()

        val lotFromText = extractLot(cleanedText)
        val expiryFromText = extractDateNearKeywords(cleanedText, expiryKeywords)
        val mfgFromText = extractDateNearKeywords(cleanedText, mfgKeywords)
        val quantityFromText = extractQuantity(cleanedText)
        val presentation = extractPresentation(cleanedText)
        val name = extractSuggestedName(cleanedText, presentation)

        val lot = gs1["10"] ?: lotFromText
        val expiry = gs1["17"]?.let(::parseGs1Date).orEmpty().ifBlank { expiryFromText }
        val mfg = gs1["11"]?.let(::parseGs1Date).orEmpty().ifBlank { mfgFromText }
        val detectedQuantity = gs1["30"]?.toDoubleOrNull() ?: quantityFromText

        val sources = mutableMapOf<String, String>()
        if (normalizedCode.isNotBlank()) sources["code"] = "barcode"
        if (gtin.isNotBlank()) sources["gtin"] = if (gs1.containsKey("01")) "gs1" else "barcode"
        if (lot.isNotBlank()) sources["lot"] = if (gs1.containsKey("10")) "gs1" else "ocr"
        if (expiry.isNotBlank()) sources["expiry"] = if (gs1.containsKey("17")) "gs1" else "ocr"
        if (mfg.isNotBlank()) sources["mfgDate"] = if (gs1.containsKey("11")) "gs1" else "ocr"
        if (detectedQuantity != null) sources["quantity"] = if (gs1.containsKey("30")) "gs1" else "ocr"
        if (name.isNotBlank()) sources["suggestedName"] = "ocr"
        if (presentation.isNotBlank()) sources["presentation"] = "ocr"

        val stability = bestBarcode?.let { barcode ->
            barcodeCandidates.count { normalizeCode(it.rawValue) == normalizedCode }
        } ?: 0
        val filledFields = listOf(
            normalizedCode,
            gtin,
            lot,
            expiry,
            mfg,
            name,
            presentation
        ).count { it.isNotBlank() } + if (detectedQuantity != null) 1 else 0
        val confidence = min(0.99, 0.18 + stability * 0.09 + filledFields * 0.08 + if (gs1.isNotEmpty()) 0.18 else 0.0)
        val missing = buildList {
            if (normalizedCode.isBlank()) add("codigo")
            if (name.isBlank()) add("nombre")
            if (lot.isBlank()) add("lote")
            if (expiry.isBlank()) add("vencimiento")
            if (presentation.isBlank()) add("formato")
        }

        return LabelScanResult(
            codeRaw = rawCode,
            codeNormalized = normalizedCode,
            codeType = codeType,
            barcodeFormat = barcodeFormat,
            gtin = gtin,
            lot = lot,
            expiryDate = expiry,
            mfgDate = mfg,
            detectedQuantity = detectedQuantity,
            suggestedName = name,
            presentation = presentation,
            ocrText = cleanedText,
            gs1Payload = gs1,
            sources = sources,
            confidence = confidence,
            stableFrames = stability,
            missingFields = missing
        )
    }

    private fun parseGs1(raw: String): Map<String, String> {
        val text = raw.trim()
        if (text.isBlank()) return emptyMap()
        val visible = Regex("""\((\d{2,4})\)([^\(]+)""").findAll(text).associate { match ->
            match.groupValues[1] to match.groupValues[2].trim()
        }
        if (visible.isNotEmpty()) return visible.filterKeys { it in gs1KnownAis }

        val compact = text.replace("""[^A-Za-z0-9]""".toRegex(), "")
        if (compact.length < 8) return emptyMap()
        val result = linkedMapOf<String, String>()
        var index = 0
        while (index + 2 <= compact.length) {
            val ai = compact.substring(index, index + 2)
            when (ai) {
                "01" -> if (index + 16 <= compact.length) {
                    result["01"] = compact.substring(index + 2, index + 16)
                    index += 16
                } else index = compact.length
                "11", "15", "17" -> if (index + 8 <= compact.length) {
                    result[ai] = compact.substring(index + 2, index + 8)
                    index += 8
                } else index = compact.length
                "30", "37" -> {
                    val valueStart = index + 2
                    val next = findNextAi(compact, valueStart)
                    val valueEnd = if (next > valueStart) next else min(compact.length, valueStart + 8)
                    result[ai] = compact.substring(valueStart, valueEnd)
                    index = valueEnd
                }
                "10" -> {
                    val valueStart = index + 2
                    val next = findNextAi(compact, valueStart)
                    val valueEnd = if (next > valueStart) next else compact.length
                    result["10"] = compact.substring(valueStart, valueEnd).trim()
                    index = valueEnd
                }
                else -> index += 1
            }
        }
        return result
    }

    private fun findNextAi(text: String, start: Int): Int {
        for (i in start until text.length - 1) {
            val candidate = text.substring(i, i + 2)
            if (candidate in gs1VariableStopAis) return i
        }
        return -1
    }

    private fun parseGs1Date(value: String): String {
        if (!Regex("""\d{6}""").matches(value)) return ""
        val yy = value.substring(0, 2).toInt()
        val year = if (yy >= 70) 1900 + yy else 2000 + yy
        val month = value.substring(2, 4).toIntOrNull() ?: return ""
        val day = value.substring(4, 6).toIntOrNull() ?: return ""
        return runCatching { LocalDate.of(year, month, day).toString() }.getOrDefault("")
    }

    private fun extractLot(text: String): String {
        val patterns = listOf(
            Regex("""(?i)\b(?:LOTE|LOT|L\.?|L)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-/.]{2,18})"""),
            Regex("""(?i)\b([0O][1I]L[0O]\d{3,5})\b"""),
            Regex("""(?i)\b([A-Z]{1,3}\d{3,8}[A-Z0-9]{0,4})\b""")
        )
        val raw = patterns.firstNotNullOfOrNull { pattern ->
            pattern.find(text)?.groupValues?.getOrNull(1)
        }.orEmpty()
        return cleanupLot(raw)
    }

    private fun extractDateNearKeywords(text: String, keywords: List<String>): String {
        val normalized = text.replace("\n", " ")
        val keywordPattern = keywords.joinToString("|") { Regex.escape(it) }
        val withKeyword = Regex("""(?i)\b(?:$keywordPattern)\b\.?\s*[:\-]?\s*(.{0,34})""")
            .findAll(normalized)
            .mapNotNull { match -> extractBestDate(match.groupValues[1]) }
            .firstOrNull()
        if (withKeyword != null) return withKeyword

        val dateCandidates = Regex("""\b\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}\b|\b\d{8}\b|\b\d{6}\b|\b(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[A-Z]*\.?\s*\d{4}\b""")
            .findAll(text)
            .mapNotNull { extractBestDate(it.value) }
            .distinct()
            .toList()
        if (keywords == expiryKeywords) {
            return dateCandidates
                .mapNotNull { runCatching { LocalDate.parse(it) }.getOrNull() }
                .filter { it.isAfter(LocalDate.now().minusDays(15)) }
                .maxOrNull()
                ?.toString()
                .orEmpty()
        }
        return dateCandidates
            .mapNotNull { runCatching { LocalDate.parse(it) }.getOrNull() }
            .filter { it.isBefore(LocalDate.now().plusDays(30)) }
            .maxOrNull()
            ?.toString()
            .orEmpty()
    }

    private fun extractBestDate(fragment: String): String? {
        normalizeDateToken(fragment)?.let { return it }
        Regex("""\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}|\d{8}|\d{6}|(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[A-Z]*\.?\s*\d{4}""", RegexOption.IGNORE_CASE)
            .findAll(fragment)
            .forEach { match -> normalizeDateToken(match.value)?.let { return it } }
        return null
    }

    private fun normalizeDateToken(raw: String): String? {
        val token = raw.uppercase(Locale.ROOT)
            .replace("O", "0")
            .replace("I", "1")
            .replace("L", "1")
            .replace(",", " ")
            .trim()
        Regex("""^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$""").find(token)?.let { match ->
            val day = match.groupValues[1].toIntOrNull() ?: return null
            val month = match.groupValues[2].toIntOrNull() ?: return null
            val rawYear = match.groupValues[3].toIntOrNull() ?: return null
            val year = if (rawYear < 100) 2000 + rawYear else rawYear
            return runCatching { LocalDate.of(year, month, day).toString() }.getOrNull()
        }
        Regex("""^(\d{4})(\d{2})(\d{2})$""").find(token)?.let { match ->
            val year = match.groupValues[1].toIntOrNull() ?: return null
            val month = match.groupValues[2].toIntOrNull() ?: return null
            val day = match.groupValues[3].toIntOrNull() ?: return null
            return runCatching { LocalDate.of(year, month, day).toString() }.getOrNull()
        }
        Regex("""^(\d{2})(\d{2})(\d{2})$""").find(token)?.let { match ->
            val first = match.groupValues[1].toIntOrNull() ?: return null
            val second = match.groupValues[2].toIntOrNull() ?: return null
            val third = match.groupValues[3].toIntOrNull() ?: return null
            val gs1 = runCatching { LocalDate.of(2000 + first, second, third) }.getOrNull()
            if (gs1 != null && gs1.year in 2020..2099) return gs1.toString()
            return runCatching { LocalDate.of(2000 + third, second, first).toString() }.getOrNull()
        }
        Regex("""^(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[A-Z]*\.?\s*(\d{4})$""").find(token)?.let { match ->
            val month = monthMap[match.groupValues[1]] ?: return null
            val year = match.groupValues[2].toIntOrNull() ?: return null
            return runCatching { YearMonth.of(year, month).atEndOfMonth().toString() }.getOrNull()
        }
        return null
    }

    private fun extractQuantity(text: String): Double? {
        Regex("""(?i)\b(?:CONTENIDO|CANTIDAD|CAJA|MANGA|PACK)\b.{0,22}?(\d+(?:[.,]\d+)?)\s*(?:UN|UND|UNID|UNIDADES|KG|KGS|G|GR|L|LT|ML)\b""")
            .find(text)?.groupValues?.getOrNull(1)
            ?.replace(",", ".")
            ?.toDoubleOrNull()
            ?.let { return it }
        Regex("""(?i)\b(\d{1,3})\s*[Xx]\s*\d+(?:[.,]\d+)?\s*(?:G|GR|KG|KGS|L|LT|ML|UN|UND)\b""")
            .find(text)?.groupValues?.getOrNull(1)
            ?.toDoubleOrNull()
            ?.let { return it }
        return null
    }

    private fun extractPresentation(text: String): String {
        val candidates = mutableListOf<String>()
        Regex("""(?i)\b\d{1,3}\s*[Xx]\s*\d+(?:[.,]\d+)?\s*(?:KG|KGS|G|GR|LT|L|ML|UN|UND|UNID)\b""")
            .findAll(text)
            .mapTo(candidates) { it.value.trim() }
        Regex("""(?i)\b\d+(?:[.,]\d+)?\s*(?:KG|KGS|G|GR|LT|L|ML)\b""")
            .findAll(text)
            .mapTo(candidates) { it.value.trim() }
        Regex("""(?i)\b\d{1,3}\s*(?:UN|UND|UNID|UNIDADES)\b""")
            .findAll(text)
            .mapTo(candidates) { it.value.trim() }
        return candidates
            .map { it.uppercase(Locale.ROOT).replace(",", ".").replace(Regex("""\s+"""), " ") }
            .distinct()
            .maxByOrNull { scorePresentation(it) }
            .orEmpty()
    }

    private fun scorePresentation(value: String): Int {
        var score = value.length
        if (value.contains("X")) score += 40
        if (value.contains("KG") || value.contains("G")) score += 20
        if (value.contains("UN")) score -= 4
        return score
    }

    private fun extractSuggestedName(text: String, presentation: String): String {
        val lines = text.lines()
            .map { cleanupLine(it) }
            .filter { it.length >= 4 }
            .filterNot { line -> line.any { it.isDigit() } && line.count { it.isLetter() } < 4 }
            .filterNot { line -> metadataWords.any { line.contains(it, ignoreCase = true) } }
        val scored = lines.map { line ->
            val upper = line.uppercase(Locale.ROOT)
            var score = upper.length
            if (presentation.isNotBlank() && upper.contains(presentation.take(4))) score += 20
            if (productWords.any { upper.contains(it) }) score += 35
            if (upper == upper.filter { it.isLetterOrDigit() || it.isWhitespace() || it == '.' }) score += 5
            if (upper.length > 42) score -= 20
            upper to score
        }
        return scored.maxByOrNull { it.second }?.first
            ?.replace("LUCCHETT]", "LUCCHETTI")
            ?.replace("5009", "500G")
            ?.let { name ->
                if (presentation.isNotBlank() && !name.contains(presentation)) "$name $presentation" else name
            }
            ?.trim()
            .orEmpty()
    }

    private fun normalizeOcrText(raw: String): String {
        val withoutDiacritics = Normalizer.normalize(raw, Normalizer.Form.NFD)
            .replace("""\p{Mn}+""".toRegex(), "")
        return withoutDiacritics
            .replace("\u0000", "")
            .replace(Regex("""[ ]{2,}"""), " ")
            .lines()
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .distinct()
            .joinToString("\n")
            .uppercase(Locale.ROOT)
    }

    private fun cleanupLine(line: String): String {
        return line
            .replace(Regex("""[|_]+"""), " ")
            .replace(Regex("""\s+"""), " ")
            .trim()
    }

    private fun cleanupLot(value: String): String {
        return value.uppercase(Locale.ROOT)
            .replace(" ", "")
            .replace("O", "0")
            .replace("I", "1")
            .replace(Regex("""[^A-Z0-9\-/.]"""), "")
            .take(20)
    }

    private fun normalizeCode(value: String): String {
        return value.replace(Regex("""[\s()\-.]"""), "").uppercase(Locale.ROOT)
    }

    private data class FrameObservation(
        val barcodes: List<BarcodeHit>,
        val ocrText: String,
        val timeMs: Long
    )

    companion object {
        private val gs1KnownAis = setOf("01", "10", "11", "15", "17", "30", "37")
        private val gs1VariableStopAis = setOf("01", "10", "11", "15", "17", "30", "37")
        private val expiryKeywords = listOf("VENC", "VENCE", "VENCIMIENTO", "VTO", "EXP", "EXPIRA", "CONSUMIR ANTES DE", "V")
        private val mfgKeywords = listOf("ELAB", "ELABORACION", "F. ELABORACION", "FAB", "FABRICACION", "E")
        private val monthMap = mapOf(
            "ENE" to 1, "FEB" to 2, "MAR" to 3, "ABR" to 4, "MAY" to 5, "JUN" to 6,
            "JUL" to 7, "AGO" to 8, "SEP" to 9, "OCT" to 10, "NOV" to 11, "DIC" to 12
        )
        private val metadataWords = listOf(
            "LOTE", "VENC", "ELAB", "CODIGO", "CODE", "BARRA", "CONTENIDO", "NETO",
            "PESO", "FABRICADO", "ELABORADO", "SEREMI", "CONSERVE", "INGREDIENTES",
            "NUTRITION", "CALORIES", "SELECCIONADO"
        )
        private val productWords = listOf(
            "SEMOLA", "ARROZ", "ALMIDON", "MAIZ", "LASANA", "LASAGNA", "ESPIRALES",
            "PURE", "PAPAS", "TE", "MENTA", "CEYLAN", "CHUNO", "CHUCHoca".uppercase(Locale.ROOT),
            "POLENTA", "SHOT", "CHECK", "OREGANO", "ENTERO", "FARDO"
        )
    }
}
