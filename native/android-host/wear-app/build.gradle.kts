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
                    "../../android/heart-rate",
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

    // ExerciseClient public methods return Guava ListenableFuture. Health Services
    // keeps Guava as an implementation dependency, so the app must expose Guava
    // on its own compile classpath when it directly consumes those methods.
    implementation("com.google.guava:guava:32.0.1-android")

    implementation("androidx.webkit:webkit:1.16.0")
    implementation("com.google.android.gms:play-services-wearable:20.0.1")
}