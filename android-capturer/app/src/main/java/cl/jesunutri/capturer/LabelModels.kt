package cl.jesunutri.capturer

data class Product(
    val id: String,
    val name: String,
    val normalizedName: String = "",
    val baseUnit: String = ""
) {
    override fun toString(): String = name
}

data class BarcodeHit(
    val rawValue: String,
    val format: String
)

data class PackageRule(
    val packageType: String,
    val packageQuantity: Double?,
    val packageUnit: String,
    val baseUnit: String,
    val conversionFactor: Double?,
    val notes: String
)

data class ProductCodeLink(
    val id: String?,
    val productId: String,
    val productNameSnapshot: String = "",
    val codeRaw: String,
    val codeNormalized: String,
    val codeType: String,
    val gtin: String,
    val barcodeFormat: String,
    val detectedLot: String,
    val detectedExpiry: String,
    val detectedMfgDate: String,
    val detectedQuantity: Double?,
    val packageType: String,
    val packageQuantity: Double?,
    val packageUnit: String,
    val baseUnit: String,
    val conversionFactor: Double?,
    val conversionNotes: String,
    val labelTextOcr: String,
    val confidence: Double
)

data class LabelScanResult(
    val codeRaw: String = "",
    val codeNormalized: String = "",
    val codeType: String = "",
    val barcodeFormat: String = "",
    val gtin: String = "",
    val lot: String = "",
    val expiryDate: String = "",
    val mfgDate: String = "",
    val detectedQuantity: Double? = null,
    val suggestedName: String = "",
    val presentation: String = "",
    val dominantColor: String = "",
    val ocrText: String = "",
    val gs1Payload: Map<String, String> = emptyMap(),
    val sources: Map<String, String> = emptyMap(),
    val confidence: Double = 0.0,
    val stableFrames: Int = 0,
    val missingFields: List<String> = emptyList(),
    val updatedAtMs: Long = System.currentTimeMillis()
) {
    val hasUsefulData: Boolean
        get() = codeNormalized.isNotBlank() ||
            lot.isNotBlank() ||
            expiryDate.isNotBlank() ||
            mfgDate.isNotBlank() ||
            presentation.isNotBlank()
}
