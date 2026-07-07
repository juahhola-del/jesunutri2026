package cl.jesunutri.capturer

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.util.Base64
import android.util.Size
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : ComponentActivity() {
    private val engine = LabelIntelligenceEngine()
    private val analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val processingFrame = AtomicBoolean(false)
    private val scanner: BarcodeScanner = BarcodeScanning.getClient(
        BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS).build()
    )
    private val recognizer: TextRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    private lateinit var previewView: PreviewView
    private lateinit var serverInput: EditText
    private lateinit var statusView: TextView
    private lateinit var resultView: TextView
    private lateinit var productSelector: AutoCompleteTextView
    private lateinit var packageTypeSpinner: Spinner
    private lateinit var packageQuantityInput: EditText
    private lateinit var packageUnitInput: EditText
    private lateinit var baseUnitInput: EditText
    private lateinit var conversionFactorInput: EditText
    private lateinit var conversionNotesInput: EditText
    private lateinit var packageCountInput: EditText
    private lateinit var learnButton: Button
    private lateinit var intakeButton: Button
    private lateinit var finishSessionButton: Button
    private lateinit var modeGroup: RadioGroup

    private var camera: Camera? = null
    private var imageCapture: ImageCapture? = null
    private var backendClient: BackendClient? = null
    private var products: List<Product> = emptyList()
    private var selectedProduct: Product? = null
    private var currentResult = LabelScanResult()
    private var currentLink: ProductCodeLink? = null
    private var currentSessionId: String? = null
    private var lastAnalyzeAtMs = 0L
    private var lastLookupCode = ""
    private var isLearningMode = true

    private val cameraPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startCamera() else setStatus("Permiso de camara rechazado.")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        val savedServer = getPreferences(MODE_PRIVATE).getString("server_url", "") ?: ""
        serverInput.setText(savedServer.ifBlank { "http://192.168.1.132:8787" })
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            cameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        analysisExecutor.shutdown()
        scanner.close()
        recognizer.close()
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(248, 250, 252))
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(8))
            setBackgroundColor(Color.rgb(15, 23, 42))
        }
        header.addView(TextView(this).apply {
            text = "JESUnutri Capturador"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        })
        header.addView(TextView(this).apply {
            text = "Lector nativo con CameraX + ML Kit. No guarda base local ni modifica stock."
            setTextColor(Color.rgb(203, 213, 225))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        })
        root.addView(header)

        previewView = PreviewView(this).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
        root.addView(previewView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(330)))

        val scroll = ScrollView(this)
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(18))
        }
        scroll.addView(panel)

        serverInput = editText("Servidor principal, ej: http://192.168.1.132:8787")
        panel.addView(serverInput)
        panel.addView(buttonRow(
            button("Conectar") { connectBackend() },
            button("Limpiar lectura") { clearCurrentScan() }
        ))

        modeGroup = RadioGroup(this).apply {
            orientation = RadioGroup.HORIZONTAL
            setPadding(0, dp(8), 0, dp(8))
        }
        val learnRadio = RadioButton(this).apply {
            text = "Aprender"
            id = View.generateViewId()
            isChecked = true
        }
        val intakeRadio = RadioButton(this).apply {
            text = "Ingresar"
            id = View.generateViewId()
        }
        modeGroup.addView(learnRadio)
        modeGroup.addView(intakeRadio)
        modeGroup.setOnCheckedChangeListener { _, checkedId ->
            isLearningMode = checkedId == learnRadio.id
            updateModeVisibility()
        }
        panel.addView(modeGroup)

        statusView = TextView(this).apply {
            text = "Modo capturador. Conecta al backend principal para guardar aprendizajes o sesiones."
            setTextColor(Color.rgb(30, 41, 59))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(0, dp(6), 0, dp(8))
        }
        panel.addView(statusView)

        resultView = TextView(this).apply {
            setTextColor(Color.rgb(15, 23, 42))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setBackgroundColor(Color.rgb(226, 232, 240))
            setPadding(dp(10), dp(8), dp(10), dp(8))
            text = "Apunta la camara a una etiqueta o codigo."
        }
        panel.addView(resultView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        productSelector = AutoCompleteTextView(this).apply {
            hint = "Buscar producto del inventario"
            threshold = 1
            setSingleLine(false)
            setPadding(dp(10), dp(8), dp(10), dp(8))
        }
        productSelector.setOnItemClickListener { parent, _, position, _ ->
            selectedProduct = parent.getItemAtPosition(position) as? Product
            selectedProduct?.baseUnit?.takeIf { it.isNotBlank() }?.let { baseUnitInput.setText(it) }
        }
        panel.addView(productSelector)

        packageTypeSpinner = Spinner(this).apply {
            adapter = ArrayAdapter(
                this@MainActivity,
                android.R.layout.simple_spinner_dropdown_item,
                listOf("unidad", "caja", "manga", "pack", "pallet", "otro")
            )
        }
        panel.addView(labeled("Tipo de empaque detectado", packageTypeSpinner))

        val quantityRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        packageQuantityInput = editText("Cantidad contenida")
        packageUnitInput = editText("Unidad contenido")
        quantityRow.addView(packageQuantityInput, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        quantityRow.addView(packageUnitInput, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        panel.addView(quantityRow)

        val conversionRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        baseUnitInput = editText("Unidad base")
        conversionFactorInput = editText("Factor conversion")
        conversionRow.addView(baseUnitInput, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        conversionRow.addView(conversionFactorInput, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        panel.addView(conversionRow)

        conversionNotesInput = editText("Notas conversion")
        panel.addView(conversionNotesInput)

        learnButton = button("Aceptar y continuar") { saveLearning() }
        panel.addView(learnButton)

        packageCountInput = editText("Cantidad de cajas/mangas a ingresar")
        panel.addView(packageCountInput)
        intakeButton = button("Agregar a sesion pendiente") { addIntakeItem() }
        finishSessionButton = button("Finalizar sesion") { finishSession() }
        panel.addView(buttonRow(intakeButton, finishSessionButton))

        root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
        updateModeVisibility()
    }

    private fun updateModeVisibility() {
        learnButton.visibility = if (isLearningMode) View.VISIBLE else View.GONE
        productSelector.visibility = View.VISIBLE
        packageTypeSpinner.visibility = if (isLearningMode) View.VISIBLE else View.GONE
        packageQuantityInput.visibility = if (isLearningMode) View.VISIBLE else View.GONE
        packageUnitInput.visibility = if (isLearningMode) View.VISIBLE else View.GONE
        baseUnitInput.visibility = if (isLearningMode) View.VISIBLE else View.GONE
        conversionFactorInput.visibility = if (isLearningMode) View.VISIBLE else View.GONE
        conversionNotesInput.visibility = if (isLearningMode) View.VISIBLE else View.GONE
        packageCountInput.visibility = if (isLearningMode) View.GONE else View.VISIBLE
        intakeButton.visibility = if (isLearningMode) View.GONE else View.VISIBLE
        finishSessionButton.visibility = if (isLearningMode) View.GONE else View.VISIBLE
        selectedProduct = null
        currentLink = null
        lastLookupCode = ""
        productSelector.setText("", false)
        renderResult()
    }

    private fun startCamera() {
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener({
            val provider = providerFuture.get()
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }
            imageCapture = ImageCapture.Builder()
                .setTargetResolution(Size(1280, 720))
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                .build()
            val analysis = ImageAnalysis.Builder()
                .setTargetResolution(Size(1280, 720))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also { it.setAnalyzer(analysisExecutor, ::analyzeImage) }
            provider.unbindAll()
            camera = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture, analysis)
            camera?.cameraControl?.enableTorch(true)
            setStatus("Camara trasera activa. Linterna solicitada.")
        }, ContextCompat.getMainExecutor(this))
    }

    private fun analyzeImage(imageProxy: androidx.camera.core.ImageProxy) {
        val now = System.currentTimeMillis()
        if (now - lastAnalyzeAtMs < 650 || !processingFrame.compareAndSet(false, true)) {
            imageProxy.close()
            return
        }
        lastAnalyzeAtMs = now
        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            processingFrame.set(false)
            imageProxy.close()
            return
        }
        val input = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
        val barcodeTask = scanner.process(input)
        val textTask = recognizer.process(input)
        Tasks.whenAllComplete(barcodeTask, textTask)
            .addOnCompleteListener {
                try {
                    val barcodes = if (barcodeTask.isSuccessful) barcodeTask.result.orEmpty() else emptyList()
                    val barcodeHits = barcodes.mapNotNull { barcode ->
                        val raw = barcode.rawValue ?: barcode.displayValue ?: return@mapNotNull null
                        BarcodeHit(rawValue = raw, format = barcodeFormatName(barcode.format))
                    }
                    val text = if (textTask.isSuccessful) textTask.result?.text.orEmpty() else ""
                    val result = engine.observe(barcodeHits, text)
                    runOnUiThread { acceptResult(result) }
                } finally {
                    processingFrame.set(false)
                    imageProxy.close()
                }
            }
    }

    private fun acceptResult(result: LabelScanResult) {
        if (!result.hasUsefulData) return
        val previousCode = currentResult.codeNormalized
        currentResult = mergeResults(currentResult, result)
        renderResult()
        if (!isLearningMode && currentResult.codeNormalized.isNotBlank() && currentResult.codeNormalized != previousCode) {
            lookupCurrentCode()
        }
    }

    private fun mergeResults(previous: LabelScanResult, next: LabelScanResult): LabelScanResult {
        if (!previous.hasUsefulData) return next
        return next.copy(
            lot = next.lot.ifBlank { previous.lot },
            expiryDate = next.expiryDate.ifBlank { previous.expiryDate },
            mfgDate = next.mfgDate.ifBlank { previous.mfgDate },
            suggestedName = next.suggestedName.ifBlank { previous.suggestedName },
            presentation = next.presentation.ifBlank { previous.presentation },
            codeRaw = next.codeRaw.ifBlank { previous.codeRaw },
            codeNormalized = next.codeNormalized.ifBlank { previous.codeNormalized },
            codeType = next.codeType.ifBlank { previous.codeType },
            barcodeFormat = next.barcodeFormat.ifBlank { previous.barcodeFormat },
            gtin = next.gtin.ifBlank { previous.gtin },
            detectedQuantity = next.detectedQuantity ?: previous.detectedQuantity,
            ocrText = if (next.ocrText.length >= previous.ocrText.length) next.ocrText else previous.ocrText,
            sources = previous.sources + next.sources,
            confidence = maxOf(previous.confidence, next.confidence),
            missingFields = (previous.missingFields + next.missingFields).distinct()
        )
    }

    private fun connectBackend() {
        val url = serverInput.text.toString().trim()
        if (url.isBlank()) {
            setStatus("Ingresa la direccion del servidor principal.")
            return
        }
        lifecycleScope.launch(Dispatchers.IO) {
            runCatching {
                val client = BackendClient(url)
                client.health()
                val loadedProducts = client.loadProducts()
                backendClient = client
                products = loadedProducts
                getPreferences(MODE_PRIVATE).edit().putString("server_url", url).apply()
                withContext(Dispatchers.Main) {
                    productSelector.setAdapter(ArrayAdapter(this@MainActivity, android.R.layout.simple_dropdown_item_1line, products))
                    setStatus("Modo capturador conectado. Productos cargados: ${products.size}.")
                    if (!isLearningMode) lookupCurrentCode()
                }
            }.onFailure { error ->
                withContext(Dispatchers.Main) { setStatus("No se pudo conectar: ${error.message}") }
            }
        }
    }

    private fun lookupCurrentCode() {
        val code = currentResult.codeNormalized
        val client = backendClient ?: return
        if (code.isBlank() || code == lastLookupCode) return
        lastLookupCode = code
        lifecycleScope.launch(Dispatchers.IO) {
            runCatching {
                val link = client.lookupLink(code)
                withContext(Dispatchers.Main) {
                    currentLink = link
                    if (link != null) {
                        selectedProduct = products.firstOrNull { it.id == link.productId }
                        productSelector.setText(selectedProduct?.name ?: "Producto vinculado", false)
                        setStatus("Codigo aprendido. Ingresa cantidad de ${link.packageType.ifBlank { "empaques" }}.")
                    } else {
                        productSelector.setText("", false)
                        setStatus("Producto no vinculado. Cambia a Aprender para entrenar esta etiqueta.")
                    }
                    renderResult()
                }
            }.onFailure { error ->
                withContext(Dispatchers.Main) { setStatus("No se pudo consultar codigo: ${error.message}") }
            }
        }
    }

    private fun saveLearning() {
        val client = backendClient
        val product = selectedProduct
        if (client == null) {
            setStatus("Conecta al backend principal primero.")
            return
        }
        if (product == null) {
            setStatus("Selecciona el producto correcto.")
            return
        }
        if (currentResult.codeNormalized.isBlank()) {
            setStatus("Aun no hay codigo detectado para aprender.")
            return
        }
        val rule = readPackageRule() ?: return
        setStatus("Guardando aprendizaje e imagen en el backend principal...")
        captureImageDataUrl { dataUrl ->
            lifecycleScope.launch(Dispatchers.IO) {
                runCatching {
                    client.saveProductCodeLink(currentResult, product, rule, dataUrl, "android-capturer")
                    withContext(Dispatchers.Main) {
                        setStatus("Producto aprendido. Listo para la siguiente etiqueta.")
                        clearCurrentScan()
                    }
                }.onFailure { error ->
                    withContext(Dispatchers.Main) { setStatus("No se pudo guardar: ${error.message}") }
                }
            }
        }
    }

    private fun addIntakeItem() {
        val client = backendClient
        val link = currentLink
        if (client == null) {
            setStatus("Conecta al backend principal primero.")
            return
        }
        if (link == null) {
            setStatus("Este codigo no esta aprendido. Primero aprende la etiqueta.")
            return
        }
        val count = packageCountInput.text.toString().replace(",", ".").toDoubleOrNull()
        if (count == null || count <= 0.0) {
            setStatus("Ingresa cantidad de cajas, mangas o packs.")
            return
        }
        lifecycleScope.launch(Dispatchers.IO) {
            runCatching {
                val sessionId = currentSessionId ?: client.createScanSession("android-capturer", "capturador@local").also {
                    currentSessionId = it
                }
                val product = products.firstOrNull { it.id == link.productId }
                client.addSessionItem(sessionId, currentResult, link, product, count)
                withContext(Dispatchers.Main) {
                    setStatus("Item agregado a sesion pendiente. Sigue con el siguiente producto.")
                    packageCountInput.setText("")
                    clearCurrentScan()
                }
            }.onFailure { error ->
                withContext(Dispatchers.Main) { setStatus("No se pudo agregar ingreso: ${error.message}") }
            }
        }
    }

    private fun finishSession() {
        val client = backendClient
        val sessionId = currentSessionId
        if (client == null || sessionId == null) {
            setStatus("No hay sesion activa para finalizar.")
            return
        }
        lifecycleScope.launch(Dispatchers.IO) {
            runCatching {
                client.submitSession(sessionId)
                currentSessionId = null
                withContext(Dispatchers.Main) {
                    setStatus("Sesion enviada a revision. La aprobacion queda en la tablet/admin.")
                    clearCurrentScan()
                }
            }.onFailure { error ->
                withContext(Dispatchers.Main) { setStatus("No se pudo finalizar: ${error.message}") }
            }
        }
    }

    private fun captureImageDataUrl(callback: (String?) -> Unit) {
        val capture = imageCapture
        if (capture == null) {
            callback(null)
            return
        }
        val file = File(cacheDir, "label-${System.currentTimeMillis()}.jpg")
        val options = ImageCapture.OutputFileOptions.Builder(file).build()
        capture.takePicture(options, ContextCompat.getMainExecutor(this), object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                runCatching {
                    val bytes = file.readBytes()
                    "data:image/jpeg;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
                }.onSuccess { dataUrl ->
                    file.delete()
                    callback(dataUrl)
                }.onFailure {
                    file.delete()
                    callback(null)
                }
            }

            override fun onError(exception: ImageCaptureException) {
                callback(null)
            }
        })
    }

    private fun readPackageRule(): PackageRule? {
        val quantity = packageQuantityInput.text.toString().replace(",", ".").toDoubleOrNull()
        val factor = conversionFactorInput.text.toString().replace(",", ".").toDoubleOrNull()
        val unit = packageUnitInput.text.toString().trim()
        val baseUnit = baseUnitInput.text.toString().trim()
        if (quantity == null || quantity <= 0.0) {
            setStatus("No se asume cantidad 1. Ingresa la cantidad contenida del empaque.")
            return null
        }
        if (unit.isBlank() || baseUnit.isBlank()) {
            setStatus("Completa unidad de contenido y unidad base.")
            return null
        }
        if (factor == null || factor <= 0.0) {
            setStatus("Completa el factor de conversion hacia la unidad base.")
            return null
        }
        return PackageRule(
            packageType = packageTypeSpinner.selectedItem?.toString().orEmpty(),
            packageQuantity = quantity,
            packageUnit = unit,
            baseUnit = baseUnit,
            conversionFactor = factor,
            notes = conversionNotesInput.text.toString().trim()
        )
    }

    private fun clearCurrentScan() {
        engine.reset()
        currentResult = LabelScanResult()
        currentLink = null
        lastLookupCode = ""
        selectedProduct = null
        productSelector.setText("", false)
        resultView.text = "Apunta la camara a una etiqueta o codigo."
    }

    private fun renderResult() {
        val result = currentResult
        val link = currentLink
        val lines = mutableListOf<String>()
        lines += "Codigo: ${result.codeNormalized.ifBlank { "sin lectura" }}"
        if (result.barcodeFormat.isNotBlank()) lines += "Formato: ${result.barcodeFormat} / ${result.codeType}"
        if (result.gtin.isNotBlank()) lines += "GTIN/EAN/DUN: ${result.gtin}"
        if (result.suggestedName.isNotBlank()) lines += "Nombre leido: ${result.suggestedName}"
        if (result.presentation.isNotBlank()) lines += "Presentacion: ${result.presentation}"
        lines += "Lote: ${result.lot.ifBlank { "pendiente" }}"
        lines += "Vencimiento: ${result.expiryDate.ifBlank { "pendiente" }}"
        if (result.mfgDate.isNotBlank()) lines += "Elaboracion: ${result.mfgDate}"
        if (link != null) {
            lines += "Producto vinculado: ${products.firstOrNull { it.id == link.productId }?.name ?: link.productId}"
            lines += "Empaque: ${link.packageType} ${link.packageQuantity ?: ""} ${link.packageUnit} -> factor ${link.conversionFactor ?: ""} ${link.baseUnit}"
        } else if (!isLearningMode && result.codeNormalized.isNotBlank()) {
            lines += "Producto no vinculado"
        }
        lines += "Confianza: ${"%.0f".format(Locale.ROOT, result.confidence * 100)}%"
        if (result.missingFields.isNotEmpty()) lines += "Falta: ${result.missingFields.joinToString(", ")}"
        resultView.text = lines.joinToString("\n")
    }

    private fun setStatus(message: String) {
        statusView.text = message
    }

    private fun editText(hintText: String): EditText {
        return EditText(this).apply {
            hint = hintText
            setSingleLine(false)
            setPadding(dp(10), dp(8), dp(10), dp(8))
            setTextColor(Color.rgb(15, 23, 42))
            setHintTextColor(Color.rgb(100, 116, 139))
        }
    }

    private fun button(label: String, onClick: () -> Unit): Button {
        return Button(this).apply {
            text = label
            isAllCaps = false
            setOnClickListener { onClick() }
        }
    }

    private fun buttonRow(vararg buttons: Button): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            buttons.forEach { button ->
                addView(button, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            }
        }
    }

    private fun labeled(label: String, view: View): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(this@MainActivity).apply {
                text = label
                setTextColor(Color.rgb(71, 85, 105))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            })
            addView(view)
        }
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()
    }

    private fun barcodeFormatName(format: Int): String {
        return when (format) {
            Barcode.FORMAT_CODE_128 -> "CODE_128"
            Barcode.FORMAT_CODE_39 -> "CODE_39"
            Barcode.FORMAT_CODE_93 -> "CODE_93"
            Barcode.FORMAT_CODABAR -> "CODABAR"
            Barcode.FORMAT_DATA_MATRIX -> "DATA_MATRIX"
            Barcode.FORMAT_EAN_13 -> "EAN_13"
            Barcode.FORMAT_EAN_8 -> "EAN_8"
            Barcode.FORMAT_ITF -> "ITF"
            Barcode.FORMAT_QR_CODE -> "QR"
            Barcode.FORMAT_UPC_A -> "UPC_A"
            Barcode.FORMAT_UPC_E -> "UPC_E"
            Barcode.FORMAT_PDF417 -> "PDF417"
            Barcode.FORMAT_AZTEC -> "AZTEC"
            else -> "BARCODE"
        }
    }
}
