import SwiftUI
import IBERFITWebBridge

// QA ONLY. The isolated local tab has no server access. A separate opt-in
// Canary tab may open an authenticated HTTPS page and return local, sanitized
// HealthKit summaries. Neither tab uploads data or enables background reads.
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
            TabView {
                IBERFITHealthKitQAView(model: model)
                    .tabItem { Label("Salud local", systemImage: "heart.text.square") }
                IBERFITCanaryClientQAView()
                    .tabItem { Label("Cliente Canary", systemImage: "person.crop.circle") }
            }
                .onChange(of: phase) { _, newPhase in
                    // iOS permission sheet may transition to .inactive; only true
                    // background retires this one-shot HealthKit lease.
                    if newPhase == .background { model.invalidate() }
                }
        }
    }
}

@MainActor
private final class IBERFITHealthKitQAState: ObservableObject {
    @Published private(set) var status = "Sin lectura. Tus datos no salen del iPhone."
    @Published private(set) var isBusy = false
    @Published private(set) var rows: [IBERFITIOSHealthKitDailyVitalsReader.DailyVitals] = []
    @Published private(set) var workouts: [IBERFITLocalWorkout] = []
    @Published private(set) var workoutStatus = "Sin lectura de actividades."
    private let workoutReader = IBERFITIOSHealthKitWorkoutReader()

    private let reader = IBERFITIOSHealthKitDailyVitalsReader()
    private var generation: UInt64 = 0

    func readOnce() {
        guard !isBusy else { return }
        generation &+= 1
        let lease = generation
        rows = []
        isBusy = true
        status = "Solicitando permisos para pasos, sueño y frecuencia cardíaca en reposo…"
        reader.requestExplicitDailyAccess { [weak self] permission in
            Task { @MainActor [weak self] in
                guard let self, self.generation == lease else { return }
                switch permission {
                case .failure:
                    self.status = "No se pudo autorizar la lectura. Revisa Salud."
                    self.isBusy = false
                case .success:
                    self.status = "Leyendo pasos, sueño y frecuencia cardíaca en reposo autorizados…"
                    self.reader.readDailyOnce(days: 7) { [weak self] result in
                        Task { @MainActor [weak self] in
                            guard let self, self.generation == lease else { return }
                            self.isBusy = false
                            switch result {
                            case .failure:
                                self.status = "No se pudieron leer los datos autorizados. Puedes volver a intentarlo."
                            case .success(let newRows):
                                self.rows = newRows
                                self.status = newRows.isEmpty
                                    ? "Sin datos disponibles o permisos de lectura no concedidos."
                                    : (newRows.contains { $0.stepsReadFailed || $0.restingHeartRateReadFailed || $0.sleepReadFailed }
                                        ? "Lectura parcial: alguna métrica no está disponible. Los demás datos siguen siendo locales."
                                        : "Vista local de prueba. No sincronizada ni guardada en IBERFIT.")
                            }
                        }
                    }
                }
            }
        }
    }

    func readWorkoutsOnce() {
        guard !isBusy else { return }
        generation &+= 1
        let lease = generation
        workouts = []
        isBusy = true
        workoutStatus = "Solicitando lectura de entrenamientos en Apple Salud…"
        workoutReader.requestExplicitWorkoutAccess { [weak self] permission in
            Task { @MainActor [weak self] in
                guard let self, self.generation == lease else { return }
                guard case .success = permission else {
                    self.isBusy = false
                    self.workoutStatus = "No se completó la autorización. Revisa Salud."
                    return
                }
                self.workoutReader.readOnce { [weak self] result in
                    Task { @MainActor [weak self] in
                        guard let self, self.generation == lease else { return }
                        self.isBusy = false
                        switch result {
                        case .failure:
                            self.workoutStatus = "No se pudo consultar las actividades. Puedes reintentar."
                        case .success(let preview):
                            self.workouts = preview.workouts
                            self.workoutStatus = preview.mayHaveMore ? "Vista parcial: hasta 60 registros de los últimos 30 días." : (preview.workouts.isEmpty ? "Sin actividades disponibles o permiso de lectura no concedido." : "Vista local de los últimos 30 días. No sincronizada.")
                        }
                    }
                }
            }
        }
    }

    func invalidate() {
        generation &+= 1
        workoutReader.invalidate()
        workouts = []
        workoutStatus = "Vista local borrada."
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
                    Text("Solo leeremos tus pasos, sueño, frecuencia cardíaca en reposo y entrenamientos si autorizas cada lectura en iOS. Esta versión no conecta tu cuenta IBERFIT ni envía registros. Puedes borrar la vista cuando quieras.")
                        .font(.system(size: 15))
                        .foregroundStyle(cream.opacity(0.75))
                    Button(action: model.readOnce) {
                        HStack {
                            Image(systemName: "heart.text.square")
                            Text(model.isBusy ? "Consultando Salud…" : "Consultar Salud")
                        }
                        .frame(maxWidth: .infinity, minHeight: 52)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(green)
                    .fontWeight(.semibold)
                    .background(gold, in: RoundedRectangle(cornerRadius: 13))
                    .disabled(model.isBusy)
                    .accessibilityHint("Solicita permisos de lectura a Apple Salud y muestra pasos, sueño y frecuencia cardíaca en reposo localmente")
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
                                VStack(alignment: .trailing, spacing: 4) {
                                    Text(row.steps.map { $0.formatted() + " pasos" } ?? (row.stepsReadFailed ? "Pasos: error de lectura" : "Pasos: sin dato"))
                                    Text(row.restingHeartRate.map { "FC en reposo: \($0) lpm" } ?? (row.restingHeartRateReadFailed ? "FC en reposo: error de lectura" : "FC en reposo: sin dato"))
                                    Text(row.sleepMinutes.map { "Sueño: \($0 / 60) h \($0 % 60) min" } ?? (row.sleepReadFailed ? "Sueño: error de lectura" : "Sueño: sin dato"))
                                        .font(.caption)
                                }.fontWeight(.semibold)
                            }
                            .foregroundStyle(cream)
                            .padding(.vertical, 7)
                            Divider().overlay(gold.opacity(0.25))
                        }
                    }
                    Button("Consultar entrenamientos de Apple Salud", action: model.readWorkoutsOnce)
                        .foregroundStyle(gold)
                        .disabled(model.isBusy)
                    Text(model.workoutStatus).foregroundStyle(cream).font(.caption)
                    ForEach(model.workouts) { workout in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(["running":"Carrera", "cycling":"Ciclismo", "walking":"Caminata", "strength":"Fuerza", "hiit":"HIIT", "swimming":"Natación"][workout.sport] ?? "Otro entrenamiento").font(.headline)
                            Text(workout.start.formatted(date: .abbreviated, time: .shortened))
                            Text("Duración activa: \(Int(workout.activeSeconds / 60)) min")
                            if let distance = workout.distanceMeters {
                                Text("Distancia: \((distance / 1000).formatted(.number.precision(.fractionLength(0...2)))) km")
                            }
                        }.foregroundStyle(cream)
                        Divider().overlay(gold.opacity(0.25))
                    }
                    Button("Borrar vista local", action: model.invalidate)
                        .foregroundStyle(gold)
                        .padding(.top, 12)
                    Text("QA · Sueño por día civil. Sin sincronización ni identificación del reloj")
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
