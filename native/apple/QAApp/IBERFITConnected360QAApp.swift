import SwiftUI
import IBERFITWebBridge

// QA ONLY. This standalone iPhone target intentionally has no production
// Supabase URL, app session, WebView bridge, or background health capability.
// A Release configuration must never produce a distributable app.
#if !DEBUG
#error("IBERFIT Connected360 QA cannot be built for distribution.")
#endif

@main
struct IBERFITConnected360QAApp: App {
    @Environment(\.scenePhase) private var phase
    @StateObject private var model = IBERFITHealthKitQAState()

    var body: some Scene {
        WindowGroup {
            IBERFITHealthKitQAView(model: model)
                .onChange(of: phase) { _, newPhase in
                    if newPhase != .active { model.invalidate() }
                }
        }
    }
}

@MainActor
private final class IBERFITHealthKitQAState: ObservableObject {
    @Published private(set) var status = "Sin lectura. Tus datos no salen del iPhone."
    @Published private(set) var isBusy = false
    @Published private(set) var rows: [IBERFITIOSHealthKitDailyReader.DailySteps] = []

    private let reader = IBERFITIOSHealthKitDailyReader()
    private var generation: UInt64 = 0

    func readOnce() {
        guard !isBusy else { return }
        generation &+= 1
        let lease = generation
        rows = []
        isBusy = true
        status = "Solicitando permiso de lectura a Salud…"
        reader.requestExplicitStepsAccess { [weak self] permission in
            Task { @MainActor [weak self] in
                guard let self, self.generation == lease else { return }
                switch permission {
                case .failure:
                    self.status = "No se pudo autorizar la lectura. Revisa Salud."
                    self.isBusy = false
                case .success:
                    self.status = "Leyendo pasos autorizados de los últimos siete días…"
                    self.reader.readStepsOnce(days: 7) { [weak self] result in
                        Task { @MainActor [weak self] in
                            guard let self, self.generation == lease else { return }
                            self.isBusy = false
                            switch result {
                            case .failure:
                                self.status = "No se pudieron leer los pasos. Puedes volver a intentarlo."
                            case .success(let newRows):
                                self.rows = newRows
                                self.status = newRows.isEmpty
                                    ? "Sin pasos disponibles o permiso de lectura no concedido."
                                    : "Vista local de prueba. No sincronizada ni guardada en IBERFIT."
                            }
                        }
                    }
                }
            }
        }
    }

    func invalidate() {
        generation &+= 1
        reader.revokeLocalReadApproval()
        rows = []
        isBusy = false
        status = "Vista local borrada. Tus datos no se han enviado."
    }
}

private struct IBERFITHealthKitQAView: View {
    @ObservedObject var model: IBERFITHealthKitQAState

    private let green = Color(red: 0.055, green: 0.13, blue: 0.12)
    private let cream = Color(red: 0.95, green: 0.92, blue: 0.85)
    private let gold = Color(red: 0.73, green: 0.60, blue: 0.36)

    var body: some View {
        ZStack {
            green.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text("IBERFIT")
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .tracking(3)
                        .foregroundStyle(gold)
                    Text("Salud · iPhone")
                        .font(.system(size: 32, weight: .semibold))
                        .foregroundStyle(cream)
                    Text("Prueba privada de conexión con Apple Salud")
                        .font(.system(size: 16))
                        .foregroundStyle(cream.opacity(0.86))
                    Text("Solo leeremos tus pasos si lo autorizas en iOS. Esta versión no conecta tu cuenta IBERFIT ni envía registros. Puedes borrar la vista cuando quieras.")
                        .font(.system(size: 15))
                        .foregroundStyle(cream.opacity(0.75))
                    Button(action: model.readOnce) {
                        HStack {
                            Image(systemName: "heart.text.square")
                            Text(model.isBusy ? "Consultando Salud…" : "Consultar pasos en Salud")
                        }
                        .frame(maxWidth: .infinity, minHeight: 52)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(green)
                    .fontWeight(.semibold)
                    .background(gold, in: RoundedRectangle(cornerRadius: 13))
                    .disabled(model.isBusy)
                    .accessibilityHint("Solicita permiso de lectura a Apple Salud y muestra los pasos localmente")
                    Text(model.status)
                        .foregroundStyle(cream)
                        .font(.system(size: 14))
                        .accessibilityAddTraits(.updatesFrequently)
                    if !model.rows.isEmpty {
                        Text("Últimos días con registros")
                            .font(.headline)
                            .foregroundStyle(cream)
                        ForEach(model.rows, id: \.date) { row in
                            HStack {
                                Text(row.date)
                                Spacer()
                                Text(row.steps.formatted() + " pasos").fontWeight(.semibold)
                            }
                            .foregroundStyle(cream)
                            .padding(.vertical, 7)
                            Divider().overlay(gold.opacity(0.25))
                        }
                    }
                    Button("Borrar vista local", action: model.invalidate)
                        .foregroundStyle(gold)
                        .padding(.top, 12)
                    Text("QA · Sin sincronización automática ni verificación del origen físico del reloj")
                        .font(.caption)
                        .foregroundStyle(cream.opacity(0.65))
                }
                .padding(24)
                .frame(maxWidth: 580, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
        }
    }
}
