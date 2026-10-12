plugins {
    id("com.android.application")
}

android {
    namespace = "cl.iberfit.m26.phone"
    compileSdk = 36

    defaultConfig {
        applicationId = "cl.iberfit.m26"
        minSdk = 26
        targetSdk = 36
        versionCode = 265903
        versionName = "26.59.3-phone"
    }

    // Release signing is supplied ONLY by the restricted GitHub environment.
    // Empty/missing credentials continue to allow CI compilation of unsigned
    // binaries, but the publication workflow refuses to ship them.
    val signingReady = listOf(
        "IBERFIT_ANDROID_RELEASE_KEYSTORE_PATH",
        "IBERFIT_ANDROID_RELEASE_STORE_PASSWORD",
        "IBERFIT_ANDROID_RELEASE_KEY_ALIAS",
        "IBERFIT_ANDROID_RELEASE_KEY_PASSWORD"
    ).all { !System.getenv(it).isNullOrBlank() }
    signingConfigs {
        if (signingReady) {
            create("iberfitProduction") {
                storeFile = file(System.getenv("IBERFIT_ANDROID_RELEASE_KEYSTORE_PATH"))
                storePassword = System.getenv("IBERFIT_ANDROID_RELEASE_STORE_PASSWORD")
                keyAlias = System.getenv("IBERFIT_ANDROID_RELEASE_KEY_ALIAS")
                keyPassword = System.getenv("IBERFIT_ANDROID_RELEASE_KEY_PASSWORD")
                enableV1Signing = false
                enableV2Signing = true
            }
        }
    }

    // Isolate sideloaded Canary DEBUG builds from a possible installed IBERFIT release.
    // Do not change the production applicationId or signing identity.
    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".qa"
        }
        getByName("release") {
            isDebuggable = false
            isMinifyEnabled = false
            if (signingReady) signingConfig = signingConfigs.getByName("iberfitProduction")
        }
    }

    sourceSets {
        getByName("main") {
            kotlin.directories.addAll(
                listOf(
                    "src/main/java",
                    "../../android/heart-rate",
                    "../../android/runtime",
                    "../../android/ble",
                    "../../android/health-connect",
                    "../../android-health-connect/healthconnect/src/main/java"
                )
            )
        }
    }
}

dependencies {
    implementation("androidx.activity:activity:1.10.1")
    implementation("androidx.fragment:fragment:1.9.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.webkit:webkit:1.16.0")
    testImplementation("junit:junit:4.13.2")
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("com.google.android.gms:play-services-wearable:20.0.1")
}