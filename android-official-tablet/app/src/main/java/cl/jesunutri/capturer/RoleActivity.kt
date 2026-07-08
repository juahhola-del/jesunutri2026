package cl.jesunutri.capturer

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity

class RoleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(32), dp(24), dp(32))
            setBackgroundColor(Color.rgb(9, 13, 20))
        }
        root.addView(TextView(this).apply {
            text = "Jesunutri"
            setTextColor(Color.WHITE)
            textSize = 28f
            gravity = Gravity.CENTER
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        })
        root.addView(TextView(this).apply {
            text = "Elige como usar este dispositivo"
            setTextColor(Color.rgb(203, 213, 225))
            textSize = 15f
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(24))
        })
        root.addView(primaryButton("Tablet oficial") {
            startActivity(Intent(this, TabletHostActivity::class.java))
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56)).apply {
            bottomMargin = dp(12)
        })
        root.addView(secondaryButton("Capturador de etiquetas") {
            startActivity(Intent(this, MainActivity::class.java))
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56)))
        root.addView(TextView(this).apply {
            text = "La tablet oficial instala la base local e importa Supabase. El capturador solo envia lecturas al dispositivo principal."
            setTextColor(Color.rgb(148, 163, 184))
            textSize = 13f
            gravity = Gravity.CENTER
            setPadding(0, dp(24), 0, 0)
        })
        setContentView(root)
    }

    private fun primaryButton(label: String, action: () -> Unit): Button {
        return Button(this).apply {
            text = label
            textSize = 16f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.rgb(37, 99, 235))
            setOnClickListener { action() }
        }
    }

    private fun secondaryButton(label: String, action: () -> Unit): Button {
        return Button(this).apply {
            text = label
            textSize = 16f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.rgb(30, 41, 59))
            setOnClickListener { action() }
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
