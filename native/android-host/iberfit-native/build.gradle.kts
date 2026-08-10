plugins {
    id("com.android.library")
}

android {
    namespace = "cl.iberfit.nativebridge"
    compileSdk = 36

    defaultConfig {
        minSdk = 30
        consumerProguardFiles("consumer-rules.pro")
    }

    sourceSets {
        getByName("main") {
            java.srcDirs("../../android/wear", "../../android/ble")
            manifest.srcFile("src/main/AndroidManifest.xml")
        }
    }
}

dependencies {
    implementation("androidx.health:health-services-client:1.1.0-rc02")
}
