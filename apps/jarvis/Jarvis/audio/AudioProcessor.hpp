/*
 * Atoll (DynamicIsland)
 * Original work Copyright (C) 2026 ZephyrCodesStuff (https://github.com/ZephyrCodesStuff/rtaudio)
 * Modified work Copyright (C) 2026 Atoll Contributors
 *
 * Real-time audio processor using Accelerate framework for efficient RMS
 * and biquad filtering.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This file is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

#ifndef AUDIOPROCESSOR_HPP
#define AUDIOPROCESSOR_HPP

#include <Accelerate/Accelerate.h>
#include <atomic>

class AudioProcessor {
   private:
    static constexpr int kBlockSize = 512;
    static constexpr int kBands = 6;
    static constexpr float kAttack = 0.85f;   // fast rise
    static constexpr float kRelease = 0.40f;  // slower fall — more musical
    static constexpr float kGains[kBands] = { 3.0f, 4.5f, 6.0f, 9.0f, 14.0f, 24.0f };

    float sampleRate;
    int writePos = 0;
    float mono[kBlockSize] = {};
    float filtered[kBlockSize] = {};

    vDSP_biquad_Setup setups[kBands];
    alignas( 16 ) float delays[kBands][4] = {};

    float envelopes[kBands] = {};

    // Lock-free: audio thread writes, render thread reads
    // One atomic per band — fits in a cache line
    alignas( 64 ) std::atomic< float > bandParams[kBands] = {};

   public:
    explicit AudioProcessor( float sr = 48000.0f );
    ~AudioProcessor();

    // Called by CoreAudio — must be real-time safe (no alloc, no locks)
    void process( const float* __restrict__ buffer, int totalSamples );

    // Called by render thread — lock-free read
    float getBand( int i ) const;
    int getBandCount() const { return kBands; }

   private:
    enum class FilterType { LowPass, BandPass, HighPass };

    void processBlock();
    void setupBiquad( int idx, FilterType type, float freq, float q );
};

#endif  // AUDIOPROCESSOR_HPP
