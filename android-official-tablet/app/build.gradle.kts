plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "cl.jesunutri.capturer"
    compileSdk = 35

    val copyWebAssets by tasks.registering(Copy::class) {
        val projectRoot = rootProject.projectDir.parentFile
        from(projectRoot) {
            include(
                "index.html",
                "styles.css",
                "script.js",
                "browser-local-backend.js",
                "service-worker.js",
                "manifest.json",
                "logo.png",
                "icon-192.png",
                "icon-512.png",
                "vendor/supabase-js-2.min.js",
                "vendor/xlsx.full.min.js",
                "vendor/zxing-browser.min.js"
            )
        }
        into(layout.buildDirectory.dir("generated/assets/web/www"))
    }

    defaultConfig {
        applicationId = "cl.jesunutri.officialtablet"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/assets/web"))
}

tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }.configureEach {
    dependsOn("copyWebAssets")
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    val cameraxVersion = "1.4.2"

    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.camera:camera-core:$cameraxVersion")
    implementation("androidx.camera:camera-camera2:$cameraxVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraxVersion")
    implementation("androidx.camera:camera-view:$cameraxVersion")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
    implementation("com.google.mlkit:text-recognition:16.0.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.nanohttpd:nanohttpd:2.3.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
