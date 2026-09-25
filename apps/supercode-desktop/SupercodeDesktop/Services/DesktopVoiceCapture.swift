import AVFoundation
import Foundation

final class DesktopVoiceCapture {
    private let audioEngine = AVAudioEngine()
    private let sampleRate = 16_000.0
    private var tapInstalled = false

    var permissionDenied: Bool {
        AVAudioApplication.shared.recordPermission == .denied
    }

    func requestPermission() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            return true
        case .denied:
            return false
        case .undetermined:
            return await withCheckedContinuation { continuation in
                DispatchQueue.main.async {
                    AVAudioApplication.requestRecordPermission { granted in
                        continuation.resume(returning: granted)
                    }
                }
            }
        @unknown default:
            return false
        }
    }

    func start(
        maximumDuration: TimeInterval = 20,
        silenceDuration: TimeInterval = 2,
        onLevel: @escaping (Float) -> Void,
        onPartialAudio: @escaping (Data) -> Void = { _ in },
        completion: @escaping (Data?) -> Void
    ) throws {
        stop()

        let inputNode = audioEngine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0,
              let outputFormat = AVAudioFormat(
                commonFormat: .pcmFormatFloat32,
                sampleRate: sampleRate,
                channels: 1,
                interleaved: false
              ),
              let converter = AVAudioConverter(from: inputFormat, to: outputFormat) else {
            throw VoiceCaptureError.unavailableInput
        }

        let maximumSamples = Int(sampleRate * maximumDuration)
        let minimumSpeechSamples = Int(sampleRate * 0.25)
        let silenceThreshold: Float = 0.003
        let lock = NSLock()
        var samples: [Float] = []
        var heardSpeech = false
        var silenceStartedAt: Date?
        var completed = false
        let partialIntervalSamples = Int(sampleRate * 1.25)
        var nextPartialSampleCount = partialIntervalSamples

        func finish(_ data: Data?) {
            lock.lock()
            guard !completed else {
                lock.unlock()
                return
            }
            completed = true
            lock.unlock()
            DispatchQueue.main.async { [weak self] in
                self?.stop()
                completion(data)
            }
        }

        inputNode.installTap(onBus: 0, bufferSize: 1_024, format: inputFormat) { buffer, _ in
            guard let converted = AVAudioPCMBuffer(
                pcmFormat: outputFormat,
                frameCapacity: AVAudioFrameCount(
                    Double(buffer.frameLength) * self.sampleRate / inputFormat.sampleRate
                )
            ) else { return }

            var conversionError: NSError?
            let status = converter.convert(to: converted, error: &conversionError) { _, outputStatus in
                outputStatus.pointee = .haveData
                return buffer
            }
            guard status == .haveData, let channel = converted.floatChannelData?[0] else { return }

            let frameCount = Int(converted.frameLength)
            guard frameCount > 0 else { return }
            let chunk = Array(UnsafeBufferPointer(start: channel, count: frameCount))
            let rms = sqrt(chunk.reduce(Float(0)) { $0 + ($1 * $1) } / Float(frameCount))
            DispatchQueue.main.async { onLevel(rms) }

            lock.lock()
            guard !completed else {
                lock.unlock()
                return
            }
            samples.append(contentsOf: chunk)
            if rms > silenceThreshold {
                heardSpeech = true
                silenceStartedAt = nil
            } else if heardSpeech && samples.count >= minimumSpeechSamples {
                if let silenceStartedAt, Date().timeIntervalSince(silenceStartedAt) >= silenceDuration {
                    let audio = Self.encodeWAV(samples: samples, sampleRate: self.sampleRate)
                    lock.unlock()
                    finish(audio)
                    return
                }
                if silenceStartedAt == nil { silenceStartedAt = Date() }
            }
            var partialAudio: Data?
            if heardSpeech, samples.count >= nextPartialSampleCount {
                partialAudio = Self.encodeWAV(samples: samples, sampleRate: self.sampleRate)
                nextPartialSampleCount = samples.count + partialIntervalSamples
            }
            if samples.count >= maximumSamples {
                let audio = heardSpeech
                    ? Self.encodeWAV(samples: Array(samples.prefix(maximumSamples)), sampleRate: self.sampleRate)
                    : nil
                lock.unlock()
                finish(audio)
                return
            }
            lock.unlock()
            if let partialAudio {
                DispatchQueue.main.async { onPartialAudio(partialAudio) }
            }
        }
        tapInstalled = true
        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            stop()
            throw error
        }

        DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + maximumDuration + 0.25) {
            lock.lock()
            let audio = heardSpeech && !samples.isEmpty
                ? Self.encodeWAV(samples: samples, sampleRate: self.sampleRate)
                : nil
            lock.unlock()
            finish(audio)
        }
    }

    func stop() {
        audioEngine.stop()
        if tapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
    }

    static func encodeWAV(samples: [Float], sampleRate: Double) -> Data {
        let pcm = samples.map { Int16(max(-1, min(1, $0)) * Float(Int16.max)) }
        let channels: UInt16 = 1
        let bitsPerSample: UInt16 = 16
        let dataSize = UInt32(pcm.count * MemoryLayout<Int16>.size)
        let byteRate = UInt32(sampleRate) * UInt32(channels) * UInt32(bitsPerSample / 8)
        let blockAlign = channels * (bitsPerSample / 8)
        var data = Data()

        data.append(contentsOf: Array("RIFF".utf8))
        append(UInt32(36) + dataSize, to: &data)
        data.append(contentsOf: Array("WAVEfmt ".utf8))
        append(UInt32(16), to: &data)
        append(UInt16(1), to: &data)
        append(channels, to: &data)
        append(UInt32(sampleRate), to: &data)
        append(byteRate, to: &data)
        append(blockAlign, to: &data)
        append(bitsPerSample, to: &data)
        data.append(contentsOf: Array("data".utf8))
        append(dataSize, to: &data)
        for sample in pcm { append(sample, to: &data) }
        return data
    }

    private static func append<T: FixedWidthInteger>(_ value: T, to data: inout Data) {
        withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
    }
}

enum VoiceCaptureError: LocalizedError {
    case unavailableInput

    var errorDescription: String? {
        "No microphone input is available."
    }
}
