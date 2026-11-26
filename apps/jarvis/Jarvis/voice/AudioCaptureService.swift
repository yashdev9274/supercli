import AVFoundation
import Combine

func micDiagLog(_ message: String) {
    let line = message + "\n"
    if let handle = FileHandle(forWritingAtPath: "/tmp/mic_diag.log") {
        handle.seekToEndOfFile()
        handle.write(line.data(using: .utf8)!)
        try? handle.close()
    } else {
        try? line.data(using: .utf8)?.write(to: URL(fileURLWithPath: "/tmp/mic_diag.log"))
    }
}

class AudioCaptureService: NSObject, ObservableObject {
    private let audioEngine = AVAudioEngine()
    private var pcmBuffer: [Float] = []
    private let sampleRate: Double = 16000
    private let chunkDuration: TimeInterval = 4.0
    private var maxSamples: Int { Int(sampleRate * chunkDuration) }
    private var onChunk: ((Data) -> Void)?
    private var isCapturing = false
    private var diagChunkCount = 0

    /// Silence detection state for early cutoff
    private var silenceStart: Date?
    private let silenceThreshold: Float = 0.003
    private let silenceTimeout: TimeInterval = 1.0
    private var hasVoiceBeenDetected = false

    @Published var inputLevel: Float = 0

    /// macOS does not re-prompt once the user denies mic access; the only fix
    /// is enabling it in System Settings. Callers surface a "mic blocked" UI.
    var isMicPermissionDenied: Bool {
        AVAudioApplication.shared.recordPermission == .denied
    }

    func startContinuousCapture(onChunk: @escaping (Data) -> Void) {
        // TCC permission prompts must be requested on the main thread; off-main
        // requests are auto-denied with no prompt and no System Settings entry.
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.startContinuousCapture(onChunk: onChunk)
            }
            return
        }
        guard !isCapturing else { return }
        self.onChunk = onChunk
        isCapturing = true

        if AVAudioApplication.shared.recordPermission != .granted {
            micDiagLog("[MicDiag] requesting mic permission at capture start (status=\(AVAudioApplication.shared.recordPermission.rawValue))")
            AVAudioApplication.requestRecordPermission { [weak self] granted in
                micDiagLog("[MicDiag] capture-start request granted=\(granted)")
                DispatchQueue.main.async {
                    guard let self else { return }
                    if granted {
                        self.setupEngineAndStart()
                    } else {
                        self.isCapturing = false
                        micDiagLog("[MicDiag] mic denied, capture aborted")
                    }
                }
            }
            return
        }

        setupEngineAndStart()
    }

    private func setupEngineAndStart() {
        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        let downsampled = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: sampleRate,
            channels: 1,
            interleaved: false
        )!

        let converter = AVAudioConverter(from: recordingFormat, to: downsampled)!

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            guard let self, self.isCapturing else { return }

            var convertedBuffer = AVAudioPCMBuffer(
                pcmFormat: downsampled,
                frameCapacity: AVAudioFrameCount(Double(buffer.frameLength) * self.sampleRate / recordingFormat.sampleRate)
            )!

            var error: NSError?
            let status = converter.convert(to: convertedBuffer, error: &error) { inNumPackets, outStatus in
                outStatus.pointee = .haveData
                return buffer
            }

            guard status == .haveData else { return }

            if let channelData = convertedBuffer.floatChannelData?[0] {
                let frameLength = Int(convertedBuffer.frameLength)

                let rms = (0..<frameLength).reduce(Float(0)) { sum, i in
                    let sample = channelData[i]
                    return sum + sample * sample
                }
                DispatchQueue.main.async {
                    self.inputLevel = Float(sqrt(rms / Float(frameLength)))
                    if self.diagChunkCount < 5 && self.inputLevel > 0.0005 {
                        micDiagLog("[MicDiag] chunk \(self.diagChunkCount) inputLevel=\(String(format: "%.4f", self.inputLevel))")
                        self.diagChunkCount += 1
                    }
                }

                self.pcmBuffer.append(contentsOf: UnsafeBufferPointer(start: channelData, count: frameLength))

                if self.pcmBuffer.count >= self.maxSamples {
                    let chunk = Array(self.pcmBuffer.prefix(self.maxSamples))
                    self.pcmBuffer.removeFirst(self.maxSamples)

                    let wavData = self.encodeWAV(samples: chunk, sampleRate: self.sampleRate)
                    DispatchQueue.main.async {
                        self.onChunk?(wavData)
                    }
                }
            }
        }

        do {
            try audioEngine.start()
            micDiagLog("[MicDiag] engine started, inputFormat=\(recordingFormat) hwSampleRate=\(recordingFormat.sampleRate)")
        } catch {
            print("[AudioCaptureService] Failed to start engine: \(error)")
            isCapturing = false
        }
    }

    func startSingleCapture(duration: TimeInterval = 4.0, completion: @escaping (Data?) -> Void) {
        // TCC permission prompts must be requested on the main thread; off-main
        // requests are auto-denied with no prompt and no System Settings entry.
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.startSingleCapture(duration: duration, completion: completion)
            }
            return
        }
        if isCapturing {
            stopCapture()
        }

        if AVAudioApplication.shared.recordPermission != .granted {
            micDiagLog("[MicDiag] requesting mic permission at single capture start (status=\(AVAudioApplication.shared.recordPermission.rawValue))")
            AVAudioApplication.requestRecordPermission { [weak self] granted in
                micDiagLog("[MicDiag] single-capture request granted=\(granted)")
                DispatchQueue.main.async {
                    guard let self else { return }
                    if granted {
                        self.runSingleCapture(duration: duration, completion: completion)
                    } else {
                        micDiagLog("[MicDiag] mic denied, single capture aborted")
                        completion(nil)
                    }
                }
            }
            return
        }

        runSingleCapture(duration: duration, completion: completion)
    }

    private func runSingleCapture(duration: TimeInterval = 4.0, completion: @escaping (Data?) -> Void) {

        let maxSamplesForDuration = Int(sampleRate * duration)
        var buffer: [Float] = []
        var localSilenceStart: Date?
        var localHasVoice = false
        let minVoiceSamples = Int(sampleRate * 0.3) // need at least 0.3s of voice to avoid premature cutoff

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        let downsampled = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: sampleRate,
            channels: 1,
            interleaved: false
        )!

        let converter = AVAudioConverter(from: recordingFormat, to: downsampled)!
        var hasCompleted = false

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] convBuffer, _ in
            guard !hasCompleted else { return }

            var convertedBuffer = AVAudioPCMBuffer(
                pcmFormat: downsampled,
                frameCapacity: AVAudioFrameCount(Double(convBuffer.frameLength) * (self?.sampleRate ?? 16000) / recordingFormat.sampleRate)
            )!

            var error: NSError?
            converter.convert(to: convertedBuffer, error: &error) { _, outStatus in
                outStatus.pointee = .haveData
                return convBuffer
            }

            if let channelData = convertedBuffer.floatChannelData?[0] {
                let frames = Int(convertedBuffer.frameLength)
                buffer.append(contentsOf: UnsafeBufferPointer(start: channelData, count: frames))

                // Compute RMS for this chunk
                let rms = (0..<frames).reduce(Float(0)) { sum, i in
                    let s = channelData[i]
                    return sum + s * s
                }
                let level = sqrt(rms / Float(max(frames, 1)))

                // Silence detection: if voice was detected and now silence > threshold
                if level > (self?.silenceThreshold ?? 0.003) {
                    localHasVoice = true
                    localSilenceStart = nil
                } else if localHasVoice && buffer.count > minVoiceSamples {
                    if localSilenceStart == nil {
                        localSilenceStart = Date()
                    } else if Date().timeIntervalSince(localSilenceStart!) > (self?.silenceTimeout ?? 1.0) {
                        // User stopped speaking — cut early
                        hasCompleted = true
                        let wavData = self?.encodeWAV(samples: buffer, sampleRate: self?.sampleRate ?? 16000)
                        DispatchQueue.main.async {
                            self?.stopCapture()
                            completion(wavData)
                        }
                        return
                    }
                }

                if buffer.count >= maxSamplesForDuration {
                    hasCompleted = true
                    let chunk = Array(buffer.prefix(maxSamplesForDuration))
                    let wavData = self?.encodeWAV(samples: chunk, sampleRate: self?.sampleRate ?? 16000)
                    DispatchQueue.main.async {
                        self?.stopCapture()
                        completion(wavData)
                    }
                }
            }
        }

        do {
            try audioEngine.start()
        } catch {
            print("[AudioCaptureService] Failed to start engine: \(error)")
            completion(nil)
            return
        }

        DispatchQueue.global().asyncAfter(deadline: .now() + duration + 0.5) { [weak self] in
            guard !hasCompleted else { return }
            hasCompleted = true
            let wavData = buffer.isEmpty ? nil : self?.encodeWAV(samples: buffer, sampleRate: self?.sampleRate ?? 16000)
            DispatchQueue.main.async {
                self?.stopCapture()
                completion(wavData)
            }
        }
    }

    func stopCapture() {
        isCapturing = false
        audioEngine.stop()
        do {
            audioEngine.inputNode.removeTap(onBus: 0)
        } catch {
            // Tap may not have been installed
        }
        pcmBuffer.removeAll()
        inputLevel = 0
    }

    private func encodeWAV(samples: [Float], sampleRate: Double) -> Data {
        let intSamples = samples.map { max(-1.0, min(1.0, $0)) }
            .map { Int16($0 * Float(Int16.max)) }

        var data = Data()

        let fileSize: UInt32 = 36 + UInt32(intSamples.count * 2)
        let channels: UInt16 = 1
        let bitsPerSample: UInt16 = 16
        let byteRate = UInt32(sampleRate) * UInt32(channels) * UInt32(bitsPerSample / 8)
        let blockAlign = channels * (bitsPerSample / 8)
        let dataSize = UInt32(intSamples.count * 2)

        data.append(contentsOf: [0x52, 0x49, 0x46, 0x46])
        data.append(contentsOf: withUnsafeBytes(of: fileSize.littleEndian) { Array($0) })
        data.append(contentsOf: [0x57, 0x41, 0x56, 0x45])

        data.append(contentsOf: [0x66, 0x6D, 0x74, 0x20])
        data.append(contentsOf: withUnsafeBytes(of: UInt32(16).littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: UInt16(1).littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: channels.littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: UInt32(sampleRate).littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: byteRate.littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: blockAlign.littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: bitsPerSample.littleEndian) { Array($0) })

        data.append(contentsOf: [0x64, 0x61, 0x74, 0x61])
        data.append(contentsOf: withUnsafeBytes(of: dataSize.littleEndian) { Array($0) })

        for sample in intSamples {
            data.append(contentsOf: withUnsafeBytes(of: sample.littleEndian) { Array($0) })
        }

        return data
    }
}
