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
        versionCode = 265701
        versionName = "26.57.1-phone"
    }

    sourceSets {
        getByName("main") {
            kotlin.directories.addAll(
                listOf(
                    "src/main/java",
                    "../../android/runtime",
                    "../../android/ble"
                )
            )
        }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.16.0")
    implementation("com.google.android.gms:play-services-wearable:20.0.1")
}