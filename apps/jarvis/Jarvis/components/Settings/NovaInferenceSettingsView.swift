import SwiftUI

@MainActor
struct NovaInferenceSettingsView: View {
    @State private var provider = VoiceConfig.inferenceProvider
    @State private var model = VoiceConfig.inferenceModel
    @State private var effort = VoiceConfig.inferenceEffort
    @State private var catalog: NovaModelCatalog?
    @State private var providers: [NovaModelCatalog.Provider] = []
    @State private var loading = false
    @State private var loadError: String?
    @State private var chooseFirstModel = false
    @State private var refresh = UUID()
    private let fetchCatalog: (String) async throws -> NovaModelCatalog

    init(fetchCatalog: @escaping (String) async throws -> NovaModelCatalog = { try await NovaModelCatalog.load(provider: $0) }) {
        self.fetchCatalog = fetchCatalog
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Coding agent")
                .font(.system(size: 12, weight: .medium))
            Text("Uses your Nova connections. Speech provider settings are unchanged.")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)

            Picker("Provider", selection: Binding(get: { provider }, set: { changeProvider($0) })) {
                if !providers.contains(where: { $0.id == "supercode" }), provider != "supercode" {
                    Text("Supercode cloud").tag("supercode")
                }
                if !providers.contains(where: { $0.id == provider }) {
                    Text(provider == "supercode" ? "Supercode cloud" : "\(provider) (saved)").tag(provider)
                }
                ForEach(providers) { item in
                    Text(item.label).tag(item.id)
                }
            }

            Picker("Model", selection: Binding(get: { model }, set: { changeModel($0) })) {
                if model.isEmpty {
                    Text(provider == "supercode" ? "Server default" : "Choose a model").tag("")
                } else if selectedModel == nil {
                    Text("\(model) (unavailable)").tag(model)
                }
                ForEach(catalog?.provider == provider ? catalog?.models ?? [] : []) { item in
                    Text(item.label).tag(item.id)
                }
            }
            .disabled(loading || catalog?.provider != provider)

            if let selectedModel, !selectedModel.efforts.isEmpty || !effort.isEmpty {
                Picker("Reasoning effort", selection: Binding(get: { effort }, set: {
                    effort = $0
                    persist()
                })) {
                    Text("Model default").tag("")
                    if !effort.isEmpty && !selectedModel.efforts.contains(effort) {
                        Text("\(effort) (unavailable)").tag(effort)
                    }
                    ForEach(selectedModel.efforts, id: \.self) { value in
                        Text(value.capitalized).tag(value)
                    }
                }
                .disabled(loading)
            }

            HStack(spacing: 8) {
                if loading {
                    ProgressView().controlSize(.small)
                    Text("Loading models…")
                } else {
                    Button(loadError == nil ? "Refresh models" : "Retry") { refresh = UUID() }
                }
            }
            .font(.system(size: 11))

            if let message = loadError ?? selectionError {
                Text(message)
                    .font(.system(size: 11))
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .task(id: refresh) { await loadCatalog() }
    }

    private var selectedModel: NovaModelCatalog.Model? {
        guard catalog?.provider == provider else { return nil }
        return catalog?.models.first { $0.id == model }
    }

    private var selectionError: String? {
        guard let catalog, !loading else { return nil }
        guard catalog.provider == provider, catalog.providers.contains(where: { $0.id == provider }) else {
            return "Your saved provider is no longer connected. Reconnect it in Nova or choose another provider."
        }
        if model.isEmpty && provider == "supercode" { return nil }
        guard let selectedModel else {
            return "Your saved model is unavailable. Choose a model before sending a request."
        }
        if !effort.isEmpty && !selectedModel.efforts.contains(effort) {
            return "Your saved reasoning effort is unavailable. Choose an effort before sending a request."
        }
        return nil
    }

    private func changeProvider(_ value: String) {
        guard provider != value else { return }
        provider = value
        model = ""
        effort = ""
        chooseFirstModel = true
        persist()
        refresh = UUID()
    }

    private func changeModel(_ value: String) {
        guard let item = catalog?.models.first(where: { $0.id == value }) else { return }
        model = item.id
        effort = item.defaultEffort.flatMap { item.efforts.contains($0) ? $0 : nil } ?? ""
        persist()
    }

    private func persist() {
        VoiceConfig.configureInference(provider: provider, model: model, effort: effort)
    }

    private func loadCatalog() async {
        loading = true
        loadError = nil
        let requestedProvider = provider
        do {
            if providers.isEmpty && requestedProvider != "supercode" {
                let initial = try await fetchCatalog("supercode")
                guard !Task.isCancelled, requestedProvider == provider else { return }
                providers = initial.providers
            }
            let result = try await fetchCatalog(requestedProvider)
            guard !Task.isCancelled, requestedProvider == provider else { return }
            catalog = result
            providers = result.providers
            if result.provider == provider,
               result.providers.contains(where: { $0.id == provider }),
               chooseFirstModel,
               let first = result.models.first {
                changeModel(first.id)
                chooseFirstModel = false
            }
            loading = false
        } catch {
            guard !Task.isCancelled, requestedProvider == provider else { return }
            loadError = error.localizedDescription
            loading = false
        }
    }
}
