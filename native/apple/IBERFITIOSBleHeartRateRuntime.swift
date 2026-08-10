#if canImport(CoreBluetooth) && canImport(WebKit) && os(iOS)
import CoreBluetooth
import Foundation

final class IBERFITIOSBleHeartRateRuntime: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    private static let heartRateService = CBUUID(string: "180D")
    private static let heartRateMeasurement = CBUUID(string: "2A37")

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var active = false
    private var paused = false
    var onSample: (([String: Any]) -> Void)?

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    func start() {
        active = true
        paused = false
        if central.state == .poweredOn {
            central.scanForPeripherals(withServices: [Self.heartRateService])
        }
    }

    func pause() { paused = true }
    func resume() { paused = false }

    func stop() {
        active = false
        paused = false
        central.stopScan()
        if let peripheral { central.cancelPeripheralConnection(peripheral) }
        peripheral = nil
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if active && central.state == .poweredOn {
            central.scanForPeripherals(withServices: [Self.heartRateService])
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String : Any],
        rssi RSSI: NSNumber
    ) {
        guard active, self.peripheral == nil else { return }
        self.peripheral = peripheral
        peripheral.delegate = self
        central.stopScan()
        central.connect(peripheral)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([Self.heartRateService])
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil else { return }
        peripheral.services?.filter { $0.uuid == Self.heartRateService }.forEach {
            peripheral.discoverCharacteristics([Self.heartRateMeasurement], for: $0)
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        guard error == nil else { return }
        service.characteristics?.filter { $0.uuid == Self.heartRateMeasurement }.forEach {
            peripheral.setNotifyValue(true, for: $0)
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard active, !paused, error == nil,
              characteristic.uuid == Self.heartRateMeasurement,
              let data = characteristic.value else { return }
        let bytes = [UInt8](data)
        guard !bytes.isEmpty else { return }
        let flags = bytes[0]
        var offset = 1
        let bpm: Int
        if flags & 0x01 != 0 {
            guard bytes.count >= 3 else { return }
            bpm = Int(bytes[1]) | (Int(bytes[2]) << 8)
            offset = 3
        } else {
            guard bytes.count >= 2 else { return }
            bpm = Int(bytes[1])
            offset = 2
        }
        guard (25...240).contains(bpm) else { return }
        if flags & 0x08 != 0 { offset += 2 }

        var rr: [Double] = []
        if flags & 0x10 != 0 {
            while bytes.count >= offset + 2 && rr.count < 24 {
                let raw = Int(bytes[offset]) | (Int(bytes[offset + 1]) << 8)
                offset += 2
                let ms = Double(raw) * 1000.0 / 1024.0
                if (250...2500).contains(ms) { rr.append(ms) }
            }
        }
        onSample?([
            "type": "sample",
            "provider": "ble_direct",
            "heartRateBpm": bpm,
            "rrIntervalsMs": rr,
            "quality": "alta",
            "recordedAt": ISO8601DateFormatter().string(from: Date()),
        ])
    }
}
#endif
