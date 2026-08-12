plugins {
    id("com.android.application")
}

android {
    namespace = "cl.iberfit.m26.wear"
    compileSdk = 36

    defaultConfig {
        applicationId = "cl.iberfit.m26"
        minSdk = 30
        targetSdk = 36
        versionCode = 265702
        versionName = "26.57.1-wear"
    }

    sourceSets {
        getByName("main") {
            kotlin.directories.addAll(
                listOf(
                    "src/main/java",
                    "../../android/runtime",
                    "../../android/ble",
                    "../../android/wear"
                )
            )
        }
    }
}

dependencies {
    implementation("androidx.health:health-services-client:1.1.0-rc02")
    implementation("androidx.webkit:webkit:1.16.0")
    implementation("com.google.android.gms:play-services-wearable:20.0.1")
}