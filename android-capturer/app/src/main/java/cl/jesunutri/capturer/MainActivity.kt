package cl.jesunutri.capturer

import android.Manifest
import android.content.res.ColorStateList
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.media.Image
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputType
import android.text.InputFilter
import android.text.TextWatcher
import android.util.Base64
import android.util.Size
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.AdapterView
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
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
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.Normalizer
import java.time.LocalDate
import java.time.YearMonth
import java.util.Locale
import java.util.UUID
import kotlin.math.roundToInt
import java.util.concurrent.TimeUnit
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

    private lateinit var cameraHost: FrameLayout
    private lateinit var previewView: PreviewView
    private lateinit var openCameraButton: Button
    private lateinit var cameraCollapsedLabel: TextView
    private lateinit var serverInput: EditText
    private lateinit var connectionRow: LinearLayout
    private lateinit var cameraControlsRow: LinearLayout
    private lateinit var scrollView: ScrollView
    private lateinit var statusView: TextView
    private lateinit var backendIndicator: TextView
    private lateinit var resultView: TextView
    private lateinit var editorContainer: LinearLayout
    private lateinit var editorHintView: TextView
    private lateinit var productSelector: AutoCompleteTextView
    private lateinit var codeInput: EditText
    private lateinit var labelNameInput: EditText
    private lateinit var presentationInput: EditText
    private lateinit var visualColorInput: EditText
    private lateinit var lotInput: EditText
    private lateinit var expiryDayInput: EditText
    private lateinit var expiryMonthInput: EditText
    private lateinit var expiryYearSpinner: Spinner
    private lateinit var mfgDayInput: EditText
    private lateinit var mfgMonthInput: EditText
    private lateinit var mfgYearSpinner: Spinner
    private lateinit var lotOtherSideCheck: CheckBox
    private lateinit var expiryOtherSideCheck: CheckBox
    private lateinit var mfgOtherSideCheck: CheckBox
    private lateinit var packageTypeSpinner: Spinner
    private lateinit var packageSectionLabel: TextView
    private lateinit var packageRow: LinearLayout
    private lateinit var conversionRow: LinearLayout
    private lateinit var packageQuantityInput: EditText
    private lateinit var packageUnitInput: EditText
    private lateinit var baseUnitInput: EditText
    private lateinit var conversionFactorInput: EditText
    private lateinit var conversionNotesInput: EditText
    private lateinit var packageCountInput: EditText
    private lateinit var learnButton: Button
    private lateinit var bottomActionBar: LinearLayout
    private lateinit var intakeButton: Button
    private lateinit var finishSessionButton: Button
    private lateinit var modeGroup: RadioGroup
    private lateinit var torchButton: Button

    private var camera: Camera? = null
    private var cameraProvider: ProcessCameraProvider? = null
    private var imageCapture: ImageCapture? = null
    private var backendClient: BackendClient? = null
    private var backendConnected = false
    private var backendConnecting = false
    private var products: List<Product> = emptyList()
    private var productLinks: List<ProductCodeLink> = emptyList()
    private var selectedProduct: Product? = null
    private var currentResult = LabelScanResult()
    private var currentLink: ProductCodeLink? = null
    private var currentSessionId: String? = null
    private var lastAnalyzeAtMs = 0L
    private var lastLookupCode = ""
    private var isLearningMode = true
    private var editorOpen = false
    private var scanWindowStartedAtMs = 0L
    private var lastAutoFocusAtMs = 0L
    private var torchEnabled = false
    private var pendingLabelImageDataUrl: String? = null
    private var suppressDateAutoAdvance = false
    private var activeDateInput: EditText? = null
    private var activeDatePad: LinearLayout? = null
    private val datePadHandler = Handler(Looper.getMainLooper())
    private val hideDatePadRunnable = Runnable { hideDatePad() }
    private val backendHandler = Handler(Looper.getMainLooper())
    private val backendRetryRunnable = object : Runnable {
        override fun run() {
            connectBackend(auto = true)
            backendHandler.postDelayed(this, 8000L)
        }
    }
    private val nextDateInput = mutableMapOf<EditText, EditText?>()
    private val datePadByInput = mutableMapOf<EditText, LinearLayout>()
    private var simulationRequested = false
    private var simulationStarted = false
    private val offlineQueueDir: File by lazy { File(filesDir, "offline-capturer-queue").apply { mkdirs() } }

    private val cameraPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startCamera() else setStatus("Permiso de camara rechazado.")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        val launchServer = intent.getStringExtra("server_url").orEmpty()
        simulationRequested = intent.getBooleanExtra("simulate_label", false)
        val savedServer = getPreferences(MODE_PRIVATE).getString("server_url", "") ?: ""
        serverInput.setText(launchServer.ifBlank { savedServer.ifBlank { "http://192.168.1.132:8787" } })
        loadCachedProducts()
        loadCachedLinks()
        if (products.isNotEmpty()) updateProductAdapter(products)
        setBackendConnected(false)
        setOfflineReadyStatus()
        serverInput.post {
            connectBackend(auto = true)
            startBackendMonitor()
        }
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
        backendHandler.removeCallbacks(backendRetryRunnable)
        datePadHandler.removeCallbacks(hideDatePadRunnable)
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(9, 13, 20))
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), statusBarHeight() + dp(8), dp(12), dp(8))
            setBackgroundColor(Color.rgb(9, 13, 20))
        }
        val headerTop = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        headerTop.addView(TextView(this).apply {
            text = "Jesunutri"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        backendIndicator = TextView(this).apply {
            text = "\u25CF"
            setTextColor(Color.rgb(107, 114, 128))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            gravity = Gravity.CENTER
            setPadding(dp(8), 0, dp(4), 0)
        }
        headerTop.addView(backendIndicator, LinearLayout.LayoutParams(dp(36), LinearLayout.LayoutParams.WRAP_CONTENT))
        header.addView(headerTop)
        header.addView(TextView(this).apply {
            text = "Capturador de etiquetas. Guarda local y sincroniza con la tablet."
            setTextColor(Color.rgb(203, 213, 225))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        })
        root.addView(header)

        cameraHost = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(17, 24, 39))
        }
        previewView = PreviewView(this).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
            setOnTouchListener { _, event ->
                if (event.action == MotionEvent.ACTION_UP) {
                    focusAt(event.x, event.y)
                }
                true
            }
        }
        cameraHost.addView(previewView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        cameraCollapsedLabel = TextView(this).apply {
            text = "Editando"
            setTextColor(Color.rgb(203, 213, 225))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(dp(12), 0, dp(12), 0)
            gravity = Gravity.CENTER_VERTICAL
            visibility = View.GONE
        }
        cameraHost.addView(
            cameraCollapsedLabel,
            FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.START or Gravity.CENTER_VERTICAL)
        )
        openCameraButton = button("Abrir") {
            clearCurrentScan()
            expandCamera()
        }.apply {
            visibility = View.GONE
            textSize = 13f
            setCompoundDrawablesWithIntrinsicBounds(android.R.drawable.ic_menu_camera, 0, 0, 0)
            compoundDrawablePadding = dp(6)
        }
        cameraHost.addView(
            openCameraButton,
            FrameLayout.LayoutParams(dp(104), dp(36), Gravity.END or Gravity.CENTER_VERTICAL).apply {
                setMargins(dp(8), dp(5), dp(10), dp(5))
            }
        )
        root.addView(cameraHost, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(330)))

        val scroll = ScrollView(this)
        scrollView = scroll
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(18))
            setBackgroundColor(Color.rgb(9, 13, 20))
        }
        scroll.addView(panel)

        serverInput = editText("Servidor principal, ej: http://192.168.1.132:8787")
        panel.addView(serverInput)
        connectionRow = buttonRow(
            button("Conectar") { connectBackend() },
            button("Limpiar lectura") { clearCurrentScan() }
        )
        panel.addView(connectionRow)
        torchButton = button("Linterna off") { toggleTorch() }
        cameraControlsRow = buttonRow(
            button("Enfocar") { focusAtCenter() },
            torchButton
        )
        panel.addView(cameraControlsRow)

        modeGroup = RadioGroup(this).apply {
            orientation = RadioGroup.HORIZONTAL
            setPadding(0, dp(8), 0, dp(8))
        }
        val learnRadio = RadioButton(this).apply {
            text = "Aprender"
            id = View.generateViewId()
            isChecked = true
            setTextColor(Color.rgb(203, 213, 225))
            buttonTintList = ColorStateList.valueOf(Color.rgb(79, 140, 255))
        }
        val intakeRadio = RadioButton(this).apply {
            text = "Ingresar"
            id = View.generateViewId()
            setTextColor(Color.rgb(203, 213, 225))
            buttonTintList = ColorStateList.valueOf(Color.rgb(79, 140, 255))
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
            setTextColor(Color.rgb(203, 213, 225))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(0, dp(6), 0, dp(8))
        }
        panel.addView(statusView)

        resultView = TextView(this).apply {
            setTextColor(Color.rgb(237, 243, 251))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setBackgroundColor(Color.rgb(21, 31, 47))
            setPadding(dp(10), dp(8), dp(10), dp(8))
            text = "Apunta la camara a una etiqueta o codigo."
        }
        panel.addView(resultView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        editorContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            isFocusableInTouchMode = true
            setPadding(0, dp(10), 0, dp(8))
        }
        editorContainer.addView(TextView(this).apply {
            text = "Revisar etiqueta"
            setTextColor(Color.rgb(237, 243, 251))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        })
        editorHintView = TextView(this).apply {
            text = "Corrige lo que haga falta antes de guardar. La camara solo sugiere."
            setTextColor(Color.rgb(150, 163, 182))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setPadding(0, dp(2), 0, dp(8))
        }

        productSelector = AutoCompleteTextView(this).apply {
            hint = "Buscar producto"
            threshold = 1
            setSingleLine(false)
            setPadding(dp(10), dp(8), dp(10), dp(8))
            setTextColor(Color.rgb(237, 243, 251))
            setHintTextColor(Color.rgb(150, 163, 182))
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
            filters = arrayOf(uppercaseFilter())
            setOnFocusChangeListener { _, hasFocus ->
                if (hasFocus) {
                    hideDatePad()
                    if (text.length >= 2) showDropDown()
                }
            }
        }
        productSelector.setOnItemClickListener { parent, _, position, _ ->
            selectedProduct = parent.getItemAtPosition(position) as? Product
            selectedProduct?.baseUnit?.takeIf { it.isNotBlank() }?.let { baseUnitInput.setText(it) }
        }
        productSelector.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) {
                if (productSelector.isPerformingCompletion) return
                val query = s?.toString().orEmpty()
                selectedProduct = products.firstOrNull { it.name.equals(query, ignoreCase = true) }
                updateProductAdapter(filteredProductsFor(query))
                if (query.length >= 2 && productSelector.hasFocus()) productSelector.showDropDown()
            }
        })
        editorContainer.addView(editorField("Producto sugerido", productSelector))

        lotInput = editText("Lote")
        lotOtherSideCheck = CheckBox(this).apply { text = "otra cara" }
        editorContainer.addView(editorField("Lote", lotInput, lotOtherSideCheck))

        codeInput = editText("Codigo detectado o ingresado")
        codeInput.inputType = InputType.TYPE_CLASS_TEXT
        editorContainer.addView(editorField("Codigo", codeInput))

        expiryDayInput = datePartInput("Dia")
        expiryMonthInput = datePartInput("Mes")
        expiryYearSpinner = yearSpinner(listOf(0, 1, 2))
        expiryOtherSideCheck = CheckBox(this).apply { text = "otra cara" }
        editorContainer.addView(dateEditorField("Vencimiento", expiryDayInput, expiryMonthInput, expiryYearSpinner, expiryOtherSideCheck))

        mfgDayInput = datePartInput("Dia")
        mfgMonthInput = datePartInput("Mes")
        mfgYearSpinner = yearSpinner(listOf(0, -1, -2))
        mfgOtherSideCheck = CheckBox(this).apply { text = "otra cara" }

        labelNameInput = editText("Nombre leido en etiqueta")
        editorContainer.addView(editorField("Nombre de etiqueta", labelNameInput))

        presentationInput = editText("Formato")
        visualColorInput = editText("Color")
        editorContainer.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(editorField("Formato", presentationInput), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(editorField("Color", visualColorInput), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        })

        panel.addView(editorContainer)

        packageTypeSpinner = Spinner(this).apply {
            val values = listOf("unidad", "caja", "manga", "pack", "pallet", "otro")
            adapter = object : ArrayAdapter<String>(this@MainActivity, android.R.layout.simple_spinner_item, values) {
                override fun getView(position: Int, convertView: View?, parent: android.view.ViewGroup): View {
                    return styleSpinnerText(super.getView(position, convertView, parent), dropdown = false)
                }

                override fun getDropDownView(position: Int, convertView: View?, parent: android.view.ViewGroup): View {
                    return styleSpinnerText(super.getDropDownView(position, convertView, parent), dropdown = true)
                }
            }
            setPopupBackgroundDrawable(ColorDrawable(Color.rgb(21, 31, 47)))
            backgroundTintList = ColorStateList.valueOf(Color.rgb(79, 140, 255))
        }
        packageSectionLabel = TextView(this).apply {
            text = "Empaque"
            setTextColor(Color.rgb(150, 163, 182))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            setPadding(0, dp(8), 0, 0)
        }

        packageRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        packageQuantityInput = editText("Cant.")
        packageUnitInput = editText("Unidad")
        packageUnitInput.visibility = View.GONE
        packageRow.addView(packageTypeSpinner, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        packageRow.addView(packageQuantityInput, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

        conversionRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        baseUnitInput = editText("Base")
        conversionFactorInput = editText("Factor")
        conversionNotesInput = editText("Nota")
        conversionRow.addView(baseUnitInput, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        conversionRow.addView(conversionFactorInput, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        conversionRow.addView(conversionNotesInput, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.2f))

        learnButton = button("Guardar aprendizaje") { saveLearning() }

        packageCountInput = editText("Cantidad de cajas/mangas a ingresar")
        panel.addView(packageCountInput)
        intakeButton = button("Enviar a revision") { addIntakeItem() }
        finishSessionButton = button("Finalizar sesion") { finishSession() }
        panel.addView(buttonRow(intakeButton, finishSessionButton))

        root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        bottomActionBar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(8), dp(12), navigationBarHeight() + dp(8))
            setBackgroundColor(Color.rgb(9, 13, 20))
            addView(packageSectionLabel, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
            addView(packageRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
            addView(learnButton, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        }
        root.addView(bottomActionBar, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        setupAttentionHighlights()
        setContentView(root)
        updateModeVisibility()
    }

    private fun updateModeVisibility() {
        val learningVisibility = if (isLearningMode) View.VISIBLE else View.GONE
        learnButton.visibility = learningVisibility
        bottomActionBar.visibility = if (isLearningMode && editorOpen) View.VISIBLE else View.GONE
        editorContainer.visibility = if (isLearningMode && editorOpen) View.VISIBLE else View.GONE
        packageSectionLabel.visibility = learningVisibility
        packageRow.visibility = learningVisibility
        conversionRow.visibility = View.GONE
        packageCountInput.visibility = if (isLearningMode) View.GONE else View.VISIBLE
        intakeButton.visibility = if (isLearningMode) View.GONE else View.VISIBLE
        finishSessionButton.visibility = View.GONE
        selectedProduct = null
        currentLink = null
        lastLookupCode = ""
        productSelector.setText("", false)
        editorOpen = false
        hideDatePad()
        applyCompactEditorChrome(false)
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
            cameraProvider = provider
            camera = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture, analysis)
            camera?.cameraControl?.enableTorch(torchEnabled)
            previewView.postDelayed({ focusAtCenter(silent = true) }, 600)
            setStatus("Camara trasera activa. Probando sin linterna para evitar reflejo.")
        }, ContextCompat.getMainExecutor(this))
    }

    private fun focusAtCenter(silent: Boolean = false) {
        if (!::previewView.isInitialized || previewView.width <= 0 || previewView.height <= 0) return
        focusAt(previewView.width / 2f, previewView.height / 2f, silent)
    }

    private fun focusAt(x: Float, y: Float, silent: Boolean = false) {
        val currentCamera = camera ?: return
        val point = previewView.meteringPointFactory.createPoint(x, y)
        val action = FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE)
            .setAutoCancelDuration(3, TimeUnit.SECONDS)
            .build()
        currentCamera.cameraControl.startFocusAndMetering(action)
        if (!silent) setStatus("Enfocando etiqueta...")
    }

    private fun toggleTorch() {
        torchEnabled = !torchEnabled
        camera?.cameraControl?.enableTorch(torchEnabled)
        torchButton.text = if (torchEnabled) "Linterna on" else "Linterna off"
        setStatus(if (torchEnabled) "Linterna encendida." else "Linterna apagada para evitar reflejo.")
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
                    val color = estimateDominantColor(mediaImage)
                    val result = engine.observe(barcodeHits, text, color)
                    runOnUiThread { acceptResult(result) }
                } finally {
                    processingFrame.set(false)
                    imageProxy.close()
                }
            }
    }

    private fun acceptResult(result: LabelScanResult) {
        if (editorOpen) return
        if (!result.hasUsefulData) return
        if (!currentResult.hasUsefulData) scanWindowStartedAtMs = System.currentTimeMillis()
        pulseFocusDuringScanWindow()
        val previousCode = currentResult.codeNormalized
        currentResult = mergeResults(currentResult, result)
        renderResult()
        if (currentResult.codeNormalized.isNotBlank() && currentResult.codeNormalized != previousCode) {
            lookupCurrentCode()
        }
        maybeOpenEditor()
    }

    private fun mergeResults(previous: LabelScanResult, next: LabelScanResult): LabelScanResult {
        if (!previous.hasUsefulData) return next
        val merged = next.copy(
            lot = next.lot.ifBlank { previous.lot },
            expiryDate = next.expiryDate.ifBlank { previous.expiryDate },
            mfgDate = next.mfgDate.ifBlank { previous.mfgDate },
            suggestedName = next.suggestedName.ifBlank { previous.suggestedName },
            presentation = next.presentation.ifBlank { previous.presentation },
            dominantColor = next.dominantColor.ifBlank { previous.dominantColor },
            codeRaw = next.codeRaw.ifBlank { previous.codeRaw },
            codeNormalized = next.codeNormalized.ifBlank { previous.codeNormalized },
            codeType = next.codeType.ifBlank { previous.codeType },
            barcodeFormat = next.barcodeFormat.ifBlank { previous.barcodeFormat },
            gtin = next.gtin.ifBlank { previous.gtin },
            detectedQuantity = next.detectedQuantity ?: previous.detectedQuantity,
            ocrText = if (next.ocrText.length >= previous.ocrText.length) next.ocrText else previous.ocrText,
            sources = previous.sources + next.sources,
            confidence = maxOf(previous.confidence, next.confidence)
        )
        return merged.copy(missingFields = missingFieldsFor(merged))
    }

    private fun startBackendMonitor() {
        backendHandler.removeCallbacks(backendRetryRunnable)
        backendHandler.postDelayed(backendRetryRunnable, 8000L)
    }

    private fun connectBackend(auto: Boolean = false) {
        if (backendConnecting) return
        val url = normalizeServerUrl(serverInput.text.toString())
        if (url.isBlank()) {
            backendClient = null
            setBackendConnected(false)
            if (!auto) setStatus("Ingresa la direccion del servidor principal.")
            return
        }
        backendConnecting = true
        lifecycleScope.launch(Dispatchers.IO) {
            runCatching {
                val client = BackendClient(url)
                client.health()
                val loadedProducts = client.loadProducts()
                val loadedLinks = runCatching { client.loadLinks() }.getOrDefault(emptyList())
                withContext(Dispatchers.Main) {
                    backendClient = client
                    backendConnecting = false
                    products = loadedProducts
                    productLinks = loadedLinks
                    cacheProducts(loadedProducts)
                    cacheLinks(loadedLinks)
                    getPreferences(MODE_PRIVATE).edit().putString("server_url", url).apply()
                    if (serverInput.text.toString() != url) serverInput.setText(url)
                    val wasDisconnected = !backendConnected
                    setBackendConnected(true)
                    updateProductAdapter(products.take(80))
                    if (!auto || wasDisconnected) {
                        setStatus("Capturador conectado a tablet. Productos disponibles: ${products.size}.")
                    }
                    if (editorOpen && productSelector.text.isBlank()) suggestProductForEditor()
                    if (!isLearningMode) lookupCurrentCode()
                    flushOfflineQueue(client)
                    maybeRunSimulationAfterConnect()
                }
            }.onFailure { error ->
                withContext(Dispatchers.Main) {
                    val wasConnected = backendConnected
                    backendClient = null
                    backendConnecting = false
                    setBackendConnected(false)
                    if (products.isNotEmpty()) {
                        if (!auto || wasConnected) {
                            setOfflineReadyStatus()
                        }
                    } else if (!auto) {
                        setStatus("No se pudo conectar: ${error.message}")
                    } else if (!editorOpen) {
                        setOfflineReadyStatus()
                    }
                }
            }
        }
    }

    private fun maybeRunSimulationAfterConnect() {
        if (!simulationRequested || simulationStarted) return
        val client = backendClient ?: return
        val product = pickSimulationProduct()
        if (product == null) {
            setStatus("Simulacion detenida: no hay productos importados en la tablet.")
            return
        }
        simulationStarted = true
        val code = intent.getStringExtra("simulation_code").orEmpty().ifBlank { "17802500025633" }
        val result = LabelScanResult(
            codeRaw = code,
            codeNormalized = code.replace("\\s+".toRegex(), "").uppercase(Locale.ROOT),
            codeType = if (code.length == 14) "DUN-14" else "codigo",
            barcodeFormat = "SIMULADO",
            gtin = code.takeIf { it.length in 8..14 }.orEmpty(),
            lot = intent.getStringExtra("simulation_lot").orEmpty().ifBlank { "01L0526" },
            expiryDate = intent.getStringExtra("simulation_expiry").orEmpty().ifBlank { "2027-05-12" },
            mfgDate = "",
            detectedQuantity = 10.0,
            suggestedName = intent.getStringExtra("simulation_name").orEmpty().ifBlank { "SEMOLA 500 GR" },
            presentation = "FARDO 500G",
            dominantColor = "blanco",
            ocrText = "SIMULACION S25 SEMOLA LUCCHETTI FARDO 500G LOTE 01L0526 VENC 20270512",
            gs1Payload = mapOf("01" to code, "10" to "01L0526", "17" to "270512"),
            sources = mapOf("code" to "simulation", "lot" to "simulation", "expiry" to "simulation"),
            confidence = 0.99,
            stableFrames = 5
        )
        val rule = PackageRule(
            packageType = "caja",
            packageQuantity = 10.0,
            packageUnit = "unidad",
            baseUnit = product.baseUnit.ifBlank { "unidad" },
            conversionFactor = 10.0,
            notes = "Simulacion controlada desde S25 para validar envio a tablet."
        )
        val imageDataUrl = simulationImageDataUrl()
        setStatus("Simulando etiqueta y enviando sesion pendiente a tablet...")
        lifecycleScope.launch(Dispatchers.IO) {
            runCatching {
                val link = client.saveProductCodeLink(result, product, rule, imageDataUrl, "android-capturer-s25")
                val sessionId = client.createScanSession("android-capturer-s25", "capturador-s25@local")
                val imagePath = client.saveScanSessionImage(result, link, imageDataUrl, "android-capturer-s25")
                client.addSessionItem(sessionId, result, link, product, packageCount = 1.0, imagePath = imagePath)
                client.submitSession(sessionId, "Simulacion S25 enviada desde capturador Android.")
                sessionId
            }.onSuccess { sessionId ->
                withContext(Dispatchers.Main) {
                    currentResult = result
                    selectedProduct = product
                    setBackendConnected(true)
                    renderResult()
                    val message = "Simulacion enviada a tablet: ingreso pendiente #${sessionId.takeLast(6).uppercase(Locale.ROOT)}."
                    setStatus(message)
                    showToast(message)
                }
            }.onFailure { error ->
                withContext(Dispatchers.Main) {
                    simulationStarted = false
                    setBackendConnected(false)
                    backendClient = null
                    setStatus("No se pudo simular envio: ${error.message}.")
                }
            }
        }
    }

    private fun pickSimulationProduct(): Product? {
        if (products.isEmpty()) return null
        val requested = intent.getStringExtra("simulation_product").orEmpty().ifBlank { "semola 500" }
        val candidates = listOf(requested, "semola 500", "semola", "arroz")
        return candidates.firstNotNullOfOrNull { term ->
            val normalized = normalizeForSimulationMatch(term)
            products.firstOrNull { product ->
                normalizeForSimulationMatch("${product.name} ${product.normalizedName}").contains(normalized)
            }
        } ?: products.firstOrNull()
    }

    private fun normalizeForSimulationMatch(value: String): String {
        return Normalizer.normalize(value.lowercase(Locale.ROOT), Normalizer.Form.NFD)
            .replace("\\p{Mn}+".toRegex(), "")
            .replace("[^a-z0-9]+".toRegex(), " ")
            .trim()
    }

    private fun simulationImageDataUrl(): String {
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
    }

    private fun normalizeServerUrl(raw: String): String {
        val trimmed = raw.trim().trimEnd('/')
        return when {
            trimmed.startsWith("HTTP://", ignoreCase = true) -> "http://" + trimmed.substringAfter("://")
            trimmed.startsWith("HTTPS://", ignoreCase = true) -> "https://" + trimmed.substringAfter("://")
            else -> trimmed
        }
    }

    private fun setBackendConnected(connected: Boolean) {
        backendConnected = connected
        if (::backendIndicator.isInitialized) {
            backendIndicator.setTextColor(
                if (connected) Color.rgb(34, 197, 94) else Color.rgb(107, 114, 128)
            )
        }
    }

    private fun setOfflineReadyStatus(prefix: String = "") {
        val intro = prefix.takeIf { it.isNotBlank() }?.let { "$it " }.orEmpty()
        val pending = offlineQueueCount()
        val productCount = products.size
        val linkCount = productLinks.size
        setStatus(
            intro + "Modo offline: puedes editar y guardar. " +
                "Pendientes por enviar: $pending. Productos guardados: $productCount. Codigos aprendidos: $linkCount."
        )
    }

    private fun lookupCurrentCode() {
        val code = currentResult.codeNormalized
        if (code.isBlank()) return
        findCachedLink(code)?.let { cachedLink ->
            applyExistingLink(cachedLink)
            if (isLearningMode) {
                setStatus("Codigo aprendido en este capturador. Puedes confirmar o corregir.")
            } else {
                setStatus("Codigo aprendido. Ingresa cantidad de ${cachedLink.packageType.ifBlank { "empaques" }}.")
            }
            renderResult()
        }
        val client = backendClient ?: return
        if (code == lastLookupCode) return
        lastLookupCode = code
        lifecycleScope.launch(Dispatchers.IO) {
            runCatching {
                val link = client.lookupLink(code)
                withContext(Dispatchers.Main) {
                    currentLink = link
                    if (link != null) {
                        upsertCachedLink(link)
                        applyExistingLink(link)
                        if (isLearningMode) {
                            setStatus("Codigo ya aprendido. Puedes confirmar o corregir el producto y empaque.")
                        } else {
                            setStatus("Codigo aprendido. Ingresa cantidad de ${link.packageType.ifBlank { "empaques" }}.")
                        }
                    } else {
                        currentLink = null
                        if (isLearningMode) {
                            if (editorOpen && productSelector.text.isBlank()) suggestProductForEditor()
                        } else {
                            productSelector.setText("", false)
                            setStatus("Producto no vinculado. Cambia a Aprender para entrenar esta etiqueta.")
                        }
                    }
                    renderResult()
                }
            }.onFailure { error ->
                withContext(Dispatchers.Main) {
                    lastLookupCode = ""
                    setBackendConnected(false)
                    backendClient = null
                    setOfflineReadyStatus("No se pudo consultar codigo: ${error.message}.")
                }
            }
        }
    }

    private fun applyExistingLink(link: ProductCodeLink) {
        currentLink = link
        selectedProduct = products.firstOrNull { it.id == link.productId }
        productSelector.setText(selectedProduct?.name ?: link.productNameSnapshot.ifBlank { "Producto vinculado" }, false)
        link.packageType.takeIf { it.isNotBlank() }?.let { setSpinnerValue(packageTypeSpinner, it) }
        packageQuantityInput.setText(formatQuantity(link.packageQuantity))
        packageUnitInput.setText(link.packageUnit)
        baseUnitInput.setText(link.baseUnit)
        conversionFactorInput.setText(formatQuantity(link.conversionFactor))
        conversionNotesInput.setText(link.conversionNotes)
        refreshAttentionHighlights()
    }

    private fun updateProductAdapter(items: List<Product>) {
        productSelector.setAdapter(ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, items))
    }

    private fun cacheProducts(items: List<Product>) {
        val array = JSONArray()
        items.forEach { product ->
            array.put(
                JSONObject()
                    .put("id", product.id)
                    .put("name", product.name)
                    .put("normalizedName", product.normalizedName)
                    .put("baseUnit", product.baseUnit)
            )
        }
        getPreferences(MODE_PRIVATE).edit().putString("cached_products", array.toString()).apply()
    }

    private fun loadCachedProducts() {
        val raw = getPreferences(MODE_PRIVATE).getString("cached_products", null)
        if (raw.isNullOrBlank()) {
            products = loadBundledProducts()
            if (products.isNotEmpty()) cacheProducts(products)
            return
        }
        runCatching {
            val array = JSONArray(raw)
            products = (0 until array.length()).mapNotNull { index ->
                val item = array.optJSONObject(index) ?: return@mapNotNull null
                Product(
                    id = item.optString("id"),
                    name = item.optString("name"),
                    normalizedName = item.optString("normalizedName"),
                    baseUnit = item.optString("baseUnit")
                ).takeIf { it.id.isNotBlank() && it.name.isNotBlank() }
            }
        }
        if (products.isEmpty()) products = loadBundledProducts()
    }

    private fun loadBundledProducts(): List<Product> {
        return runCatching {
            assets.open("offline_products_seed.json").bufferedReader().use { reader ->
                val array = JSONArray(reader.readText())
                (0 until array.length()).mapNotNull { index ->
                    val item = array.optJSONObject(index) ?: return@mapNotNull null
                    Product(
                        id = item.optString("id"),
                        name = item.optString("name"),
                        normalizedName = item.optString("normalizedName"),
                        baseUnit = item.optString("baseUnit")
                    ).takeIf { it.id.isNotBlank() && it.name.isNotBlank() }
                }
            }
        }.getOrDefault(emptyList())
    }

    private fun cacheLinks(items: List<ProductCodeLink>) {
        val array = JSONArray()
        items.forEach { link -> array.put(link.toJson()) }
        getPreferences(MODE_PRIVATE).edit().putString("cached_product_links", array.toString()).apply()
    }

    private fun loadCachedLinks() {
        val raw = getPreferences(MODE_PRIVATE).getString("cached_product_links", null) ?: return
        runCatching {
            val array = JSONArray(raw)
            productLinks = (0 until array.length()).mapNotNull { index ->
                array.optJSONObject(index)?.toProductCodeLinkLocal()
            }
        }
    }

    private fun upsertCachedLink(link: ProductCodeLink) {
        val normalized = normalizeCode(link.codeNormalized.ifBlank { link.codeRaw })
        if (normalized.isBlank()) return
        productLinks = (listOf(link.copy(codeNormalized = normalized)) + productLinks.filterNot {
            normalizeCode(it.codeNormalized.ifBlank { it.codeRaw }) == normalized
        }).take(5000)
        cacheLinks(productLinks)
    }

    private fun findCachedLink(code: String): ProductCodeLink? {
        val normalized = normalizeCode(code)
        return productLinks.firstOrNull { normalizeCode(it.codeNormalized.ifBlank { it.codeRaw }) == normalized }
    }

    private fun normalizeCode(value: String): String {
        return value.replace("\\s+".toRegex(), "").uppercase(Locale.ROOT)
    }

    private fun ProductCodeLink.toJson(): JSONObject {
        return JSONObject()
            .put("id", id ?: "")
            .put("productId", productId)
            .put("productNameSnapshot", productNameSnapshot)
            .put("codeRaw", codeRaw)
            .put("codeNormalized", codeNormalized)
            .put("codeType", codeType)
            .put("gtin", gtin)
            .put("barcodeFormat", barcodeFormat)
            .put("detectedLot", detectedLot)
            .put("detectedExpiry", detectedExpiry)
            .put("detectedMfgDate", detectedMfgDate)
            .put("detectedQuantity", detectedQuantity ?: JSONObject.NULL)
            .put("packageType", packageType)
            .put("packageQuantity", packageQuantity ?: JSONObject.NULL)
            .put("packageUnit", packageUnit)
            .put("baseUnit", baseUnit)
            .put("conversionFactor", conversionFactor ?: JSONObject.NULL)
            .put("conversionNotes", conversionNotes)
            .put("labelTextOcr", labelTextOcr)
            .put("confidence", confidence)
    }

    private fun JSONObject.toProductCodeLinkLocal(): ProductCodeLink {
        return ProductCodeLink(
            id = optString("id").ifBlank { null },
            productId = optString("productId").ifBlank { optString("product_id") },
            productNameSnapshot = optString("productNameSnapshot").ifBlank { optString("product_name_snapshot") },
            codeRaw = optString("codeRaw").ifBlank { optString("code_raw") },
            codeNormalized = optString("codeNormalized").ifBlank { optString("code_normalized") },
            codeType = optString("codeType").ifBlank { optString("code_type") },
            gtin = optString("gtin"),
            barcodeFormat = optString("barcodeFormat").ifBlank { optString("barcode_format") },
            detectedLot = optString("detectedLot").ifBlank { optString("detected_lot") },
            detectedExpiry = optString("detectedExpiry").ifBlank { optString("detected_expiry") },
            detectedMfgDate = optString("detectedMfgDate").ifBlank { optString("detected_mfg_date") },
            detectedQuantity = optNullableDoubleLocal("detectedQuantity", "detected_quantity"),
            packageType = optString("packageType").ifBlank { optString("package_type") },
            packageQuantity = optNullableDoubleLocal("packageQuantity", "package_quantity"),
            packageUnit = optString("packageUnit").ifBlank { optString("package_unit") },
            baseUnit = optString("baseUnit").ifBlank { optString("base_unit") },
            conversionFactor = optNullableDoubleLocal("conversionFactor", "conversion_factor"),
            conversionNotes = optString("conversionNotes").ifBlank { optString("conversion_notes") },
            labelTextOcr = optString("labelTextOcr").ifBlank { optString("label_text_ocr") },
            confidence = optDouble("confidence", 0.0)
        )
    }

    private fun JSONObject.optNullableDoubleLocal(vararg names: String): Double? {
        val name = names.firstOrNull { has(it) && !isNull(it) } ?: return null
        return optDouble(name).takeIf { !it.isNaN() }
    }

    private fun saveLearning() {
        val client = backendClient
        if (isLearningMode && !editorOpen) {
            openEditor()
            setStatus("Revisa los datos antes de guardar.")
            return
        }
        currentResult = buildEditedResult()
        val product = selectedOrManualProduct()
        if (product == null) {
            setStatus("Escribe o selecciona el producto.")
            return
        }
        if (currentResult.codeNormalized.isBlank()) {
            setStatus("Aun no hay codigo detectado para aprender.")
            return
        }
        val rule = readPackageRule() ?: return
        val finalRule = rule.withEditorNotes()
        if (client == null) {
            enqueueLearning(currentResult, product, finalRule, pendingLabelImageDataUrl, "Sin conexion a tablet")
            return
        }
        setStatus("Guardando aprendizaje e imagen en la tablet...")
        val editedResult = currentResult
        val imageDataUrl = pendingLabelImageDataUrl
        lifecycleScope.launch(Dispatchers.IO) {
            runCatching {
                client.saveProductCodeLink(editedResult, product, finalRule, imageDataUrl, "android-capturer")
            }.onSuccess { link ->
                withContext(Dispatchers.Main) {
                    upsertCachedLink(link.copy(productNameSnapshot = link.productNameSnapshot.ifBlank { product.name }))
                    clearCurrentScan()
                    val message = "Enviado a tablet: producto aprendido. Para stock usa Ingresar."
                    setStatus(message)
                    showToast(message)
                }
            }.onFailure { error ->
                withContext(Dispatchers.Main) {
                    setBackendConnected(false)
                    backendClient = null
                    enqueueLearning(editedResult, product, finalRule, imageDataUrl, "No se pudo enviar: ${error.message}")
                }
            }
        }
    }

    private fun addIntakeItem() {
        val client = backendClient
        val link = currentLink
        if (link == null) {
            setStatus("Este codigo no esta aprendido. Primero aprende la etiqueta.")
            return
        }
        val count = packageCountInput.text.toString().replace(",", ".").toDoubleOrNull()
        if (count == null || count <= 0.0) {
            setStatus("Ingresa cantidad de cajas, mangas o packs.")
            return
        }
        val result = currentResult
        if (client == null) {
            captureImageDataUrl { imageDataUrl ->
                enqueueIntake(result, link, productForLink(link), count, imageDataUrl, "Sin conexion a tablet")
            }
            return
        }
        setStatus("Enviando ingreso y foto a revision en tablet...")
        captureImageDataUrl { imageDataUrl ->
            lifecycleScope.launch(Dispatchers.IO) {
                runCatching {
                    val sessionId = client.createScanSession("android-capturer", "capturador@local")
                    val product = productForLink(link)
                    val imagePath = client.saveScanSessionImage(result, link, imageDataUrl, "android-capturer")
                    client.addSessionItem(sessionId, result, link, product, count, imagePath)
                    client.submitSession(sessionId, "Ingreso enviado desde capturador Android con 1 item.")
                    sessionId
                }.onSuccess { sessionId ->
                    withContext(Dispatchers.Main) {
                        currentSessionId = null
                        packageCountInput.setText("")
                        clearCurrentScan()
                        val shortId = sessionId.takeLast(6).uppercase(Locale.ROOT)
                        val message = "Enviado a tablet: ingreso pendiente #$shortId."
                        setStatus(message)
                        showToast(message)
                    }
                }.onFailure { error ->
                    withContext(Dispatchers.Main) {
                        setBackendConnected(false)
                        backendClient = null
                        enqueueIntake(result, link, productForLink(link), count, imageDataUrl, "No se pudo enviar: ${error.message}")
                    }
                }
            }
        }
    }

    private fun enqueueLearning(
        result: LabelScanResult,
        product: Product,
        rule: PackageRule,
        imageDataUrl: String?,
        reason: String
    ) {
        val id = UUID.randomUUID().toString()
        val imageFile = storeOfflineImage(id, imageDataUrl)
        appendOfflineItem(
            JSONObject()
                .put("id", id)
                .put("type", "learning")
                .put("createdAt", java.time.Instant.now().toString())
                .put("reason", reason)
                .put("result", result.toJson())
                .put("product", product.toJson())
                .put("rule", rule.toJson())
                .put("imageFile", imageFile)
        )
        upsertCachedLink(offlineLink(result, product, rule))
        clearCurrentScan()
        val message = "Guardado en capturador. Se enviara a la tablet al reconectar (${offlineQueueCount()} pendientes)."
        setStatus(message)
        showToast(message)
    }

    private fun enqueueIntake(
        result: LabelScanResult,
        link: ProductCodeLink,
        product: Product?,
        packageCount: Double,
        imageDataUrl: String?,
        reason: String
    ) {
        val id = UUID.randomUUID().toString()
        val imageFile = storeOfflineImage(id, imageDataUrl)
        appendOfflineItem(
            JSONObject()
                .put("id", id)
                .put("type", "intake")
                .put("createdAt", java.time.Instant.now().toString())
                .put("reason", reason)
                .put("result", result.toJson())
                .put("link", link.toJson())
                .put("product", (product ?: productForLink(link))?.toJson() ?: JSONObject())
                .put("rule", packageRuleFromLink(link).toJson())
                .put("packageCount", packageCount)
                .put("imageFile", imageFile)
        )
        packageCountInput.setText("")
        clearCurrentScan()
        val message = "Ingreso guardado en capturador. Se enviara a la tablet al reconectar (${offlineQueueCount()} pendientes)."
        setStatus(message)
        showToast(message)
    }

    private fun flushOfflineQueue(client: BackendClient) {
        val files = offlineQueueFiles()
        if (files.isEmpty()) return
        setStatus("Conectado. Enviando ${files.size} pendientes a la tablet...")
        lifecycleScope.launch(Dispatchers.IO) {
            var sent = 0
            var firstError: String? = null
            val syncedLinks = mutableListOf<ProductCodeLink>()
            files.sortedBy { it.name }.forEach { file ->
                runCatching {
                    val item = JSONObject(file.readText())
                    val imageDataUrl = readOfflineImage(item.optString("imageFile"))
                    val link = when (item.optString("type")) {
                        "learning" -> syncOfflineLearning(client, item, imageDataUrl)
                        "intake" -> syncOfflineIntake(client, item, imageDataUrl)
                        else -> null
                    }
                    link?.let { syncedLinks += it }
                    deleteOfflineImage(item.optString("imageFile"))
                    file.delete()
                    sent += 1
                }.onFailure { error ->
                    if (firstError == null) firstError = error.message ?: "No se pudo sincronizar pendiente."
                }
            }
            withContext(Dispatchers.Main) {
                syncedLinks.forEach { upsertCachedLink(it) }
                if (sent > 0) {
                    showToast("Sincronizados $sent pendientes con la tablet.")
                }
                if (firstError != null) {
                    setStatus("Tablet conectada, pero quedaron ${offlineQueueCount()} pendientes: $firstError")
                } else if (sent > 0) {
                    setStatus("Tablet conectada. Pendientes sincronizados.")
                }
            }
        }
    }

    private fun syncOfflineLearning(client: BackendClient, item: JSONObject, imageDataUrl: String?): ProductCodeLink {
        val result = item.optJSONObject("result")?.toLabelScanResultLocal() ?: LabelScanResult()
        val product = item.optJSONObject("product")?.toProductLocal() ?: Product(
            id = "manual:${UUID.randomUUID()}",
            name = result.suggestedName.ifBlank { "PRODUCTO POR REVISAR" },
            normalizedName = normalizeProductName(result.suggestedName),
            baseUnit = "unidad"
        )
        val rule = item.optJSONObject("rule")?.toPackageRuleLocal() ?: PackageRule("otro", 1.0, "unidad", product.baseUnit.ifBlank { "unidad" }, 1.0, "")
        return client.saveProductCodeLink(result, product, rule, imageDataUrl, "android-capturer-offline")
            .copy(productNameSnapshot = product.name)
    }

    private fun syncOfflineIntake(client: BackendClient, item: JSONObject, imageDataUrl: String?): ProductCodeLink {
        val result = item.optJSONObject("result")?.toLabelScanResultLocal() ?: LabelScanResult()
        val storedLink = item.optJSONObject("link")?.toProductCodeLinkLocal()
        val product = item.optJSONObject("product")?.toProductLocal()
            ?: storedLink?.let { productForLink(it) }
            ?: Product("manual:${UUID.randomUUID()}", result.suggestedName.ifBlank { "PRODUCTO POR REVISAR" }, normalizeProductName(result.suggestedName), "unidad")
        val rule = item.optJSONObject("rule")?.toPackageRuleLocal()
            ?: storedLink?.let { packageRuleFromLink(it) }
            ?: PackageRule("otro", 1.0, product.baseUnit.ifBlank { "unidad" }, product.baseUnit.ifBlank { "unidad" }, 1.0, "")
        val realLink = client.saveProductCodeLink(result, product, rule, imageDataUrl, "android-capturer-offline")
            .copy(productNameSnapshot = product.name)
        val sessionId = client.createScanSession("android-capturer-offline", "capturador@local")
        val imagePath = client.saveScanSessionImage(result, realLink, imageDataUrl, "android-capturer-offline")
        client.addSessionItem(
            sessionId = sessionId,
            result = result,
            link = realLink,
            product = product,
            packageCount = item.optDouble("packageCount", 1.0).takeIf { it > 0.0 } ?: 1.0,
            imagePath = imagePath
        )
        client.submitSession(sessionId, "Ingreso sincronizado desde cola offline del capturador Android.")
        return realLink
    }

    private fun appendOfflineItem(item: JSONObject) {
        offlineQueueDir.mkdirs()
        File(offlineQueueDir, "${item.optString("id")}.json").writeText(item.toString())
    }

    private fun storeOfflineImage(id: String, imageDataUrl: String?): String {
        if (imageDataUrl.isNullOrBlank()) return ""
        offlineQueueDir.mkdirs()
        val file = File(offlineQueueDir, "$id-image.txt")
        file.writeText(imageDataUrl)
        return file.name
    }

    private fun readOfflineImage(fileName: String): String? {
        if (fileName.isBlank()) return null
        val file = File(offlineQueueDir, fileName)
        return file.takeIf { it.exists() }?.readText()
    }

    private fun deleteOfflineImage(fileName: String) {
        if (fileName.isNotBlank()) File(offlineQueueDir, fileName).delete()
    }

    private fun offlineQueueFiles(): List<File> {
        return offlineQueueDir.listFiles { file -> file.isFile && file.name.endsWith(".json") }?.toList().orEmpty()
    }

    private fun offlineQueueCount(): Int = offlineQueueFiles().size

    private fun offlineLink(result: LabelScanResult, product: Product, rule: PackageRule): ProductCodeLink {
        val code = normalizeCode(result.codeNormalized.ifBlank { result.gtin }.ifBlank { result.codeRaw })
        return ProductCodeLink(
            id = null,
            productId = product.id,
            productNameSnapshot = product.name,
            codeRaw = result.codeRaw.ifBlank { code },
            codeNormalized = code,
            codeType = result.codeType.ifBlank { "codigo" },
            gtin = result.gtin.ifBlank { code.takeIf { it.length in 8..14 }.orEmpty() },
            barcodeFormat = result.barcodeFormat,
            detectedLot = result.lot,
            detectedExpiry = result.expiryDate,
            detectedMfgDate = result.mfgDate,
            detectedQuantity = result.detectedQuantity,
            packageType = rule.packageType,
            packageQuantity = rule.packageQuantity,
            packageUnit = rule.packageUnit,
            baseUnit = rule.baseUnit,
            conversionFactor = rule.conversionFactor,
            conversionNotes = rule.notes,
            labelTextOcr = result.ocrText,
            confidence = result.confidence
        )
    }

    private fun productForLink(link: ProductCodeLink): Product? {
        return products.firstOrNull { it.id == link.productId }
            ?: link.productNameSnapshot.takeIf { it.isNotBlank() }?.let {
                Product(link.productId.ifBlank { "manual:${normalizeProductName(it)}" }, it, normalizeProductName(it), link.baseUnit.ifBlank { "unidad" })
            }
    }

    private fun packageRuleFromLink(link: ProductCodeLink): PackageRule {
        return PackageRule(
            packageType = link.packageType.ifBlank { "otro" },
            packageQuantity = link.packageQuantity,
            packageUnit = link.packageUnit.ifBlank { link.baseUnit.ifBlank { "unidad" } },
            baseUnit = link.baseUnit.ifBlank { link.packageUnit.ifBlank { "unidad" } },
            conversionFactor = link.conversionFactor ?: link.packageQuantity,
            notes = link.conversionNotes
        )
    }

    private fun Product.toJson(): JSONObject {
        return JSONObject()
            .put("id", id)
            .put("name", name)
            .put("normalizedName", normalizedName)
            .put("baseUnit", baseUnit)
    }

    private fun JSONObject.toProductLocal(): Product? {
        val name = optString("name").ifBlank { optString("nombre") }
        if (name.isBlank()) return null
        return Product(
            id = optString("id").ifBlank { "manual:${normalizeProductName(name)}" },
            name = name,
            normalizedName = optString("normalizedName").ifBlank { optString("nombre_normalizado").ifBlank { normalizeProductName(name) } },
            baseUnit = optString("baseUnit").ifBlank { optString("unidad_default").ifBlank { "unidad" } }
        )
    }

    private fun PackageRule.toJson(): JSONObject {
        return JSONObject()
            .put("packageType", packageType)
            .put("packageQuantity", packageQuantity ?: JSONObject.NULL)
            .put("packageUnit", packageUnit)
            .put("baseUnit", baseUnit)
            .put("conversionFactor", conversionFactor ?: JSONObject.NULL)
            .put("notes", notes)
    }

    private fun JSONObject.toPackageRuleLocal(): PackageRule {
        return PackageRule(
            packageType = optString("packageType").ifBlank { optString("package_type").ifBlank { "otro" } },
            packageQuantity = optNullableDoubleLocal("packageQuantity", "package_quantity"),
            packageUnit = optString("packageUnit").ifBlank { optString("package_unit").ifBlank { "unidad" } },
            baseUnit = optString("baseUnit").ifBlank { optString("base_unit").ifBlank { "unidad" } },
            conversionFactor = optNullableDoubleLocal("conversionFactor", "conversion_factor"),
            notes = optString("notes").ifBlank { optString("conversionNotes").ifBlank { optString("conversion_notes") } }
        )
    }

    private fun LabelScanResult.toJson(): JSONObject {
        return JSONObject()
            .put("codeRaw", codeRaw)
            .put("codeNormalized", codeNormalized)
            .put("codeType", codeType)
            .put("barcodeFormat", barcodeFormat)
            .put("gtin", gtin)
            .put("lot", lot)
            .put("expiryDate", expiryDate)
            .put("mfgDate", mfgDate)
            .put("detectedQuantity", detectedQuantity ?: JSONObject.NULL)
            .put("suggestedName", suggestedName)
            .put("presentation", presentation)
            .put("dominantColor", dominantColor)
            .put("ocrText", ocrText)
            .put("gs1Payload", JSONObject(gs1Payload))
            .put("sources", JSONObject(sources))
            .put("confidence", confidence)
            .put("stableFrames", stableFrames)
            .put("missingFields", JSONArray(missingFields))
            .put("updatedAtMs", updatedAtMs)
    }

    private fun JSONObject.toLabelScanResultLocal(): LabelScanResult {
        return LabelScanResult(
            codeRaw = optString("codeRaw"),
            codeNormalized = optString("codeNormalized"),
            codeType = optString("codeType"),
            barcodeFormat = optString("barcodeFormat"),
            gtin = optString("gtin"),
            lot = optString("lot"),
            expiryDate = optString("expiryDate"),
            mfgDate = optString("mfgDate"),
            detectedQuantity = optNullableDoubleLocal("detectedQuantity"),
            suggestedName = optString("suggestedName"),
            presentation = optString("presentation"),
            dominantColor = optString("dominantColor"),
            ocrText = optString("ocrText"),
            gs1Payload = optJSONObject("gs1Payload").toStringMap(),
            sources = optJSONObject("sources").toStringMap(),
            confidence = optDouble("confidence", 0.0),
            stableFrames = optInt("stableFrames", 0),
            missingFields = optJSONArray("missingFields").toStringList(),
            updatedAtMs = optLong("updatedAtMs", System.currentTimeMillis())
        )
    }

    private fun JSONObject?.toStringMap(): Map<String, String> {
        if (this == null) return emptyMap()
        val map = mutableMapOf<String, String>()
        val keys = keys()
        while (keys.hasNext()) {
            val key = keys.next()
            map[key] = optString(key)
        }
        return map
    }

    private fun JSONArray?.toStringList(): List<String> {
        if (this == null) return emptyList()
        return (0 until length()).mapNotNull { index -> optString(index).takeIf { it.isNotBlank() } }
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
                    clearCurrentScan()
                    val message = "Sesion enviada a revision. La aprobacion queda en la tablet/admin."
                    setStatus(message)
                    showToast(message)
                }
            }.onFailure { error ->
                withContext(Dispatchers.Main) {
                    setBackendConnected(false)
                    backendClient = null
                    setStatus("No se pudo finalizar: ${error.message}. Reintentando conexion.")
                }
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
        val unit = inferredPackageUnit()
        if (quantity == null || quantity <= 0.0) {
            setStatus("No se asume cantidad 1. Ingresa la cantidad contenida del empaque.")
            return null
        }
        val baseUnit = baseUnitInput.text.toString().trim()
            .ifBlank { selectedProduct?.baseUnit?.trim().orEmpty() }
            .ifBlank { unit }
        val factor = conversionFactorInput.text.toString()
            .replace(",", ".")
            .toDoubleOrNull()
            ?: inferConversionFactor(quantity, unit, baseUnit)
        val notes = conversionNotesInput.text.toString().trim()
            .ifBlank {
                if (canonicalUnit(unit) != canonicalUnit(baseUnit)) {
                    "Conversion inferida: $quantity $unit hacia $baseUnit"
                } else ""
            }
        return PackageRule(
            packageType = packageTypeSpinner.selectedItem?.toString().orEmpty(),
            packageQuantity = quantity,
            packageUnit = unit,
            baseUnit = baseUnit,
            conversionFactor = factor,
            notes = notes
        )
    }

    private fun selectedOrManualProduct(): Product? {
        selectedProduct?.let { return it }
        val typed = productSelector.text.toString().trim()
        if (typed.isBlank()) return null
        val exact = products.firstOrNull { normalizeProductName(it.name) == normalizeProductName(typed) }
        if (exact != null) {
            selectedProduct = exact
            return exact
        }
        val manualName = typed.uppercase(Locale.ROOT)
        val manualId = "manual:${normalizeProductName(manualName).replace(" ", "-").take(48).ifBlank { UUID.randomUUID().toString() }}"
        return Product(
            id = manualId,
            name = manualName,
            normalizedName = normalizeProductName(manualName),
            baseUnit = baseUnitInput.text.toString().trim().ifBlank { "unidad" }
        ).also { selectedProduct = it }
    }

    private fun normalizeProductName(value: String): String {
        return Normalizer.normalize(value.lowercase(Locale.ROOT), Normalizer.Form.NFD)
            .replace("\\p{Mn}+".toRegex(), "")
            .replace("[^a-z0-9]+".toRegex(), " ")
            .trim()
    }

    private fun inferredPackageUnit(): String {
        return packageUnitInput.text.toString().trim()
            .ifBlank { selectedProduct?.baseUnit?.trim().orEmpty() }
            .ifBlank { baseUnitInput.text.toString().trim() }
            .ifBlank { "unidad" }
    }

    private fun inferConversionFactor(quantity: Double, packageUnit: String, baseUnit: String): Double {
        val from = canonicalUnit(packageUnit)
        val to = canonicalUnit(baseUnit)
        return when {
            from == to -> quantity
            from == "g" && to == "kg" -> quantity / 1000.0
            from == "kg" && to == "g" -> quantity * 1000.0
            from == "ml" && to == "l" -> quantity / 1000.0
            from == "l" && to == "ml" -> quantity * 1000.0
            else -> quantity
        }
    }

    private fun canonicalUnit(value: String): String {
        return value.trim().lowercase(Locale.ROOT)
            .replace(".", "")
            .let {
                when (it) {
                    "unidad", "unidades", "un", "und", "u" -> "unidad"
                    "kilo", "kilos", "kg", "kgs" -> "kg"
                    "gramo", "gramos", "gr", "g" -> "g"
                    "litro", "litros", "lt", "lts", "l" -> "l"
                    "mililitro", "mililitros", "ml" -> "ml"
                    else -> it
                }
            }
    }

    private fun clearCurrentScan() {
        engine.reset()
        currentResult = LabelScanResult()
        currentLink = null
        lastLookupCode = ""
        scanWindowStartedAtMs = 0L
        lastAutoFocusAtMs = 0L
        editorOpen = false
        pendingLabelImageDataUrl = null
        selectedProduct = null
        productSelector.setText("", false)
        listOf(codeInput, labelNameInput, presentationInput, visualColorInput, lotInput, expiryDayInput, expiryMonthInput, mfgDayInput, mfgMonthInput).forEach { it.setText("") }
        expiryYearSpinner.setSelection(0)
        mfgYearSpinner.setSelection(0)
        listOf(lotOtherSideCheck, expiryOtherSideCheck, mfgOtherSideCheck).forEach { it.isChecked = false }
        editorContainer.visibility = View.GONE
        bottomActionBar.visibility = View.GONE
        hideDatePad()
        refreshAttentionHighlights()
        applyCompactEditorChrome(false)
        resultView.text = "Apunta la camara a una etiqueta o codigo."
    }

    private fun maybeOpenEditor() {
        if (!isLearningMode || editorOpen || !currentResult.hasUsefulData || scanWindowStartedAtMs <= 0) return
        val elapsedMs = System.currentTimeMillis() - scanWindowStartedAtMs
        val remaining = ((5000 - elapsedMs).coerceAtLeast(0) / 1000) + 1
        if (elapsedMs >= 5000) {
            openEditor()
        } else {
            setStatus("Leyendo etiqueta... editor en ${remaining}s si los datos siguen estables.")
        }
    }

    private fun pulseFocusDuringScanWindow() {
        val startedAt = scanWindowStartedAtMs
        if (startedAt <= 0) return
        val now = System.currentTimeMillis()
        if (now - startedAt > 5000) return
        if (now - lastAutoFocusAtMs < 1100) return
        lastAutoFocusAtMs = now
        focusAtCenter(silent = true)
    }

    private fun openEditor() {
        if (!isLearningMode || editorOpen || !currentResult.hasUsefulData) return
        editorOpen = true
        fillEditorFromResult(currentResult)
        val learnedLink = currentLink
        if (learnedLink != null) {
            applyExistingLink(learnedLink)
        } else {
            suggestProductForEditor()
        }
        editorContainer.visibility = View.VISIBLE
        bottomActionBar.visibility = View.VISIBLE
        applyCompactEditorChrome(true)
        scrollView.post {
            editorContainer.requestFocus()
            scrollView.scrollTo(0, 0)
        }
        setStatus("Revisa y corrige los datos. Puedes borrar cada campo con X.")
        captureImageDataUrl { dataUrl ->
            pendingLabelImageDataUrl = dataUrl
            collapseCamera()
        }
    }

    private fun collapseCamera() {
        cameraProvider?.unbindAll()
        camera = null
        previewView.visibility = View.GONE
        cameraCollapsedLabel.visibility = View.VISIBLE
        openCameraButton.visibility = View.VISIBLE
        setCameraHostHeight(dp(46))
    }

    private fun expandCamera() {
        setCameraHostHeight(dp(330))
        cameraCollapsedLabel.visibility = View.GONE
        openCameraButton.visibility = View.GONE
        previewView.visibility = View.VISIBLE
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            cameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    private fun setCameraHostHeight(height: Int) {
        val params = cameraHost.layoutParams as? LinearLayout.LayoutParams ?: return
        if (params.height == height) return
        params.height = height
        cameraHost.layoutParams = params
    }

    private fun applyCompactEditorChrome(compact: Boolean) {
        val scanVisibility = if (compact) View.GONE else View.VISIBLE
        serverInput.visibility = scanVisibility
        connectionRow.visibility = scanVisibility
        cameraControlsRow.visibility = scanVisibility
        modeGroup.visibility = scanVisibility
        statusView.visibility = scanVisibility
        resultView.visibility = scanVisibility
    }

    private fun fillEditorFromResult(result: LabelScanResult) {
        suppressDateAutoAdvance = true
        try {
            codeInput.setText(result.codeNormalized)
            labelNameInput.setText(result.suggestedName)
            presentationInput.setText(result.presentation)
            visualColorInput.setText(result.dominantColor)
            lotInput.setText(result.lot)
            setDateParts(result.expiryDate, expiryDayInput, expiryMonthInput, expiryYearSpinner)
        } finally {
            suppressDateAutoAdvance = false
        }
        hideDatePad()
        refreshAttentionHighlights()
    }

    private fun buildEditedResult(): LabelScanResult {
        val code = codeInput.text.toString().trim().replace(" ", "").uppercase(Locale.ROOT)
        val name = labelNameInput.text.toString().trim().uppercase(Locale.ROOT)
        val presentation = presentationInput.text.toString().trim().uppercase(Locale.ROOT)
        val dominantColor = visualColorInput.text.toString().trim().lowercase(Locale.ROOT)
        val lot = if (lotOtherSideCheck.isChecked) "" else lotInput.text.toString().trim().uppercase(Locale.ROOT)
        val expiry = if (expiryOtherSideCheck.isChecked) "" else dateFromParts(expiryDayInput, expiryMonthInput, expiryYearSpinner)
        val sourceUpdates = mutableMapOf<String, String>()
        if (name != currentResult.suggestedName) sourceUpdates["suggestedName"] = "manual"
        if (lot != currentResult.lot) sourceUpdates["lot"] = if (lot.isBlank()) "manual_empty" else "manual"
        if (expiry != currentResult.expiryDate) sourceUpdates["expiry"] = if (expiry.isBlank()) "manual_empty" else "manual"
        if (presentation != currentResult.presentation) sourceUpdates["presentation"] = "manual"
        if (code != currentResult.codeNormalized) sourceUpdates["code"] = "manual"
        if (dominantColor != currentResult.dominantColor) sourceUpdates["color"] = "manual"
        val edited = currentResult.copy(
            codeRaw = code.ifBlank { currentResult.codeRaw },
            codeNormalized = code,
            gtin = currentResult.gtin.ifBlank { code.takeIf { it.length in 8..14 }.orEmpty() },
            suggestedName = name,
            presentation = presentation,
            dominantColor = dominantColor,
            lot = lot,
            expiryDate = expiry,
            mfgDate = "",
            sources = currentResult.sources + sourceUpdates,
            confidence = currentResult.confidence.coerceAtMost(0.92)
        )
        return edited.copy(missingFields = missingFieldsFor(edited))
    }

    private fun missingFieldsFor(result: LabelScanResult): List<String> {
        return buildList {
            if (result.codeNormalized.isBlank()) add("codigo")
            if (result.suggestedName.isBlank()) add("nombre")
            if (result.lot.isBlank() && !lotOtherSideCheck.isChecked) add("lote")
            if (result.expiryDate.isBlank() && !expiryOtherSideCheck.isChecked) add("vencimiento")
            if (result.presentation.isBlank()) add("formato")
        }
    }

    private fun suggestProductForEditor() {
        if (products.isEmpty()) {
            productSelector.setText(currentResult.suggestedName, false)
            productSelector.hint = "Escribe producto o crea en tablet despues"
            selectedProduct = null
            return
        }
        updateProductAdapter(filteredProductsFor("${currentResult.suggestedName} ${currentResult.ocrText}").take(30))
        val match = bestProductMatch(currentResult)
        if (match != null) {
            selectedProduct = match
            productSelector.setText(match.name, false)
            match.baseUnit.takeIf { it.isNotBlank() }?.let { baseUnitInput.setText(it) }
            productSelector.hint = "Producto sugerido"
        } else {
            productSelector.setText(currentResult.suggestedName, false)
            productSelector.hint = "Buscar o escribir producto nuevo"
        }
    }

    private fun bestProductMatch(result: LabelScanResult): Product? {
        val queryTokens = productTokens("${result.suggestedName} ${result.ocrText}")
        if (queryTokens.isEmpty()) return null
        return products
            .map { product ->
                product to scoreProductMatch(queryTokens, product, allowPartial = false)
            }
            .filter { it.second >= 24 }
            .maxByOrNull { it.second }
            ?.first
    }

    private fun filteredProductsFor(query: String): List<Product> {
        val queryTokens = productTokens(query)
        if (queryTokens.isEmpty()) return products.take(80)
        return products
            .map { it to scoreProductMatch(queryTokens, it, allowPartial = true) }
            .filter { it.second > 0 }
            .sortedByDescending { it.second }
            .map { it.first }
            .take(80)
    }

    private fun scoreProductMatch(queryTokens: Set<String>, product: Product, allowPartial: Boolean): Int {
        val productTokens = productTokens("${product.name} ${product.normalizedName}")
        if (productTokens.isEmpty()) return 0
        val wholeHits = productTokens.count { it in queryTokens }
        val prefixHits = if (allowPartial) {
            productTokens.count { productToken ->
                queryTokens.any { queryToken ->
                    queryToken.length >= 3 && productToken.startsWith(queryToken)
                }
            }
        } else 0
        val containedHits = productTokens.count { productToken ->
            productToken.length >= 5 && queryTokens.any { it == productToken }
        }
        return wholeHits * 30 + prefixHits * 12 + containedHits * 8
    }

    private fun productTokens(value: String): Set<String> {
        val stop = setOf("DE", "DEL", "LA", "EL", "LOS", "LAS", "CON", "SIN", "BOLSA", "CAJA", "PACK", "KG", "GR", "G", "LT", "ML", "UN")
        val cleanValue = Normalizer.normalize(value, Normalizer.Form.NFD)
            .replace("""\p{Mn}+""".toRegex(), "")
        return cleanValue.uppercase(Locale.ROOT)
            .replace(Regex("""[^A-Z0-9 ]"""), " ")
            .split(Regex("""\s+"""))
            .map { it.trim() }
            .filter { it.length >= 3 && it !in stop && !Regex("""^\d+$""").matches(it) }
            .toSet()
    }

    private fun PackageRule.withEditorNotes(): PackageRule {
        val flags = buildList {
            if (lotOtherSideCheck.isChecked) add("lote en otra cara")
            if (expiryOtherSideCheck.isChecked) add("vencimiento en otra cara")
        }
        if (flags.isEmpty()) return this
        val merged = listOf(notes, flags.joinToString("; ")).filter { it.isNotBlank() }.joinToString(" | ")
        return copy(notes = merged)
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
        if (result.dominantColor.isNotBlank()) lines += "Color: ${result.dominantColor}"
        lines += "Lote: ${result.lot.ifBlank { "pendiente" }}"
        lines += "Vencimiento: ${result.expiryDate.ifBlank { "pendiente" }}"
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

    private fun showToast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private fun setupAttentionHighlights() {
        val watchedInputs = listOf(
            productSelector,
            codeInput,
            labelNameInput,
            presentationInput,
            visualColorInput,
            lotInput,
            expiryDayInput,
            expiryMonthInput,
            packageQuantityInput
        )
        watchedInputs.forEach { input ->
            input.addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
                override fun afterTextChanged(s: Editable?) {
                    refreshAttentionHighlights()
                }
            })
        }
        listOf(lotOtherSideCheck, expiryOtherSideCheck).forEach { checkbox ->
            checkbox.setOnCheckedChangeListener { _, _ -> refreshAttentionHighlights() }
        }
        listOf(expiryYearSpinner).forEach { spinner ->
            spinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                    refreshAttentionHighlights()
                }

                override fun onNothingSelected(parent: AdapterView<*>?) {
                    refreshAttentionHighlights()
                }
            }
        }
        refreshAttentionHighlights()
    }

    private fun refreshAttentionHighlights() {
        val active = editorOpen
        markAttention(productSelector, active && productSelector.text.isBlank())
        markAttention(codeInput, active && codeInput.text.isBlank())
        markAttention(labelNameInput, active && labelNameInput.text.isBlank())
        markAttention(presentationInput, active && presentationInput.text.isBlank())
        markAttention(visualColorInput, active && visualColorInput.text.isBlank())
        markAttention(lotInput, active && !lotOtherSideCheck.isChecked && lotInput.text.isBlank())
        markAttention(expiryDayInput, active && !expiryOtherSideCheck.isChecked && expiryDayInput.text.isBlank())
        markAttention(expiryMonthInput, active && !expiryOtherSideCheck.isChecked && expiryMonthInput.text.isBlank())
        markAttention(expiryYearSpinner, active && !expiryOtherSideCheck.isChecked && yearIsPending(expiryYearSpinner))
        markAttention(packageQuantityInput, active && packageQuantityInput.text.isBlank())
    }

    private fun markAttention(view: View, needsAttention: Boolean) {
        val color = if (needsAttention) Color.rgb(31, 93, 111) else Color.TRANSPARENT
        view.setBackgroundColor(color)
        if (view is EditText) {
            view.setHintTextColor(if (needsAttention) Color.rgb(190, 238, 248) else Color.rgb(150, 163, 182))
        }
    }

    private fun editText(hintText: String): EditText {
        return EditText(this).apply {
            hint = hintText
            setSingleLine(false)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
            filters = arrayOf(uppercaseFilter())
            setPadding(dp(10), dp(8), dp(10), dp(8))
            setTextColor(Color.rgb(237, 243, 251))
            setHintTextColor(Color.rgb(150, 163, 182))
        }
    }

    private fun uppercaseFilter(): InputFilter {
        return InputFilter { source, start, end, _, _, _ ->
            source.subSequence(start, end).toString().uppercase(Locale.ROOT)
        }
    }

    private fun editorField(label: String, input: EditText, checkbox: CheckBox? = null): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(4), 0, dp(4))
            addView(TextView(this@MainActivity).apply {
                text = label
                setTextColor(Color.rgb(150, 163, 182))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            })
            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(input, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                addView(button("X") { clearAndFocus(input) }, LinearLayout.LayoutParams(dp(54), LinearLayout.LayoutParams.WRAP_CONTENT))
                checkbox?.let {
                    it.setTextColor(Color.rgb(203, 213, 225))
                    it.buttonTintList = ColorStateList.valueOf(Color.rgb(79, 140, 255))
                    addView(it, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
                }
            })
        }
    }

    private fun clearAndFocus(input: EditText) {
        if (input is AutoCompleteTextView) {
            input.setText("", false)
            selectedProduct = null
            updateProductAdapter(products.take(80))
        } else {
            input.setText("")
        }
        input.requestFocus()
        input.setSelection(input.text.length)
        if (input.inputType != InputType.TYPE_NULL) {
            input.postDelayed({
                getSystemService(InputMethodManager::class.java)?.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
            }, 80)
        }
        refreshAttentionHighlights()
    }

    private fun dateEditorField(label: String, day: EditText, month: EditText, year: Spinner, checkbox: CheckBox): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(4), 0, dp(4))
            val datePad = buildDateNumberPad()
            wireDateNumberPad(day, datePad, month)
            wireDateNumberPad(month, datePad, null)
            addView(TextView(this@MainActivity).apply {
                text = label
                setTextColor(Color.rgb(150, 163, 182))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            })
            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(day, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 0.8f))
                addView(month, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 0.8f))
                addView(year, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.2f))
                addView(button("X") {
                    day.setText("")
                    month.setText("")
                    year.setSelection(0)
                    hideDatePad()
                }, LinearLayout.LayoutParams(dp(54), LinearLayout.LayoutParams.WRAP_CONTENT))
                checkbox.setTextColor(Color.rgb(203, 213, 225))
                checkbox.buttonTintList = ColorStateList.valueOf(Color.rgb(79, 140, 255))
                addView(checkbox, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
            })
            addView(datePad, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        }
    }

    private fun datePartInput(hintText: String): EditText {
        return editText(hintText).apply {
            inputType = InputType.TYPE_NULL
            showSoftInputOnFocus = false
            setSingleLine(true)
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
                override fun afterTextChanged(s: Editable?) {
                    val value = s?.toString().orEmpty()
                    if (value.length > 2) {
                        val trimmed = value.take(2)
                        setText(trimmed)
                        setSelection(trimmed.length)
                        return
                    }
                }
            })
        }
    }

    private fun buildDateNumberPad(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            setPadding(0, dp(2), 0, dp(2))
            listOf(
                listOf("1", "2", "3", "4", "5"),
                listOf("6", "7", "8", "9", "0")
            ).forEach { row ->
                addView(LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    row.forEach { label ->
                        addView(datePadButton(label), LinearLayout.LayoutParams(0, dp(54), 1f).apply {
                            setMargins(dp(2), dp(2), dp(2), dp(2))
                        })
                    }
                }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
            }
            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                addView(datePadButton("Borrar"), LinearLayout.LayoutParams(0, dp(42), 1f).apply {
                    setMargins(dp(2), dp(2), dp(2), dp(2))
                })
                addView(datePadButton("OK"), LinearLayout.LayoutParams(0, dp(42), 1f).apply {
                    setMargins(dp(2), dp(2), dp(2), dp(2))
                })
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        }
    }

    private fun datePadButton(label: String): Button {
        return Button(this).apply {
            text = label
            isAllCaps = false
            minHeight = 0
            minimumHeight = 0
            setPadding(0, 0, 0, 0)
            setTextColor(Color.rgb(237, 243, 251))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, if (label.length == 1) 20f else 13f)
            backgroundTintList = ColorStateList.valueOf(Color.rgb(15, 75, 99))
            setOnClickListener {
                when (label) {
                    "Borrar" -> removeDateDigit()
                    "OK" -> hideDatePad()
                    else -> addDateDigit(label)
                }
            }
        }
    }

    private fun wireDateNumberPad(input: EditText, pad: LinearLayout, next: EditText?) {
        nextDateInput[input] = next
        datePadByInput[input] = pad
        input.isFocusable = true
        input.isFocusableInTouchMode = true
        input.isCursorVisible = false
        input.setOnClickListener { activateDateInput(input, clearValue = true) }
        input.setOnTouchListener { _, event ->
            if (event.action == MotionEvent.ACTION_UP) {
                activateDateInput(input, clearValue = true)
            }
            true
        }
        input.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) activateDateInput(input, clearValue = false)
        }
    }

    private fun activateDateInput(input: EditText, clearValue: Boolean) {
        val pad = datePadByInput[input] ?: return
        hideSystemKeyboard()
        if (activeDatePad != null && activeDatePad !== pad) activeDatePad?.visibility = View.GONE
        activeDateInput = input
        activeDatePad = pad
        pad.visibility = View.VISIBLE
        bottomActionBar.visibility = View.GONE
        if (clearValue) input.setText("")
        input.requestFocus()
        input.setSelection(input.text.length)
        scheduleDatePadAutoHide()
        scrollView.postDelayed({
            pad.requestRectangleOnScreen(android.graphics.Rect(0, 0, pad.width, pad.height), true)
        }, 80)
    }

    private fun addDateDigit(digit: String) {
        val input = activeDateInput ?: return
        val next = nextDateInput[input]
        val value = (input.text.toString() + digit).take(2)
        input.setText(value)
        input.setSelection(value.length)
        if (value.length >= 2 && next != null) {
            activateDateInput(next, clearValue = false)
        } else {
            scheduleDatePadAutoHide()
        }
    }

    private fun removeDateDigit() {
        val input = activeDateInput ?: return
        val value = input.text.toString().dropLast(1)
        input.setText(value)
        input.setSelection(value.length)
        scheduleDatePadAutoHide()
    }

    private fun hideDatePad() {
        datePadHandler.removeCallbacks(hideDatePadRunnable)
        activeDatePad?.visibility = View.GONE
        activeDatePad = null
        activeDateInput = null
        bottomActionBar.visibility = if (isLearningMode && editorOpen) View.VISIBLE else View.GONE
    }

    private fun scheduleDatePadAutoHide() {
        datePadHandler.removeCallbacks(hideDatePadRunnable)
        datePadHandler.postDelayed(hideDatePadRunnable, 2000)
    }

    private fun hideSystemKeyboard() {
        val target = currentFocus ?: window.decorView
        getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(target.windowToken, 0)
    }

    private fun yearSpinner(offsets: List<Int>): Spinner {
        val currentYear = LocalDate.now().year
        val values = listOf("A\u00f1o") + offsets.map { (currentYear + it).toString() }
        return Spinner(this).apply {
            adapter = object : ArrayAdapter<String>(this@MainActivity, android.R.layout.simple_spinner_item, values) {
                override fun getView(position: Int, convertView: View?, parent: android.view.ViewGroup): View {
                    return styleSpinnerText(super.getView(position, convertView, parent), dropdown = false)
                }

                override fun getDropDownView(position: Int, convertView: View?, parent: android.view.ViewGroup): View {
                    return styleSpinnerText(super.getDropDownView(position, convertView, parent), dropdown = true)
                }
            }
            setPopupBackgroundDrawable(ColorDrawable(Color.rgb(21, 31, 47)))
            backgroundTintList = ColorStateList.valueOf(Color.rgb(79, 140, 255))
        }
    }

    private fun styleSpinnerText(view: View, dropdown: Boolean): View {
        (view as? TextView)?.apply {
            setTextColor(Color.rgb(237, 243, 251))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(dp(8), dp(8), dp(8), dp(8))
            if (dropdown) setBackgroundColor(Color.rgb(21, 31, 47))
        }
        return view
    }

    private fun setDateParts(isoDate: String, day: EditText, month: EditText, year: Spinner) {
        val parsed = runCatching { LocalDate.parse(isoDate) }.getOrNull()
        if (parsed == null) {
            day.setText("")
            month.setText("")
            year.setSelection(0)
            return
        }
        day.setText(parsed.dayOfMonth.toString().padStart(2, '0'))
        month.setText(parsed.monthValue.toString().padStart(2, '0'))
        setSpinnerValue(year, parsed.year.toString())
    }

    private fun dateFromParts(day: EditText, month: EditText, year: Spinner): String {
        val dd = day.text.toString().trim().toIntOrNull()
        val mm = month.text.toString().trim().toIntOrNull()
        val yy = year.selectedItem?.toString()?.toIntOrNull()
        if (dd == null && mm == null && yy == null) return ""
        if (dd == null || mm == null || yy == null) return ""
        return runCatching { LocalDate.of(yy, mm, dd).toString() }.getOrDefault("")
    }

    private fun yearIsPending(year: Spinner): Boolean {
        val value = year.selectedItem?.toString().orEmpty()
        return value.toIntOrNull() == null
    }

    private fun formatQuantity(value: Double?): String {
        if (value == null || value.isNaN()) return ""
        return if (value == value.roundToInt().toDouble()) {
            value.roundToInt().toString()
        } else {
            "%.3f".format(Locale.ROOT, value).trimEnd('0').trimEnd('.')
        }
    }

    private fun setSpinnerValue(spinner: Spinner, value: String) {
        val adapter = spinner.adapter ?: return
        for (index in 0 until adapter.count) {
            if (adapter.getItem(index)?.toString() == value) {
                spinner.setSelection(index)
                return
            }
        }
        (adapter as? ArrayAdapter<String>)?.let {
            it.add(value)
            it.notifyDataSetChanged()
            spinner.setSelection(it.getPosition(value))
            return
        }
        spinner.setSelection(0)
    }

    private fun button(label: String, onClick: () -> Unit): Button {
        return Button(this).apply {
            text = label
            isAllCaps = false
            setTextColor(Color.rgb(237, 243, 251))
            backgroundTintList = ColorStateList.valueOf(Color.rgb(31, 41, 55))
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
                setTextColor(Color.rgb(150, 163, 182))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            })
            addView(view)
        }
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()
    }

    private fun statusBarHeight(): Int {
        val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
        return if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else 0
    }

    private fun navigationBarHeight(): Int {
        val resourceId = resources.getIdentifier("navigation_bar_height", "dimen", "android")
        return if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else 0
    }

    private fun estimateDominantColor(image: Image): String {
        val planes = image.planes
        if (planes.size < 3) return ""
        val yPlane = planes[0]
        val uPlane = planes[1]
        val vPlane = planes[2]
        val yBuffer = yPlane.buffer
        val uBuffer = uPlane.buffer
        val vBuffer = vPlane.buffer
        val buckets = mutableMapOf<String, Int>()
        val startX = image.width / 5
        val endX = image.width * 4 / 5
        val startY = image.height / 5
        val endY = image.height * 4 / 5
        val stepX = (image.width / 24).coerceAtLeast(12)
        val stepY = (image.height / 24).coerceAtLeast(12)
        for (y in startY until endY step stepY) {
            for (x in startX until endX step stepX) {
                val yIndex = y * yPlane.rowStride + x * yPlane.pixelStride
                val uvX = x / 2
                val uvY = y / 2
                val uIndex = uvY * uPlane.rowStride + uvX * uPlane.pixelStride
                val vIndex = uvY * vPlane.rowStride + uvX * vPlane.pixelStride
                if (yIndex >= yBuffer.limit() || uIndex >= uBuffer.limit() || vIndex >= vBuffer.limit()) continue
                val yValue = yBuffer.get(yIndex).toInt() and 0xff
                val uValue = (uBuffer.get(uIndex).toInt() and 0xff) - 128
                val vValue = (vBuffer.get(vIndex).toInt() and 0xff) - 128
                val r = (yValue + 1.402f * vValue).roundToInt().coerceIn(0, 255)
                val g = (yValue - 0.344136f * uValue - 0.714136f * vValue).roundToInt().coerceIn(0, 255)
                val b = (yValue + 1.772f * uValue).roundToInt().coerceIn(0, 255)
                val hsv = FloatArray(3)
                Color.RGBToHSV(r, g, b, hsv)
                val label = colorLabel(hsv[0], hsv[1], hsv[2])
                if (label.isNotBlank()) buckets[label] = (buckets[label] ?: 0) + 1
            }
        }
        return buckets.maxByOrNull { it.value }?.key.orEmpty()
    }

    private fun colorLabel(hue: Float, saturation: Float, value: Float): String {
        if (value < 0.18f) return "oscuro"
        if (saturation < 0.16f) return if (value > 0.78f) "blanco/gris claro" else "gris"
        return when {
            hue < 18f || hue >= 345f -> "rojo"
            hue < 45f -> "naranja"
            hue < 70f -> "amarillo"
            hue < 165f -> "verde"
            hue < 205f -> "turquesa"
            hue < 255f -> "azul"
            hue < 295f -> "morado"
            else -> "rosado"
        }
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
