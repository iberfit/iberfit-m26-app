// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "IBERFITNativeApple",
    platforms: [
        .iOS(.v17),
        .watchOS(.v10),
    ],
    products: [
        .library(name: "IBERFITWatchTelemetry", targets: ["IBERFITWatchTelemetry"]),
        .library(name: "IBERFITWebBridge", targets: ["IBERFITWebBridge"]),
    ],
    targets: [
        .target(
            name: "IBERFITWatchTelemetry",
            path: ".",
            sources: ["IBERFITWatchHealthKitTelemetry.swift", "IBERFITWatchRuntimeRelay.swift"]
        ),
        .target(
            name: "IBERFITWebBridge",
            path: ".",
            sources: ["IBERFITWebTelemetryBridge.swift", "IBERFITPhoneWatchRuntimeRelay.swift", "IBERFITIOSBleHeartRateRuntime.swift", "IBERFITIOSNativeTelemetryRuntime.swift"]
        ),
    ]
)
