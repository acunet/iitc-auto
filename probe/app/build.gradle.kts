plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "id.acunet.portalprobe"
    compileSdk = 36

    defaultConfig {
        applicationId = "id.acunet.portalprobe"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.1-probe"
    }

    // Dua runtime Android for Cars butuh artefak + minSdk yang beda:
    //  - projected (Android Auto, HP di-mirror)  -> app-projected, minSdk 24
    //  - automotive (AAOS di head unit)          -> app-automotive, minSdk 29
    // Menyatukan keduanya dalam satu varian bikin bentrok meta-data
    // CarAppMetadataHolderService.CAR_HARDWARE_MANAGER (dua nilai berbeda).
    flavorDimensions += "runtime"
    productFlavors {
        create("projected") {
            dimension = "runtime"
            minSdk = 24
        }
        create("automotive") {
            dimension = "runtime"
            minSdk = 29
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.car.app:app:1.7.0")
    "projectedImplementation"("androidx.car.app:app-projected:1.7.0")
    "automotiveImplementation"("androidx.car.app:app-automotive:1.7.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    testImplementation("junit:junit:4.13.2")
}
