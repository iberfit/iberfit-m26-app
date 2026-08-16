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
        versionCode = 265902
        versionName = "26.59.2-phone"
    }

    sourceSets {
        getByName("main") {
            kotlin.directories.addAll(
                listOf(
                    "src/main/java",
                    "../../android/heart-rate",
                    "../../android/runtime",
                    "../../android/ble",
                    "../../android/health-connect"
                )
            )
        }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.16.0")
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("com.google.android.gms:play-services-wearable:20.0.1")
}